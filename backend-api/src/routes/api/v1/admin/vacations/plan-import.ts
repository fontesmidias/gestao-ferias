import type { FastifyPluginAsync } from 'fastify'
import { differenceInDays, format } from 'date-fns'
import { ImportService } from '../../../../../modules/employees/import-service'
import { SanitizationService } from '../../../../../modules/employees/sanitization-service'

/**
 * V3.4 MVP M8-M11: Importer de Plano de Férias admin-driven.
 *
 * Diferenças do POST /vacations/import legado:
 * - Cria diretamente com status='APPROVED' (admin-driven, simula planilha manual).
 * - Idempotente: (employee, startDate) já existente em APPROVED/PENDING/SIGNED é
 *   pulado em vez de duplicar (M10).
 * - Anti-overlap (M6 reutilizado): linhas com sobreposição contra férias já
 *   existentes contam como skipped_overlap, não criam, não bloqueiam o batch.
 * - AuditLog VACATION_PLAN_IMPORT por linha criada (M11).
 * - Retorna preview detalhado: created, skipped_idempotent, skipped_overlap,
 *   errors com mensagens.
 */

interface ImportRow {
  employeeCpf?: string
  startDate?: string
  endDate?: string
  days?: string
  dispatchNote?: string
}

interface RowResult {
  rowIndex: number
  cpf?: string
  outcome: 'created' | 'skipped_idempotent' | 'skipped_overlap' | 'error'
  message?: string
  vacationRequestId?: string
}

const planImport: FastifyPluginAsync = async (fastify) => {
  fastify.post('/plan/import', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; role: string }
    if (!['ADMIN', 'SUPERADMIN'].includes(user.role)) {
      return reply.code(403).send({
        data: null,
        error: { code: 'FORBIDDEN', message: 'Apenas ADMIN/SUPERADMIN.' },
      })
    }

    const file = await request.file()
    if (!file) {
      return reply.code(400).send({
        data: null,
        error: { code: 'NO_FILE', message: 'Nenhum arquivo enviado.' },
      })
    }

    const buffer = await file.toBuffer()
    const ext = file.filename.split('.').pop()?.toLowerCase() || ''

    let rows: ImportRow[] = []
    try {
      rows = await ImportService.parseVacations(buffer, ext) as ImportRow[]
    } catch (e: any) {
      return reply.code(400).send({
        data: null,
        error: { code: 'PARSE_ERROR', message: e?.message || 'Falha ao ler planilha.' },
      })
    }

    const results: RowResult[] = []
    const importedAt = format(new Date(), 'dd/MM/yyyy HH:mm')

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowIndex = i + 2 // +2: header + 1-based

      try {
        if (!row.employeeCpf || !row.startDate || !row.endDate) {
          results.push({ rowIndex, cpf: row.employeeCpf, outcome: 'error', message: 'Dados incompletos (CPF, data início ou data fim).' })
          continue
        }

        const cpf = SanitizationService.sanitizeCPF(row.employeeCpf)
        const employee = await fastify.prisma.employee.findFirst({
          where: { cpf, tenantId: user.tenantId },
          select: { id: true, name: true },
        })
        if (!employee) {
          results.push({ rowIndex, cpf: row.employeeCpf, outcome: 'error', message: `CPF ${row.employeeCpf} não encontrado no tenant.` })
          continue
        }

        const start = SanitizationService.sanitizeDate(row.startDate)
        const end = SanitizationService.sanitizeDate(row.endDate)
        if (end < start) {
          results.push({ rowIndex, cpf: row.employeeCpf, outcome: 'error', message: 'Data fim anterior à data início.' })
          continue
        }
        const days = row.days ? parseInt(String(row.days)) : differenceInDays(end, start) + 1

        // M10: idempotência — (employee, startDate) já existente.
        const sameStart = await fastify.prisma.vacationRequest.findFirst({
          where: {
            tenantId: user.tenantId,
            employeeId: employee.id,
            startDate: start,
            status: { in: ['APPROVED', 'PENDING', 'SIGNED', 'COMPLETED'] },
          },
          select: { id: true },
        })
        if (sameStart) {
          results.push({ rowIndex, cpf: row.employeeCpf, outcome: 'skipped_idempotent', message: `Já existe férias para ${employee.name} iniciando em ${format(start, 'dd/MM/yyyy')}.`, vacationRequestId: sameStart.id })
          continue
        }

        // M6 reutilizado: anti-overlap.
        const overlap = await fastify.prisma.vacationRequest.findFirst({
          where: {
            tenantId: user.tenantId,
            employeeId: employee.id,
            status: { in: ['APPROVED', 'PENDING', 'SIGNED', 'COMPLETED'] },
            AND: [
              { startDate: { lte: end } },
              { endDate: { gte: start } },
            ],
          },
          select: { id: true, startDate: true, endDate: true },
        })
        if (overlap) {
          const ds = format(overlap.startDate, 'dd/MM/yyyy')
          const de = format(overlap.endDate, 'dd/MM/yyyy')
          results.push({ rowIndex, cpf: row.employeeCpf, outcome: 'skipped_overlap', message: `Sobreposição com férias existente (${ds} → ${de}).` })
          continue
        }

        const note = row.dispatchNote?.trim() || `Plano importado em ${importedAt}`
        const created = await fastify.prisma.vacationRequest.create({
          data: {
            tenantId: user.tenantId,
            employeeId: employee.id,
            startDate: start,
            endDate: end,
            days,
            status: 'APPROVED',
            dispatchNote: note,
          },
        })

        // M11: AuditLog dedicado.
        await fastify.prisma.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.userId,
            action: 'VACATION_PLAN_IMPORT',
            resourceType: 'VACATION_REQUEST',
            resourceId: created.id,
            newData: {
              employeeId: employee.id,
              cpf: row.employeeCpf,
              startDate: format(start, 'yyyy-MM-dd'),
              endDate: format(end, 'yyyy-MM-dd'),
              days,
              dispatchNote: note,
              importBatch: importedAt,
              rowIndex,
            } as never,
          },
        })

        results.push({ rowIndex, cpf: row.employeeCpf, outcome: 'created', vacationRequestId: created.id })
      } catch (err: any) {
        results.push({ rowIndex, cpf: row.employeeCpf, outcome: 'error', message: err?.message || 'Erro inesperado.' })
      }
    }

    const summary = {
      total: rows.length,
      created: results.filter(r => r.outcome === 'created').length,
      skipped_idempotent: results.filter(r => r.outcome === 'skipped_idempotent').length,
      skipped_overlap: results.filter(r => r.outcome === 'skipped_overlap').length,
      errors: results.filter(r => r.outcome === 'error').length,
    }

    return {
      data: {
        summary,
        // Limita a 50 linhas detalhadas para evitar payload gigante.
        results: results.slice(0, 50),
        truncated: results.length > 50,
      },
      error: null,
      meta: { importBatch: importedAt },
    }
  })
}

export default planImport
