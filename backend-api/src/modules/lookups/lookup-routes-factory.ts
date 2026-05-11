import type { FastifyPluginAsync } from 'fastify'

/**
 * V3.5 Stories 5.2-5.4: factory generica de rotas CRUD para Department/Shift/Union.
 *
 * Cada lookup expõe:
 *   GET    /        — lista + _count.employees
 *   POST   /        — cria manual (importedBy=MANUAL)
 *   PATCH  /:id     — edita
 *   DELETE /:id     — soft-delete (active=false)
 *   POST   /backfill — popula employee.<fk> a partir do campo string legado
 *
 * Param `legacyField` indica o nome da coluna string no Employee
 * (department, shift ou unionName).
 * Param `fkField` indica o nome da FK no Employee (departmentId, shiftId, unionId).
 */
export interface LookupConfig {
  /** Nome da tabela no Prisma client (department | shift | union). */
  model: 'department' | 'shift' | 'union'
  /** Nome da coluna string no Employee (department | shift | unionName). */
  legacyField: string
  /** Nome da FK no Employee (departmentId | shiftId | unionId). */
  fkField: string
  /** Action do AuditLog para o backfill. */
  auditAction: string
  /** Campos extra suportados em POST/PATCH (alem de name e active). */
  extraFields?: string[]
}

export function buildLookupRoutes(config: LookupConfig): FastifyPluginAsync {
  return async (fastify) => {
    const model = (fastify.prisma as any)[config.model]

    fastify.get('/', { onRequest: [fastify.requireAuth] }, async (request) => {
      const { tenantId } = request.user as { tenantId: string }
      const items = await model.findMany({
        where: { tenantId },
        include: { _count: { select: { employees: true } } },
        orderBy: { name: 'asc' },
      })
      return { data: items, error: null }
    })

    fastify.post('/', {
      onRequest: [fastify.requireAuth, fastify.requireAdmin],
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            ...((config.extraFields ?? []).reduce((acc, f) => ({ ...acc, [f]: { type: 'string', maxLength: 200 } }), {})),
          },
        },
      },
    }, async (request, reply) => {
      const { tenantId } = request.user as { tenantId: string }
      const body = request.body as Record<string, string>
      try {
        const data: Record<string, unknown> = { tenantId, name: body.name.trim(), importedBy: 'MANUAL' }
        for (const f of config.extraFields ?? []) {
          if (body[f] !== undefined) data[f] = body[f].trim() || null
        }
        const created = await model.create({ data })
        return reply.code(201).send({ data: created, error: null })
      } catch (err: any) {
        if (err?.code === 'P2002') {
          return reply.code(409).send({ data: null, error: { code: 'DUPLICATE', message: 'Ja existe um registro com esse nome neste tenant.' } })
        }
        throw err
      }
    })

    fastify.patch('/:id', {
      onRequest: [fastify.requireAuth, fastify.requireAdmin],
      schema: {
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            active: { type: 'boolean' },
            ...((config.extraFields ?? []).reduce((acc, f) => ({ ...acc, [f]: { type: 'string', maxLength: 200 } }), {})),
          },
        },
      },
    }, async (request, reply) => {
      const { tenantId } = request.user as { tenantId: string }
      const { id } = request.params as { id: string }
      const existing = await model.findFirst({ where: { id, tenantId } })
      if (!existing) return reply.code(404).send({ data: null, error: { code: 'NOT_FOUND', message: 'Nao encontrado.' } })
      const body = request.body as Record<string, unknown>
      const data: Record<string, unknown> = {}
      if (typeof body.name === 'string') data.name = body.name.trim()
      if (typeof body.active === 'boolean') data.active = body.active
      for (const f of config.extraFields ?? []) {
        if (body[f] !== undefined) data[f] = String(body[f]).trim() || null
      }
      const updated = await model.update({ where: { id: existing.id }, data })
      return reply.send({ data: updated, error: null })
    })

    fastify.delete('/:id', { onRequest: [fastify.requireAuth, fastify.requireAdmin] }, async (request, reply) => {
      const { tenantId } = request.user as { tenantId: string }
      const { id } = request.params as { id: string }
      const existing = await model.findFirst({ where: { id, tenantId } })
      if (!existing) return reply.code(404).send({ data: null, error: { code: 'NOT_FOUND', message: 'Nao encontrado.' } })
      const updated = await model.update({ where: { id: existing.id }, data: { active: false } })
      return reply.send({ data: updated, error: null })
    })

    fastify.post('/backfill', { onRequest: [fastify.requireAuth, fastify.requireAdmin] }, async (request, reply) => {
      const { tenantId, userId } = request.user as { tenantId: string; userId: string }
      const employees = await fastify.prisma.employee.findMany({
        where: {
          tenantId,
          [config.legacyField]: { not: null },
          [config.fkField]: null,
        },
        select: { id: true, [config.legacyField]: true },
      })
      let updated = 0
      const createdNames = new Set<string>()
      for (const e of employees as any[]) {
        const rawName = e[config.legacyField]
        if (!rawName) continue
        const name = String(rawName).trim()
        if (!name) continue
        let lookup = await model.findFirst({
          where: { tenantId, name: { equals: name, mode: 'insensitive' } },
          select: { id: true },
        })
        if (!lookup) {
          try {
            lookup = await model.create({ data: { tenantId, name, importedBy: 'AUTO_TIRVU' }, select: { id: true } })
            createdNames.add(name.toLowerCase())
          } catch (err: any) {
            if (err?.code === 'P2002') {
              lookup = await model.findFirst({
                where: { tenantId, name: { equals: name, mode: 'insensitive' } },
                select: { id: true },
              })
            } else { throw err }
          }
        }
        if (!lookup) continue
        await fastify.prisma.employee.update({
          where: { id: e.id },
          data: { [config.fkField]: lookup.id },
        })
        updated++
      }
      await fastify.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: config.auditAction,
          resourceType: config.model.toUpperCase(),
          resourceId: '00000000-0000-0000-0000-000000000000',
          newData: { totalCandidates: employees.length, updated, createdLookups: createdNames.size } as never,
        },
      }).catch(() => { /* nao trava */ })
      return reply.send({ data: { totalCandidates: employees.length, updated, createdLookups: createdNames.size }, error: null })
    })
  }
}
