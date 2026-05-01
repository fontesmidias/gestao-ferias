import { FastifyPluginAsync } from 'fastify'
import { parseISO, startOfDay } from 'date-fns'

const tenantHolidays: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/tenant-holidays?year=2026
  // Retorna lista consolidada (nacionais + estaduais via UF + overrides manuais)
  fastify.get('/', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          year: { type: 'integer', minimum: 1900, maximum: 2100 }
        }
      }
    }
  }, async (request) => {
    const { tenantId } = request.user as any
    const { year } = request.query as { year?: number }
    const targetYear = year ?? new Date().getFullYear()

    const resolved = await fastify.holidayResolver.getHolidays({ tenantId, year: targetYear })

    const overrides = await fastify.prisma.tenantHoliday.findMany({
      where: {
        tenantId,
        date: {
          gte: new Date(`${targetYear}-01-01`),
          lte: new Date(`${targetYear}-12-31`)
        }
      }
    })
    const overrideMap = new Map(overrides.map(o => [
      o.date.toISOString().slice(0, 10),
      o
    ]))

    return resolved.map(h => {
      const ov = overrideMap.get(h.date)
      return {
        date: h.date,
        name: h.name,
        source: h.source,
        isOverride: !!ov,
        overrideId: ov?.id ?? null,
        overrideAction: ov?.action ?? null
      }
    })
  })

  // GET /api/v1/tenant-holidays/overrides — lista apenas manual overrides do tenant
  fastify.get('/overrides', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin]
  }, async (request) => {
    const { tenantId } = request.user as any
    return fastify.prisma.tenantHoliday.findMany({
      where: { tenantId },
      orderBy: { date: 'asc' }
    })
  })

  // POST /api/v1/tenant-holidays — cria override manual
  fastify.post('/', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['date', 'name', 'action'],
        properties: {
          date: { type: 'string', format: 'date' }, // YYYY-MM-DD
          name: { type: 'string', minLength: 1, maxLength: 200 },
          action: { type: 'string', enum: ['ADD', 'REMOVE'] }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { date, name, action } = request.body as { date: string; name: string; action: 'ADD' | 'REMOVE' }
    const dateObj = startOfDay(parseISO(date))

    const existing = await fastify.prisma.tenantHoliday.findUnique({
      where: { tenantId_date: { tenantId, date: dateObj } }
    })
    if (existing) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Já existe override de feriado para essa data neste tenant.'
      })
    }

    const created = await fastify.prisma.tenantHoliday.create({
      data: { tenantId, date: dateObj, name, source: 'MANUAL', action }
    })

    fastify.holidayResolver.invalidateCache(tenantId, dateObj.getFullYear())
    return reply.code(201).send(created)
  })

  // PATCH /api/v1/tenant-holidays/:id — atualiza nome/action de um override
  fastify.patch('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          action: { type: 'string', enum: ['ADD', 'REMOVE'] }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }
    const body = request.body as { name?: string; action?: 'ADD' | 'REMOVE' }

    const existing = await fastify.prisma.tenantHoliday.findFirst({ where: { id, tenantId } })
    if (!existing) return reply.code(404).send({ error: 'Not Found' })

    const updated = await fastify.prisma.tenantHoliday.update({
      where: { id },
      data: { ...(body.name !== undefined && { name: body.name }), ...(body.action !== undefined && { action: body.action }) }
    })

    fastify.holidayResolver.invalidateCache(tenantId, existing.date.getFullYear())
    return updated
  })

  // DELETE /api/v1/tenant-holidays/:id
  fastify.delete('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin]
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }

    const existing = await fastify.prisma.tenantHoliday.findFirst({ where: { id, tenantId } })
    if (!existing) return reply.code(404).send({ error: 'Not Found' })

    await fastify.prisma.tenantHoliday.delete({ where: { id } })
    fastify.holidayResolver.invalidateCache(tenantId, existing.date.getFullYear())
    return reply.code(204).send()
  })
}

export default tenantHolidays
