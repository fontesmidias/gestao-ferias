import { FastifyPluginAsync } from 'fastify'
import { WhatsAppService } from '../../../../modules/notifications/whatsapp-service'

// Helper: mascarar valores sensíveis (ex: "sk-abc123xyz" → "sk-...xyz")
function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.length <= 6) return '***'
  return value.slice(0, 3) + '...' + value.slice(-3)
}

const tenants: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.post('/', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      description: 'Cria um novo Tenant (Empresa)',
      tags: ['Tenants'],
      body: {
        type: 'object',
        required: ['name', 'cnpj'],
        properties: {
          name: { type: 'string', minLength: 3 },
          cnpj: { type: 'string', pattern: '^\\d{2}\\.?\\d{3}\\.?\\d{3}/?\\d{4}-?\\d{2}$' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' }
          }
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { name, cnpj } = request.body as { name: string; cnpj: string }

    try {
      const tenant = await fastify.prisma.tenant.create({
        data: {
          name,
          cnpj: cnpj.replace(/\D/g, '') // Sanitização básica do CNPJ para o banco
        }
      })

      return reply.code(201).send({
        id: tenant.id,
        name: tenant.name,
        status: 'created'
      })
    } catch (error: any) {
      if (error.code === 'P2002') {
         return reply.status(409).send({ error: 'Conflict', message: 'Tenant ou Email já cadastrados.' })
      }
      throw error
    }
  })

  // Retornar dados do tenant do usuário logado (sem expor outros tenants)
  fastify.get('/', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const tenant = await fastify.prisma.tenant.findUnique({
      where: { id: tenantId }
    })
    if (!tenant) {
      return reply.code(404).send({ error: 'Not Found', message: 'Tenant não encontrado.' })
    }
    return {
      id: tenant.id,
      name: tenant.name,
      cnpj: tenant.cnpj,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt
    }
  })

  // Patch Settings (LLM, SMTP)
  fastify.patch('/settings', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin]
  }, async (request, reply) => {
    const user = request.user as any
    const payload = request.body as any

    const { openaiKey, anthropicKey, geminiKey, groqKey, llmProvider, llmModel, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, evoApiUrl, evoApiKey, evoInstanceName, whatsappEnabled, zapSignToken } = payload

    await fastify.prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        openaiKey: openaiKey !== undefined ? openaiKey : undefined,
        anthropicKey: anthropicKey !== undefined ? anthropicKey : undefined,
        geminiKey: geminiKey !== undefined ? geminiKey : undefined,
        groqKey: groqKey !== undefined ? groqKey : undefined,
        llmProvider: llmProvider !== undefined ? llmProvider : undefined,
        llmModel: llmModel !== undefined ? llmModel : undefined,
        smtpHost: smtpHost !== undefined ? smtpHost : undefined,
        smtpPort: smtpPort !== undefined ? Number(smtpPort) : undefined,
        smtpUser: smtpUser !== undefined ? smtpUser : undefined,
        smtpPass: smtpPass !== undefined ? smtpPass : undefined,
        smtpFrom: smtpFrom !== undefined ? smtpFrom : undefined,
        evoApiUrl: evoApiUrl !== undefined ? evoApiUrl : undefined,
        evoApiKey: evoApiKey !== undefined ? evoApiKey : undefined,
        evoInstanceName: evoInstanceName !== undefined ? evoInstanceName : undefined,
        whatsappEnabled: whatsappEnabled !== undefined ? Boolean(whatsappEnabled) : undefined,
        zapSignToken: zapSignToken !== undefined ? zapSignToken : undefined,
      }
    })

    return reply.send({ message: "Configurações atualizadas com sucesso." })
  })

  // Get Current Tenant Settings (secrets mascarados)
  fastify.get('/settings', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const user = request.user as any
    if (!user.tenantId) {
      return reply.code(404).send({ error: 'Not Found', message: 'SuperAdmin não possui tenant. Use o painel admin.' })
    }
    const tenant = await fastify.prisma.tenant.findUnique({
      where: { id: user.tenantId }
    })
    if (!tenant) {
      return reply.code(404).send({ error: 'Not Found' })
    }
    return {
      id: tenant.id,
      name: tenant.name,
      cnpj: tenant.cnpj,
      smtpHost: tenant.smtpHost,
      smtpPort: tenant.smtpPort,
      smtpUser: tenant.smtpUser,
      smtpPass: maskSecret(tenant.smtpPass),
      smtpFrom: tenant.smtpFrom,
      openaiKey: maskSecret(tenant.openaiKey),
      anthropicKey: maskSecret(tenant.anthropicKey),
      geminiKey: maskSecret(tenant.geminiKey),
      groqKey: maskSecret(tenant.groqKey),
      llmProvider: tenant.llmProvider,
      llmModel: tenant.llmModel,
      evoApiUrl: tenant.evoApiUrl,
      evoApiKey: maskSecret(tenant.evoApiKey),
      evoInstanceName: tenant.evoInstanceName,
      whatsappEnabled: tenant.whatsappEnabled,
      zapSignToken: maskSecret(tenant.zapSignToken),
    }
  })

  // Testar conexão WhatsApp via Evolution API
  fastify.get('/whatsapp/status', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin]
  }, async (request, reply) => {
    const user = request.user as any
    const result = await WhatsAppService.checkConnection(user.tenantId, fastify.prisma as any)
    return result
  })
}

export default tenants
