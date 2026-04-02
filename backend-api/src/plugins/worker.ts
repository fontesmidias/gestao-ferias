import { Worker } from 'bullmq'
import fp from 'fastify-plugin'
import { SanitizationService } from '../modules/employees/sanitization-service'
import { WhatsAppService } from '../modules/notifications/whatsapp-service'
import { WebhookService } from '../modules/integrations/webhook-service'

export default fp(async (fastify) => {
  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  }

  // Worker para Processamento de Importações (Story 2.1)
  const importWorker = new Worker('import-queue', async (job) => {
    const { rawData, tenantId } = job.data
    fastify.log.info(`[WORKER] Iniciando limpeza e ingestão de ${rawData.length} registros para o Tenant ${tenantId}`)
    
    fastify.broadcast(tenantId, { type: 'IMPORT_STARTED', data: { total: rawData.length } })

    let successCount = 0
    let errorCount = 0

    for (const row of rawData) {
      try {
        // 1. Sanitização dos Dados (Story 2.2)
        const sanitizedName = SanitizationService.sanitizeName(row.name)
        const sanitizedCPF = SanitizationService.sanitizeCPF(row.cpf)
        const sanitizedHireDate = SanitizationService.sanitizeDate(row.hireDate)

        // 2. Persistência no Banco (Upsert para evitar duplicatas por CPF)
        await fastify.prisma.employee.upsert({
          where: { cpf: sanitizedCPF },
          update: {
            name: sanitizedName,
            hireDate: sanitizedHireDate,
            tenantId: tenantId
          },
          create: {
            name: sanitizedName,
            cpf: sanitizedCPF,
            hireDate: sanitizedHireDate,
            tenantId: tenantId
          }
        })

        successCount++
      } catch (err: any) {
        fastify.log.error(`[WORKER] Erro ao processar linha para ${row.name || 'desconhecido'}: ${err.message}`)
        errorCount++
      }
    }

    fastify.log.info(`[WORKER] Concluído: ${successCount} sucessos, ${errorCount} erros.`)

    fastify.broadcast(tenantId, { 
      type: 'IMPORT_COMPLETED', 
      data: { successCount, errorCount } 
    })

    return { 
        status: 'completed', 
        processed: rawData.length,
        successCount,
        errorCount
    }
  }, {
    connection: redisConfig
  })

  // Worker para Notificações (Story 4.3)
  const notificationWorker = new Worker('notification-queue', async (job) => {
    const { type, data } = job.data
    
    if (type === 'SEND_SIGNATURE_OTP') {
      const { phone, code } = data
      fastify.log.info(`[NOTIF-WORKER] Enviando OTP para ${phone}`)
      const success = await WhatsAppService.sendOTP(phone, code)
      if (!success) {
        fastify.broadcast(data.tenantId || 'default', { type: 'NOTIFICATION_FAILED', data: { phone } })
        throw new Error('Falha ao enviar WhatsApp')
      }
      
      fastify.broadcast(data.tenantId || 'default', { type: 'NOTIFICATION_SENT', data: { phone } })
    }

    return { status: 'sent' }
  }, {
    connection: redisConfig,
    settings: {
      backoffStrategy: (attempts: number) => Math.pow(2, attempts) * 1000
    }
  })

  // Worker para Webhooks (Story 6.1)
  const webhookWorker = new Worker('webhook-queue', async (job) => {
    const { event, tenantId, data } = job.data
    
    // 1. Buscar webhooks ativos para este evento e tenant
    const webhooks = await fastify.prisma.webhook.findMany({
      where: {
        tenantId,
        isActive: true,
        events: { has: event }
      }
    })

    fastify.log.info(`[WEBHOOK-WORKER] Disparando ${event} para ${webhooks.length} destinos.`)

    const payload = {
      event,
      timestamp: new Date().toISOString(),
      tenantId,
      data
    }

    // 2. Disparar cada webhook
    for (const hook of webhooks) {
      try {
        await WebhookService.trigger(hook.url, hook.secret, payload)
      } catch (err: any) {
        fastify.log.error(`[WEBHOOK-WORKER] Falha ao disparar para ${hook.url}: ${err.message}`)
      }
    }

    return { status: 'processed', hooksTrigged: webhooks.length }
  }, {
    connection: redisConfig,
    settings: {
      backoffStrategy: (attempts: number) => Math.pow(2, attempts) * 1000
    }
  })

  // Event handlers for the worker
  importWorker.on('completed', (job) => {
    fastify.log.info(`[WORKER] Job ${job.id} finalizado com sucesso.`)
  })

  importWorker.on('failed', (job, err) => {
    fastify.log.error(`[WORKER] Job ${job?.id} falhou drasticamente: ${err.message}`)
  })

  notificationWorker.on('failed', (job, err) => {
    fastify.log.error(`[NOTIF-WORKER] Job ${job?.id} falhou: ${err.message}`)
  })

  webhookWorker.on('failed', (job, err) => {
    fastify.log.error(`[WEBHOOK-WORKER] Job ${job?.id} falhou: ${err.message}`)
  })

  // Disconnect on close
  fastify.addHook('onClose', async (server) => {
    await importWorker.close()
    await notificationWorker.close()
    await webhookWorker.close()
  })
})
