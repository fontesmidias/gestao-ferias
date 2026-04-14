import { FastifyPluginAsync } from 'fastify'
import { randomBytes } from 'crypto'
import { WebhookService } from '../../../../modules/integrations/webhook-service'

const webhooks: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Criar webhook
  fastify.post('/', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['url', 'events'],
        properties: {
          url: { type: 'string', format: 'uri' },
          events: { type: 'array', items: { type: 'string' }, minItems: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { url, events } = request.body as { url: string; events: string[] }

    const secret = 'whsec_' + randomBytes(24).toString('hex')

    const webhook = await fastify.prisma.webhook.create({
      data: { url, secret, events, tenantId }
    })

    return reply.code(201).send(webhook)
  })

  // Listar webhooks do tenant
  fastify.get('/', {
    onRequest: [fastify.requireAuth]
  }, async (request) => {
    const { tenantId } = request.user as any
    return await fastify.prisma.webhook.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    })
  })

  // Atualizar webhook
  fastify.patch('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri' },
          events: { type: 'array', items: { type: 'string' } },
          isActive: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }
    const data = request.body as any

    const existing = await fastify.prisma.webhook.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Webhook não encontrado.' })
    }

    const updated = await fastify.prisma.webhook.update({
      where: { id },
      data: {
        url: data.url !== undefined ? data.url : undefined,
        events: data.events !== undefined ? data.events : undefined,
        isActive: data.isActive !== undefined ? data.isActive : undefined,
      }
    })

    return updated
  })

  // Deletar webhook
  fastify.delete('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } } }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }

    const existing = await fastify.prisma.webhook.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Webhook não encontrado.' })
    }

    await fastify.prisma.webhook.delete({ where: { id } })
    return { message: 'Webhook removido com sucesso.' }
  })

  // Testar webhook (envia payload de teste)
  fastify.post('/:id/test', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string' } } }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }

    const webhook = await fastify.prisma.webhook.findFirst({ where: { id, tenantId } })
    if (!webhook) {
      return reply.code(404).send({ error: 'Not Found', message: 'Webhook não encontrado.' })
    }

    const success = await WebhookService.trigger(webhook.url, webhook.secret, {
      event: 'TEST',
      timestamp: new Date().toISOString(),
      tenantId,
      data: { message: 'Webhook de teste enviado com sucesso!', webhookId: id }
    })

    return { success, message: success ? 'Webhook enviado com sucesso!' : 'Falha ao enviar webhook.' }
  })
}

export default webhooks
