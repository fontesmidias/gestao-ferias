// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type { PrismaClient } from '@prisma/client'
import { buildErrorReportXlsx } from './error-report-builder'
import { FileIntegrityError, type PreviewSummary } from './types'
import { isUuid } from './utils'

export type ErrorReportScope = 'admin' | 'tenant'

export interface ErrorReportLogger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

export interface ErrorReportDeps {
  prisma: PrismaClient
  log: ErrorReportLogger
}

export interface ErrorReportRequest {
  user?: { userId: string; tenantId?: string; role?: string }
}

export interface ErrorReportReply {
  code(c: number): ErrorReportReply
  header(name: string, value: string): ErrorReportReply
  send(payload?: unknown): ErrorReportReply
}

export interface ErrorReportEntrypointInput {
  jobId: string
  scope: ErrorReportScope
}

const REPORT_AVAILABLE_STATES = new Set([
  'PREVIEW_READY',
  'APPLYING',
  'COMPLETED',
  'FAILED',
])

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function envelope(
  data: unknown,
  error: { code: string; message: string } | null = null,
  meta: unknown = null,
) {
  return { data, error, meta }
}

function safeFilename(filename: string | null | undefined): string {
  const base = (filename ?? 'import').replace(/\.xlsx$/i, '')
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  return cleaned.length > 0 ? cleaned : 'import'
}

export async function errorReportEntrypoint(
  deps: ErrorReportDeps,
  request: ErrorReportRequest,
  reply: ErrorReportReply,
  input: ErrorReportEntrypointInput,
): Promise<ErrorReportReply> {
  const user = request.user
  if (!user) {
    return reply
      .code(401)
      .send(envelope(null, { code: 'UNAUTHORIZED', message: 'Sessão inválida' }))
  }

  if (!isUuid(input.jobId)) {
    return reply
      .code(404)
      .send(envelope(null, { code: 'JOB_NOT_FOUND', message: 'Job não encontrado' }))
  }

  const job = await deps.prisma.importJob.findUnique({
    where: { id: input.jobId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      fileHash: true,
      filename: true,
      previewSummary: true,
    },
  })

  if (!job) {
    return reply
      .code(404)
      .send(envelope(null, { code: 'JOB_NOT_FOUND', message: 'Job não encontrado' }))
  }

  if (input.scope === 'tenant') {
    if (!user.tenantId || job.tenantId !== user.tenantId) {
      return reply
        .code(404)
        .send(envelope(null, { code: 'JOB_NOT_FOUND', message: 'Job não encontrado' }))
    }
  }

  if (!REPORT_AVAILABLE_STATES.has(job.status)) {
    return reply.code(409).send(
      envelope(null, {
        code: 'INVALID_JOB_STATE',
        message: 'Relatório de erros não disponível neste estado',
      }),
    )
  }

  const summary = job.previewSummary as unknown as PreviewSummary | null
  if (!summary || summary.counts.invalid === 0) {
    return reply.code(204).send()
  }

  let buffer: Buffer
  try {
    const result = await buildErrorReportXlsx({
      tenantId: job.tenantId,
      jobId: job.id,
      fileHash: job.fileHash,
    })
    buffer = result.buffer
  } catch (err) {
    if (err instanceof FileIntegrityError) {
      deps.log.error(
        {
          module: 'imports',
          importJobId: job.id,
          tenantId: job.tenantId,
          phase: 'error-report',
        },
        'FileIntegrityError ao gerar relatório de erros',
      )
      return reply.code(500).send(
        envelope(null, {
          code: 'FILE_INTEGRITY_FAILED',
          message: 'Arquivo original corrompido — não foi possível gerar relatório',
        }),
      )
    }
    throw err
  }

  const safe = safeFilename(job.filename)
  reply.header('Content-Type', XLSX_MIME)
  reply.header('Content-Disposition', `attachment; filename="${safe}-erros.xlsx"`)
  return reply.code(200).send(buffer)
}
