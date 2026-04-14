import { FastifyPluginAsync } from 'fastify'
import * as bcrypt from 'bcryptjs'

const admin: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // ─── Tenants CRUD (SUPERADMIN only) ───────────────────

  // Listar todos os tenants
  fastify.get('/tenants', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async (request) => {
    return await fastify.prisma.tenant.findMany({
      include: {
        _count: { select: { users: true, employees: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  })

  // Criar tenant
  fastify.post('/tenants', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'cnpj'],
        properties: {
          name: { type: 'string', minLength: 3 },
          cnpj: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { name, cnpj } = request.body as any

    try {
      const tenant = await fastify.prisma.tenant.create({
        data: { name, cnpj: cnpj.replace(/\D/g, '') }
      })
      return reply.code(201).send(tenant)
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.code(409).send({ error: 'Conflict', message: 'CNPJ já cadastrado.' })
      }
      throw error
    }
  })

  // Detalhes de um tenant
  fastify.get('/tenants/:id', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenant = await fastify.prisma.tenant.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
        _count: { select: { employees: true, workplaces: true, vacationRequests: true } }
      }
    })
    if (!tenant) return reply.code(404).send({ error: 'Not Found' })
    return tenant
  })

  // Atualizar tenant
  fastify.patch('/tenants/:id', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          cnpj: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          address: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          responsible: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const data = request.body as any

    const existing = await fastify.prisma.tenant.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Not Found' })

    const updated = await fastify.prisma.tenant.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        cnpj: data.cnpj !== undefined ? data.cnpj.replace(/\D/g, '') : undefined,
        email: data.email !== undefined ? data.email : undefined,
        phone: data.phone !== undefined ? data.phone : undefined,
        address: data.address !== undefined ? data.address : undefined,
        city: data.city !== undefined ? data.city : undefined,
        state: data.state !== undefined ? data.state : undefined,
        responsible: data.responsible !== undefined ? data.responsible : undefined,
      }
    })
    return updated
  })

  // Deletar tenant (apenas se vazio)
  fastify.delete('/tenants/:id', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenant = await fastify.prisma.tenant.findUnique({
      where: { id },
      include: { _count: { select: { employees: true } } }
    })
    if (!tenant) return reply.code(404).send({ error: 'Not Found' })
    if ((tenant as any)._count.employees > 0) {
      return reply.code(409).send({ error: 'Conflict', message: 'Tenant possui colaboradores. Remova-os primeiro.' })
    }
    await fastify.prisma.user.deleteMany({ where: { tenantId: id } })
    await fastify.prisma.tenant.delete({ where: { id } })
    return { message: 'Tenant removido.' }
  })

  // ─── User Management (SUPERADMIN only) ────────────────

  // Criar usuário para um tenant (ADMIN ou USER)
  fastify.post('/tenants/:tenantId/users', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email', 'password', 'role'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          role: { type: 'string', enum: ['ADMIN', 'USER', 'AUDITOR'] },
          employeeId: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string }
    const { name, email, password, role, employeeId } = request.body as any

    const tenant = await fastify.prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) return reply.code(404).send({ error: 'Tenant não encontrado.' })

    const passwordHash = await bcrypt.hash(password, 10)

    try {
      const user = await fastify.prisma.user.create({
        data: { name, email, passwordHash, role, tenantId }
      })

      // Se vinculado a um employee, atualizar o employee
      if (employeeId) {
        await fastify.prisma.employee.update({
          where: { id: employeeId },
          data: { userId: user.id }
        })
      }

      return reply.code(201).send({
        id: user.id, name: user.name, email: user.email, role: user.role, tenantId
      })
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.code(409).send({ error: 'Conflict', message: 'Email já existe neste tenant.' })
      }
      throw error
    }
  })

  // Editar usuario de um tenant
  fastify.patch('/tenants/:tenantId/users/:userId', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          role: { type: 'string', enum: ['ADMIN', 'USER', 'AUDITOR'] },
          isActive: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId, userId } = request.params as { tenantId: string; userId: string }
    const data = request.body as any

    const existing = await fastify.prisma.user.findFirst({ where: { id: userId, tenantId } })
    if (!existing) return reply.code(404).send({ error: 'Not Found' })
    if (existing.role === 'SUPERADMIN') return reply.code(403).send({ error: 'Forbidden', message: 'Nao e possivel editar o SuperAdmin.' })

    const updated = await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        email: data.email !== undefined ? data.email : undefined,
        role: data.role !== undefined ? data.role : undefined,
        isActive: data.isActive !== undefined ? data.isActive : undefined,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    })
    return updated
  })

  // Desativar usuario (soft delete)
  fastify.delete('/tenants/:tenantId/users/:userId', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { tenantId, userId } = request.params as { tenantId: string; userId: string }
    const existing = await fastify.prisma.user.findFirst({ where: { id: userId, tenantId } })
    if (!existing) return reply.code(404).send({ error: 'Not Found' })
    if (existing.role === 'SUPERADMIN') return reply.code(403).send({ error: 'Forbidden' })

    await fastify.prisma.user.update({ where: { id: userId }, data: { isActive: false } })
    return { message: 'Usuario desativado.' }
  })

  // Switch tenant (impersonar)
  fastify.post('/switch-tenant', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: { type: 'object', required: ['tenantId'], properties: { tenantId: { type: 'string', format: 'uuid' } } }
    }
  }, async (request, reply) => {
    const { tenantId } = request.body as { tenantId: string }
    const { userId, email, name } = request.user as any

    const tenant = await fastify.prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) return reply.code(404).send({ error: 'Tenant nao encontrado.' })

    const token = fastify.jwt.sign(
      { userId, tenantId, email, role: 'SUPERADMIN', name, employeeId: null },
      { expiresIn: '1h' }
    )

    return { token, tenant: { id: tenant.id, name: tenant.name } }
  })

  // Metricas de um tenant especifico
  fastify.get('/tenants/:id/metrics', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async (request) => {
    const { id } = request.params as { id: string }

    const [employeesByStatus, pendingVacations, totalWorkplaces, activeAllocations, uncoveredVacations] = await Promise.all([
      fastify.prisma.employee.groupBy({ by: ['status'], where: { tenantId: id }, _count: { id: true } }),
      fastify.prisma.vacationRequest.count({ where: { tenantId: id, status: 'PENDING' } }),
      fastify.prisma.workplace.count({ where: { tenantId: id } }),
      fastify.prisma.workplaceAllocation.count({ where: { tenantId: id, status: 'ACTIVE' } }),
      fastify.prisma.vacationRequest.count({
        where: { tenantId: id, status: { in: ['APPROVED', 'SIGNED'] }, coverages: { none: {} } }
      })
    ])

    const statusMap = employeesByStatus.reduce((acc, curr) => {
      acc[curr.status] = curr._count.id
      return acc
    }, {} as Record<string, number>)

    return {
      employees: statusMap,
      totalEmployees: Object.values(statusMap).reduce((a, b) => a + b, 0),
      pendingVacations,
      totalWorkplaces,
      activeAllocations,
      coverageGaps: uncoveredVacations
    }
  })

  // Listar usuários de um tenant
  fastify.get('/tenants/:tenantId/users', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async (request) => {
    const { tenantId } = request.params as { tenantId: string }
    return await fastify.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true, name: true, email: true, role: true, isActive: true, createdAt: true,
        employee: { select: { id: true, name: true, cpf: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  })

  // ─── Stats globais ────────────────────────────────────

  fastify.get('/stats', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async () => {
    const [tenants, users, employees, vacations] = await Promise.all([
      fastify.prisma.tenant.count(),
      fastify.prisma.user.count(),
      fastify.prisma.employee.count(),
      fastify.prisma.vacationRequest.count()
    ])
    return { tenants, users, employees, vacations }
  })
}

export default admin
