// TODO(v3-3-rbac-data-driven): rota usa requirePermission('import.run')
// via mapa estático (Story 5.1). Migrar para data-driven em v3-3.

import type { FastifyPluginAsync } from 'fastify'
import { processUploadedImport } from '../../../../../modules/imports/upload-flow'
import { validateUploadedFile } from '../../../../../modules/imports/upload-validators'

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
        fastify.requireAdmin,
        fastify.requirePermission('import.run'),
      ],
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const user = request.user as { userId: string; tenantId?: string; role?: string }
      const tenantId = user.tenantId

      if (!tenantId) {
        return reply.code(400).send(
          envelope(null, {
            code: 'INVALID_TARGET_TENANT',
            message:
              'Esta rota é para usuários com tenant. SUPERADMIN deve usar /admin/imports/employees',
          }),
        )
      }

      let data: Awaited<ReturnType<typeof request.file>>
      try {
        data = await request.file()
      } catch (err) {
        const e = err as { code?: string }
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

      const fileCheck = validateUploadedFile({ filename, size: buffer.length })
      if (!fileCheck.ok) {
        const status = fileCheck.code === 'FILE_TOO_LARGE' ? 413 : 400
        return reply
          .code(status)
          .send(envelope(null, { code: fileCheck.code, message: fileCheck.message }))
      }

      const tenant = await fastify.prisma.tenant.findUnique({
        where: { id: tenantId },
      })
      if (!tenant || !tenant.isActive) {
        return reply.code(400).send(
          envelope(null, {
            code: 'INVALID_TARGET_TENANT',
            message: 'Tenant não encontrado ou inativo',
          }),
        )
      }

      const ipAddress = request.ip
      const userAgent = request.headers['user-agent'] ?? null

      try {
        const result = await processUploadedImport(
          fastify.prisma,
          fastify.tirvuImportQueue,
          {
            tenantId,
            operatorUserId: user.userId,
            buffer,
            filename: filename ?? 'unknown.xlsx',
            ipAddress,
            userAgent,
          },
        )

        fastify.log.info(
          { module: 'imports', importJobId: result.jobId, tenantId, phase: 'upload' },
          'EMPLOYEE_IMPORT_JOB_CREATED',
        )

        return reply.code(201).send(envelope(result))
      } catch (err) {
        fastify.log.error(
          {
            module: 'imports',
            tenantId,
            phase: 'upload',
            error: (err as Error).message?.slice(0, 200),
          },
          'upload pipeline failed',
        )
        throw err
      }
    },
  )
}

export default route
