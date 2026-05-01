import { FastifyPluginAsync } from 'fastify'
import * as bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { EmailService } from '../../../../modules/notifications/email-service'
import { WhatsAppService } from '../../../../modules/notifications/whatsapp-service'

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
          responsible: { type: 'string' },
          isActive: { type: 'boolean' },
          masterKeyCreationMode: { type: 'string', enum: ['AUTOMATIC', 'MANUAL'] }
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
        isActive: data.isActive !== undefined ? data.isActive : undefined,
        masterKeyCreationMode: data.masterKeyCreationMode !== undefined ? data.masterKeyCreationMode : undefined,
      }
    })
    return updated
  })

  // Resumo de dependencias do tenant (antes de excluir)
  fastify.get('/tenants/:id/dependencies', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [employees, users, vacations, workplaces, coverages, auditLogs, webhooks] = await Promise.all([
      fastify.prisma.employee.count({ where: { tenantId: id } }),
      fastify.prisma.user.count({ where: { tenantId: id } }),
      fastify.prisma.vacationRequest.count({ where: { tenantId: id } }),
      fastify.prisma.workplace.count({ where: { tenantId: id } }),
      fastify.prisma.coverageAssignment.count({ where: { tenantId: id } }),
      fastify.prisma.auditLog.count({ where: { tenantId: id } }),
      fastify.prisma.webhook.count({ where: { tenantId: id } }),
    ])
    return { employees, users, vacations, workplaces, coverages, auditLogs, webhooks }
  })

  // Deletar tenant com cascade controlado (POST com confirmacao)
  fastify.post('/tenants/:id/delete', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['confirmName'],
        properties: { confirmName: { type: 'string' } }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { confirmName } = request.body as { confirmName: string }

    const tenant = await fastify.prisma.tenant.findUnique({ where: { id } })
    if (!tenant) return reply.code(404).send({ error: 'Not Found' })

    // Confirmacao: nome digitado deve bater
    if (confirmName !== tenant.name) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Nome da empresa nao confere. Digite o nome exato para confirmar.' })
    }

    // Cascade delete na ordem correta (respeitar FKs)
    await fastify.prisma.coverageAssignment.deleteMany({ where: { tenantId: id } })
    await fastify.prisma.signature.deleteMany({ where: { tenantId: id } })
    await fastify.prisma.vacationRequest.deleteMany({ where: { tenantId: id } })
    await fastify.prisma.workplaceAllocation.deleteMany({ where: { tenantId: id } })
    await fastify.prisma.workplacePosition.deleteMany({ where: { tenantId: id } })
    await fastify.prisma.workplace.deleteMany({ where: { tenantId: id } })
    await fastify.prisma.webhook.deleteMany({ where: { tenantId: id } })
    await fastify.prisma.auditLog.deleteMany({ where: { tenantId: id } })
    await fastify.prisma.refreshToken.deleteMany({ where: { tenantId: id } })
    await fastify.prisma.employee.deleteMany({ where: { tenantId: id } })
    await fastify.prisma.user.deleteMany({ where: { tenantId: id } })
    await fastify.prisma.tenant.delete({ where: { id } })

    fastify.log.warn(`[ADMIN] Tenant "${tenant.name}" (${id}) excluido permanentemente pelo SuperAdmin`)
    return { message: `Empresa "${tenant.name}" e todos os seus dados foram removidos permanentemente.` }
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

  // ─── Perfil do SuperAdmin ──────────────────────────────

  fastify.patch('/profile', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 }
        }
      }
    }
  }, async (request, reply) => {
    const { userId } = request.user as any
    const { name, email, password } = request.body as { name?: string; email?: string; password?: string }

    const data: any = {}
    if (name !== undefined) data.name = name
    if (email !== undefined) data.email = email
    if (password !== undefined) data.passwordHash = await bcrypt.hash(password, 10)

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'Nenhum campo para atualizar.' })
    }

    const updated = await fastify.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, role: true }
    })

    return updated
  })

  // ─── MasterKey Access Logs (SUPERADMIN only) ─────────────
  fastify.get('/master-key-logs', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          offset: { type: 'integer', minimum: 0 }
        }
      }
    }
  }, async (request) => {
    const query = request.query as { limit?: number; offset?: number }

    const [logs, total] = await Promise.all([
      fastify.prisma.masterKeyLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0
      }),
      fastify.prisma.masterKeyLog.count()
    ])

    return { logs, total }
  })

  // ─── MasterKey Management (SUPERADMIN only) ─────────────

  // Obter status da MasterKey (sem expor a chave completa)
  fastify.get('/master-key', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async () => {
    const config = await fastify.prisma.systemConfig.findUnique({ where: { id: 'singleton' } })
    if (!config || !config.masterKey) {
      return { enabled: false, hasKey: false, preview: null, updatedAt: null }
    }
    // Mostrar apenas os primeiros 4 e ultimos 4 caracteres
    const key = config.masterKey
    const preview = key.length > 8
      ? `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`
      : '****'
    return {
      enabled: config.masterKeyEnabled,
      hasKey: true,
      preview,
      updatedAt: config.masterKeyUpdatedAt
    }
  })

  // Gerar nova MasterKey (cria automaticamente uma chave segura)
  fastify.post('/master-key/generate', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          customKey: { type: 'string', minLength: 3, maxLength: 256 }
        }
      }
    }
  }, async (request, reply) => {
    const body = (request.body || {}) as { customKey?: string }

    let newKey: string
    let source: 'AUTO' | 'CUSTOM'
    if (body.customKey && body.customKey.trim().length > 0) {
      const trimmed = body.customKey.trim()
      if (trimmed.length < 3) {
        return reply.code(422).send({ error: 'Validation Error', message: 'MasterKey customizada deve ter pelo menos 3 caracteres.' })
      }
      newKey = trimmed
      source = 'CUSTOM'
    } else {
      newKey = randomBytes(32).toString('hex') // 64 chars hex
      source = 'AUTO'
    }

    await fastify.prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        masterKey: newKey,
        masterKeyEnabled: true,
        masterKeyUpdatedAt: new Date()
      },
      update: {
        masterKey: newKey,
        masterKeyEnabled: true,
        masterKeyUpdatedAt: new Date()
      }
    })

    fastify.log.warn(`[MASTERKEY] MasterKey ${source === 'CUSTOM' ? 'customizada definida' : 'gerada automaticamente'} pelo SuperAdmin`)
    return {
      key: newKey,
      source,
      message: source === 'CUSTOM'
        ? 'MasterKey customizada salva. Guarde-a em local seguro.'
        : 'Nova MasterKey gerada. Copie e guarde em local seguro. Ela não será exibida novamente.'
    }
  })

  // Ativar/desativar MasterKey
  fastify.patch('/master-key', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean' }
        }
      }
    }
  }, async (request) => {
    const { enabled } = request.body as { enabled: boolean }

    const config = await fastify.prisma.systemConfig.findUnique({ where: { id: 'singleton' } })
    if (!config || !config.masterKey) {
      return { error: 'Nenhuma MasterKey configurada. Gere uma primeiro.' }
    }

    await fastify.prisma.systemConfig.update({
      where: { id: 'singleton' },
      data: { masterKeyEnabled: enabled }
    })

    fastify.log.warn(`[MASTERKEY] MasterKey ${enabled ? 'ativada' : 'desativada'} pelo SuperAdmin`)
    return { enabled, message: `MasterKey ${enabled ? 'ativada' : 'desativada'} com sucesso.` }
  })

  // Revogar MasterKey (deletar)
  fastify.delete('/master-key', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async () => {
    await fastify.prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', masterKey: null, masterKeyEnabled: false },
      update: { masterKey: null, masterKeyEnabled: false, masterKeyUpdatedAt: new Date() }
    })

    fastify.log.warn('[MASTERKEY] MasterKey revogada pelo SuperAdmin')
    return { message: 'MasterKey revogada. O acesso emergencial esta desabilitado.' }
  })

  // ─── SMTP Global (SUPERADMIN only) ─────────────────────

  fastify.get('/smtp', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async () => {
    const config = await fastify.prisma.systemConfig.findUnique({ where: { id: 'singleton' } })
    if (!config) return { smtpHost: '', smtpPort: '', smtpUser: '', smtpPass: '', smtpFrom: '' }
    return {
      smtpHost: config.smtpHost || '',
      smtpPort: config.smtpPort || '',
      smtpUser: config.smtpUser || '',
      smtpPass: config.smtpPass ? '••••••••' : '',
      smtpFrom: config.smtpFrom || '',
      configured: !!(config.smtpHost && config.smtpUser)
    }
  })

  fastify.patch('/smtp', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          smtpHost: { type: 'string' },
          smtpPort: { type: 'integer' },
          smtpUser: { type: 'string' },
          smtpPass: { type: 'string' },
          smtpFrom: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const data = request.body as any
    const updateData: any = {}
    if (data.smtpHost !== undefined) updateData.smtpHost = data.smtpHost || null
    if (data.smtpPort !== undefined) updateData.smtpPort = data.smtpPort || null
    if (data.smtpUser !== undefined) updateData.smtpUser = data.smtpUser || null
    if (data.smtpPass !== undefined && data.smtpPass !== '••••••••') updateData.smtpPass = data.smtpPass || null
    if (data.smtpFrom !== undefined) updateData.smtpFrom = data.smtpFrom || null

    await fastify.prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...updateData },
      update: updateData
    })

    return { message: 'SMTP global atualizado com sucesso.' }
  })

  // POST /admin/smtp/test — envia e-mail de teste com a config atual
  fastify.post('/smtp/test', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['to'],
        properties: { to: { type: 'string', format: 'email' } }
      }
    }
  }, async (request, reply) => {
    const { to } = request.body as { to: string }
    const config = await fastify.prisma.systemConfig.findUnique({ where: { id: 'singleton' } })
    if (!config?.smtpHost || !config?.smtpUser || !config?.smtpPass || !config?.smtpPort) {
      return reply.code(422).send({ ok: false, message: 'SMTP global não configurado. Salve a configuração antes de testar.' })
    }
    const result = await EmailService.sendTestEmail(to, {
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpUser: config.smtpUser,
      smtpPass: config.smtpPass,
      smtpFrom: config.smtpFrom || undefined
    })
    return result
  })

  // ─── Evolution Global (SUPERADMIN only) ─────────────────────

  fastify.get('/evolution', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async () => {
    const config = await fastify.prisma.systemConfig.findUnique({ where: { id: 'singleton' } })
    return {
      evoApiUrl: config?.evoApiUrl || '',
      evoApiKey: config?.evoApiKey ? '••••••••' : '',
      evoInstanceName: config?.evoInstanceName || '',
      configured: !!(config?.evoApiUrl && config?.evoApiKey && config?.evoInstanceName)
    }
  })

  fastify.patch('/evolution', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          evoApiUrl: { type: 'string' },
          evoApiKey: { type: 'string' },
          evoInstanceName: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const data = request.body as any
    const updateData: any = {}
    if (data.evoApiUrl !== undefined) updateData.evoApiUrl = data.evoApiUrl || null
    if (data.evoApiKey !== undefined && data.evoApiKey !== '••••••••') updateData.evoApiKey = data.evoApiKey || null
    if (data.evoInstanceName !== undefined) updateData.evoInstanceName = data.evoInstanceName || null
    await fastify.prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...updateData },
      update: updateData
    })
    return { message: 'Evolution global atualizado com sucesso.' }
  })

  // GET /admin/evolution/status — checa conexão
  fastify.get('/evolution/status', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async () => {
    return await WhatsAppService.checkConnection(fastify.prisma as any)
  })

  // POST /admin/evolution/test — envia mensagem de teste
  fastify.post('/evolution/test', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['to'],
        properties: { to: { type: 'string', minLength: 8 } } // formato livre — sanitização e prefixo BR aplicados pelo serviço
      }
    }
  }, async (request, reply) => {
    const { to } = request.body as { to: string }
    const result = await WhatsAppService.sendMessage(
      fastify.prisma as any,
      to,
      'Teste Evolution — GestãoFérias ✅ Mensagem de validação enviada em ' + new Date().toLocaleString('pt-BR')
    )
    if (!result.ok) {
      return reply.code(422).send(result)
    }
    return result
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
