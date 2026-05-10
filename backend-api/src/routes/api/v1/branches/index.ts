import type { FastifyPluginAsync } from 'fastify'
import { ensureBranchFromImport } from '../../../../modules/branches/branch-resolver'

/**
 * V3.5 Story 5.1: CRUD admin de Branches (filiais).
 *
 * GET    /v1/branches              — lista
 * POST   /v1/branches              — cria manual
 * PATCH  /v1/branches/:id          — edita
 * DELETE /v1/branches/:id          — desativa (soft: active=false)
 * POST   /v1/branches/backfill     — popula employee.branchId lendo employee.branch string
 */
const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { onRequest: [fastify.requireAuth] }, async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const branches = await fastify.prisma.branch.findMany({
      where: { tenantId },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    })
    return { data: branches, error: null }
  })

  fastify.post('/', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 200 },
          cnpj: { type: 'string', maxLength: 30 },
          legalName: { type: 'string', maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const body = request.body as { name: string; cnpj?: string; legalName?: string }
    try {
      const created = await fastify.prisma.branch.create({
        data: { tenantId, name: body.name.trim(), cnpj: body.cnpj?.trim() || null, legalName: body.legalName?.trim() || null, importedBy: 'MANUAL' },
      })
      return reply.code(201).send({ data: created, error: null })
    } catch (err: any) {
      if (err?.code === 'P2002') return reply.code(409).send({ data: null, error: { code: 'DUPLICATE', message: 'Ja existe uma filial com esse nome neste tenant.' } })
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
          name: { type: 'string', minLength: 2, maxLength: 200 },
          cnpj: { type: 'string', maxLength: 30 },
          legalName: { type: 'string', maxLength: 200 },
          active: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const existing = await fastify.prisma.branch.findFirst({ where: { id, tenantId } })
    if (!existing) return reply.code(404).send({ data: null, error: { code: 'NOT_FOUND', message: 'Filial nao encontrada.' } })
    const body = request.body as { name?: string; cnpj?: string; legalName?: string; active?: boolean }
    const updated = await fastify.prisma.branch.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.cnpj !== undefined ? { cnpj: body.cnpj.trim() || null } : {}),
        ...(body.legalName !== undefined ? { legalName: body.legalName.trim() || null } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    })
    return reply.send({ data: updated, error: null })
  })

  fastify.delete('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const existing = await fastify.prisma.branch.findFirst({ where: { id, tenantId } })
    if (!existing) return reply.code(404).send({ data: null, error: { code: 'NOT_FOUND', message: 'Filial nao encontrada.' } })
    // Soft-delete: nao remove (FK pode estar referenciada em employees).
    const updated = await fastify.prisma.branch.update({ where: { id: existing.id }, data: { active: false } })
    return reply.send({ data: updated, error: null })
  })

  // V3.5 Story 5.1: backfill — popula employee.branchId nos colaboradores existentes
  // lendo o campo string employee.branch e auto-criando Branch quando necessario.
  fastify.post('/backfill', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
  }, async (request, reply) => {
    const { tenantId, userId } = request.user as { tenantId: string; userId: string }
    const employees = await fastify.prisma.employee.findMany({
      where: { tenantId, branch: { not: null }, branchId: null },
      select: { id: true, branch: true },
    })
    let updated = 0
    let createdBranches = 0
    const seen = new Set<string>()
    for (const e of employees) {
      if (!e.branch) continue
      const before = await fastify.prisma.branch.count({ where: { tenantId, name: { equals: e.branch.trim(), mode: 'insensitive' } } })
      const branchId = await ensureBranchFromImport(fastify.prisma as any, tenantId, e.branch)
      if (!branchId) continue
      if (before === 0 && !seen.has(branchId)) createdBranches++
      seen.add(branchId)
      await fastify.prisma.employee.update({ where: { id: e.id }, data: { branchId } })
      updated++
    }
    await fastify.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'BRANCH_BACKFILL',
        resourceType: 'BRANCH',
        resourceId: '00000000-0000-0000-0000-000000000000',
        newData: { totalEmployees: employees.length, updated, createdBranches } as never,
      },
    }).catch(() => { /* nao trava */ })
    return reply.send({ data: { totalCandidates: employees.length, updated, createdBranches }, error: null })
  })
}

export default route
