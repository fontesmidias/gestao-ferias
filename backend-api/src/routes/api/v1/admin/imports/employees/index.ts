// TODO(v3-3-rbac-data-driven): rota usa requirePermission('import.run')
// via mapa estático (Story 5.1). Migrar para data-driven em v3-3.

import type { FastifyPluginAsync } from 'fastify'
import { createHash } from 'node:crypto'
import { persist as storagePersist } from '../../../../../../modules/imports/import-storage'
import { validateUploadedFile } from './validators'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function envelope(
  data: unknown,
  error: { code: string; message: string } | null = null,
  meta: unknown = null,
) {
  return { data, error, meta }
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/',
    {
      onRequest: [
        fastify.requireAuth,
        fastify.requireSuperAdmin,
        fastify.requirePermission('import.run'),
      ],
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const user = request.user as { userId: string; role?: string }

      let data: Awaited<ReturnType<typeof request.file>>
      try {
        data = await request.file()
      } catch (err) {
        const e = err as { code?: string; message?: string }
        if (e?.code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply
            .code(413)
            .send(envelope(null, { code: 'FILE_TOO_LARGE', message: 'Arquivo excede o limite de 10MB' }))
        }
        throw err
      }

      if (!data) {
        return reply
          .code(400)
          .send(envelope(null, { code: 'INVALID_FILE_FORMAT', message: 'Arquivo é obrigatório' }))
      }

      let buffer: Buffer
      try {
        buffer = await data.toBuffer()
      } catch (err) {
        const e = err as { code?: string }
        if (e?.code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply
            .code(413)
            .send(envelope(null, { code: 'FILE_TOO_LARGE', message: 'Arquivo excede o limite de 10MB' }))
        }
        throw err
      }

      const filename = data.filename ?? null

      const tenantField = data.fields?.tenantId
      const tenantId =
        tenantField &&
        !Array.isArray(tenantField) &&
        'value' in tenantField &&
        typeof tenantField.value === 'string'
          ? tenantField.value.trim()
          : null

      const fileCheck = validateUploadedFile({ filename, size: buffer.length })
      if (!fileCheck.ok) {
        const status = fileCheck.code === 'FILE_TOO_LARGE' ? 413 : 400
        return reply
          .code(status)
          .send(envelope(null, { code: fileCheck.code, message: fileCheck.message }))
      }

      if (!tenantId || !UUID_RE.test(tenantId)) {
        return reply
          .code(400)
          .send(
            envelope(null, {
              code: 'INVALID_TARGET_TENANT',
              message: 'tenantId é obrigatório e deve ser UUID',
            }),
          )
      }

      const tenant = await fastify.prisma.tenant.findUnique({
        where: { id: tenantId },
      })
      if (!tenant || !tenant.isActive) {
        return reply
          .code(400)
          .send(
            envelope(null, {
              code: 'INVALID_TARGET_TENANT',
              message: 'Tenant não encontrado ou inativo',
            }),
          )
      }

      const fileHash = createHash('sha256').update(buffer).digest('hex')
      const ipAddress = request.ip
      const userAgent = request.headers['user-agent'] ?? null

      const job = await fastify.prisma.importJob.create({
        data: {
          tenantId,
          operatorUserId: user.userId,
          status: 'PENDING',
          parserVersion: 'tirvu-v1',
          filename: filename ?? 'unknown.xlsx',
          fileSize: buffer.length,
          fileHash,
          storagePath: '',
          ipAddress,
          userAgent,
        },
      })

      try {
        const persisted = await storagePersist({
          tenantId,
          jobId: job.id,
          buffer,
          filename: filename ?? 'unknown.xlsx',
        })

        await fastify.prisma.importJob.update({
          where: { id: job.id },
          data: { storagePath: persisted.storagePath },
        })

        await fastify.prisma.auditLog.create({
          data: {
            tenantId,
            userId: user.userId,
            action: 'EMPLOYEE_IMPORT_JOB_CREATED',
            resourceType: 'IMPORT_JOB',
            resourceId: job.id,
            ip: ipAddress,
            userAgent,
          },
        })

        await fastify.tirvuImportQueue.add('process', { jobId: job.id })

        fastify.log.info(
          { module: 'imports', importJobId: job.id, tenantId, phase: 'upload' },
          'EMPLOYEE_IMPORT_JOB_CREATED',
        )

        return reply
          .code(201)
          .send(envelope({ jobId: job.id, status: 'PENDING' }))
      } catch (err) {
        fastify.log.error(
          {
            module: 'imports',
            importJobId: job.id,
            tenantId,
            phase: 'upload',
            error: (err as Error).message?.slice(0, 200),
          },
          'upload pipeline failed after ImportJob created',
        )
        throw err
      }
    },
  )
}

export default route
