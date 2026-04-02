import { Queue } from 'bullmq'
import fp from 'fastify-plugin'

export default fp(async (fastify) => {
  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  }

  // Create the queue
  const importQueue = new Queue('import-queue', { connection: redisConfig })
  const notificationQueue = new Queue('notification-queue', { connection: redisConfig })
  const webhookQueue = new Queue('webhook-queue', { connection: redisConfig })

  fastify.decorate('queues', {
    import: importQueue,
    notification: notificationQueue,
    webhook: webhookQueue
  })
  fastify.decorate('importQueue', importQueue)

  // Disconnect on close
  fastify.addHook('onClose', async (server) => {
    await server.queues.import.close()
    await server.queues.notification.close()
    await server.queues.webhook.close()
  })
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
