// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type { PrismaClient } from '@prisma/client'
import type { PreviewSummary, RowCategory } from './types'
import { isUuid } from './utils'

export type PreviewScope = 'admin' | 'tenant'

export interface PreviewDeps {
  prisma: PrismaClient
}

export interface PreviewRequest {
  user?: { userId: string; tenantId?: string; role?: string }
  query?: { status?: string; page?: string | number; limit?: string | number }
}

export interface PreviewReply {
  code(c: number): PreviewReply
  send(payload: unknown): PreviewReply
}

export interface PreviewEntrypointInput {
  jobId: string
  scope: PreviewScope
}

const PREVIEW_AVAILABLE_STATES = new Set([
  'PREVIEW_READY',
  'APPLYING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
])

const VALID_CATEGORIES = new Set<RowCategory>([
  'create',
  'update',
  'unchanged',
  'reactivation',
  'invalid',
  'absent',
])

function envelope(
  data: unknown,
  error: { code: string; message: string } | null = null,
  meta: unknown = null,
) {
  return { data, error, meta }
}

function clampInt(
  v: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

export async function previewEntrypoint(
  deps: PreviewDeps,
  request: PreviewRequest,
  reply: PreviewReply,
  input: PreviewEntrypointInput,
): Promise<PreviewReply> {
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

  if (!PREVIEW_AVAILABLE_STATES.has(job.status) || !job.previewSummary) {
    return reply.code(409).send(
      envelope(null, {
        code: 'INVALID_JOB_STATE',
        message: 'Preview ainda não disponível',
      }),
    )
  }

  const summary = job.previewSummary as unknown as PreviewSummary

  const q = request.query ?? {}
  const statusFilter =
    q.status && VALID_CATEGORIES.has(q.status as RowCategory)
      ? (q.status as RowCategory)
      : null
  const page = clampInt(q.page, 1, Number.MAX_SAFE_INTEGER, 1)
  const limit = clampInt(q.limit, 1, 200, 50)

  const allRows = summary.sampleRows ?? []
  const filtered = statusFilter
    ? allRows.filter((r) => r.status === statusFilter)
    : allRows

  const total = filtered.length
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit)
  const start = (page - 1) * limit
  const rows = filtered.slice(start, start + limit)

  return reply.code(200).send(
    envelope(
      {
        rows,
        counts: summary.counts,
        newWorkplaces: summary.newWorkplaces,
        relationalDelta: summary.relationalDelta ?? null,
      },
      null,
      { pagination: { page, limit, total, totalPages } },
    ),
  )
}
