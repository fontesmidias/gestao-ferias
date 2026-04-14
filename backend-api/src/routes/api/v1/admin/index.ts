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

  // Listar usuários de um tenant
  fastify.get('/tenants/:tenantId/users', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async (request) => {
    const { tenantId } = request.params as { tenantId: string }
    return await fastify.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true, name: true, email: true, role: true, createdAt: true,
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
