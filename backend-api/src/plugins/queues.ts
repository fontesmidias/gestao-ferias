import { Queue } from 'bullmq'
import fp from 'fastify-plugin'
import net from 'net'

function getRedisConfig() {
  const config: any = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  }

  if (process.env.REDIS_URL) {
    try {
      const url = new URL(process.env.REDIS_URL)
      config.host = url.hostname
      config.port = parseInt(url.port || '6379')
    } catch (e) {}
  }

  return config
}

function checkRedisAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    socket.setTimeout(2000)
    socket.on('connect', () => { socket.destroy(); resolve(true) })
    socket.on('error', () => { socket.destroy(); resolve(false) })
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
  })
}

export default fp(async (fastify) => {
  const redisConfig = getRedisConfig()
  const redisAvailable = await checkRedisAvailable(redisConfig.host, redisConfig.port)

  if (!redisAvailable) {
    fastify.log.warn('[QUEUES] Redis indisponivel. Filas desativadas — funcionalidades de importacao/webhook/notificacao nao estarao disponiveis.')

    const nullQueue = {
      add: async () => { fastify.log.warn('[QUEUES] Tentativa de enfileirar job ignorada — Redis offline.') },
      close: async () => {}
    } as any

    fastify.decorate('queues', { import: nullQueue, notification: nullQueue, webhook: nullQueue })
    fastify.decorate('importQueue', nullQueue)
    return
  }

  const importQueue = new Queue('import-queue', { connection: redisConfig })
  const notificationQueue = new Queue('notification-queue', { connection: redisConfig })
  const webhookQueue = new Queue('webhook-queue', { connection: redisConfig })

  fastify.decorate('queues', { import: importQueue, notification: notificationQueue, webhook: webhookQueue })
  fastify.decorate('importQueue', importQueue)

  fastify.addHook('onClose', async (server) => {
    await server.queues.import.close()
    await server.queues.notification.close()
    await server.queues.webhook.close()
  })

  fastify.log.info('[QUEUES] Redis conectado — filas ativas.')
})

declare module 'fastify' {
  export interface FastifyInstance {
    queues: {
      import: Queue;
      notification: Queue;
      webhook: Queue;
    }
    importQueue: Queue;
  }
}
