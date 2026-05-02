import { Queue, Worker } from 'bullmq'
import fp from 'fastify-plugin'
import net from 'net'
import {
  acquireTenantLock,
  releaseTenantLock,
  type RedisLike,
} from '../modules/imports/tenant-lock'
import { runImportPipeline } from '../modules/imports/worker-pipeline'
import { runApplyPipeline } from '../modules/imports/apply-pipeline'
import type { ApplyOptions } from '../modules/imports/import-applier'
import {
  autoCancelStalePreviews,
  timeoutStuckJobs,
} from '../modules/imports/watchdog'
import { cleanupOldImports } from '../modules/imports/cleanup-cron'

const QUEUE_NAME = 'imports'
const REPEATABLE_WATCHDOG_ID = 'tirvu-watchdog'
const REPEATABLE_CLEANUP_ID = 'tirvu-cleanup'

function getRedisConfig(): { host: string; port: number } {
  const config = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  }
  if (process.env.REDIS_URL) {
    try {
      const url = new URL(process.env.REDIS_URL)
      config.host = url.hostname
      config.port = parseInt(url.port || '6379')
    } catch {}
  }
  return config
}

function checkRedisAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    socket.setTimeout(2000)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

export default fp(async (fastify) => {
  const redisConfig = getRedisConfig()
  const redisAvailable = await checkRedisAvailable(
    redisConfig.host,
    redisConfig.port,
  )

  if (!redisAvailable) {
    fastify.log.warn(
      '[IMPORTS] Redis indisponível. Queue tirvu-imports desativada — uploads não vão processar.',
    )
    const stub = {
      async add() {
        fastify.log.warn(
          '[IMPORTS] Tentativa de enfileirar job ignorada — Redis offline.',
        )
        return null as never
      },
      async close() {},
    } as unknown as Queue
    fastify.decorate('tirvuImportQueue', stub)
    return
  }

  const importsQueue = new Queue(QUEUE_NAME, { connection: redisConfig })

  // ioredis lazy import — evita acoplamento direto em módulos puros
  const IORedis = (await import('ioredis')).default
  const redisClient = new IORedis(redisConfig) as unknown as RedisLike

  const concurrency = Number(process.env.IMPORT_WORKER_CONCURRENCY ?? 2)

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === 'watchdog') {
        const t = await timeoutStuckJobs(fastify.prisma)
        const c = await autoCancelStalePreviews(fastify.prisma)
        if (t.timedOut > 0 || c.cancelled > 0) {
          fastify.log.info(
            { module: 'imports', phase: 'watchdog', ...t, ...c },
            'watchdog tick',
          )
        }
        return
      }

      if (job.name === 'apply') {
        const { jobId, options } = job.data as {
          jobId: string
          options: ApplyOptions
        }
        const found = await fastify.prisma.importJob.findUnique({
          where: { id: jobId },
          select: { tenantId: true, operatorUserId: true },
        })
        if (!found) {
          fastify.log.warn(
            { module: 'imports', importJobId: jobId, phase: 'apply' },
            'job não encontrado, skip',
          )
          return
        }
        const tenantId = found.tenantId

        const acquired = await acquireTenantLock(redisClient, tenantId)
        if (!acquired) {
          fastify.log.debug(
            { module: 'imports', importJobId: jobId, tenantId, phase: 'lock' },
            'lock contention, re-queued (apply)',
          )
          await importsQueue.add('apply', { jobId, options }, { delay: 5000 })
          return
        }

        try {
          await runApplyPipeline(
            {
              prisma: fastify.prisma,
              log: fastify.log,
              userId: found.operatorUserId,
            },
            { jobId, options },
          )
        } finally {
          await releaseTenantLock(redisClient, tenantId)
        }
        return
      }

      if (job.name === 'cleanup') {
        const r = await cleanupOldImports(fastify.prisma)
        fastify.log.info(
          { module: 'imports', phase: 'cleanup', ...r },
          'cleanup tick',
        )
        return
      }

      // default: 'process' — pipeline de import
      const { jobId } = job.data as { jobId: string }
      const found = await fastify.prisma.importJob.findUnique({
        where: { id: jobId },
        select: { tenantId: true },
      })
      if (!found) {
        fastify.log.warn(
          { module: 'imports', importJobId: jobId, phase: 'parse' },
          'job não encontrado, skip',
        )
        return
      }
      const tenantId = found.tenantId

      const acquired = await acquireTenantLock(redisClient, tenantId)
      if (!acquired) {
        fastify.log.debug(
          {
            module: 'imports',
            importJobId: jobId,
            tenantId,
            phase: 'lock',
          },
          'lock contention, re-queued',
        )
        await importsQueue.add('process', { jobId }, { delay: 5000 })
        return
      }

      try {
        await runImportPipeline(
          { prisma: fastify.prisma, log: fastify.log },
          { jobId },
        )
      } finally {
        await releaseTenantLock(redisClient, tenantId)
      }
    },
    { connection: redisConfig, concurrency },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error(
      {
        module: 'imports',
        importJobId: job?.data?.jobId,
        phase: 'worker',
        error: err.message,
      },
      'worker job failed',
    )
  })

  // Repeatable jobs
  await importsQueue.add(
    'watchdog',
    {},
    {
      repeat: { every: 60_000 },
      jobId: REPEATABLE_WATCHDOG_ID,
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  )
  await importsQueue.add(
    'cleanup',
    {},
    {
      repeat: { pattern: '0 3 * * *' },
      jobId: REPEATABLE_CLEANUP_ID,
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  )

  fastify.decorate('tirvuImportQueue', importsQueue)

  fastify.addHook('onClose', async () => {
    await worker.close()
    await importsQueue.close()
    redisClient.del('').catch(() => {}) // touch to keep TS happy on shape
    if ('quit' in (redisClient as unknown as { quit?: () => Promise<void> })) {
      await (redisClient as unknown as { quit: () => Promise<void> }).quit()
    }
  })

  fastify.log.info(
    `[IMPORTS] Redis conectado — queue '${QUEUE_NAME}' + worker (concurrency=${concurrency}) + watchdog (1m) + cleanup (03h UTC) ativos.`,
  )
})

declare module 'fastify' {
  export interface FastifyInstance {
    tirvuImportQueue: Queue
  }
}
