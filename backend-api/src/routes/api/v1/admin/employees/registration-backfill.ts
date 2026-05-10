import type { FastifyPluginAsync } from 'fastify'
import { parseRows } from '../../../../../modules/imports/tirvu-parser'
import { normalizeMatricula } from '../../../../../modules/imports/matricula'
import { parseCpfNoMask } from '../../../../../modules/imports/utils'

/**
 * V3.4 FASE D1.5: Backfill de Employee.registration via re-upload do XLSX Tirvu.
 *
 * Após corrigir o bug do mapper (D1) que não populava registration, os 1045
 * colaboradores já cadastrados continuam sem matrícula. Em vez de pedir
 * re-import completo (que recriaria allocations etc), este endpoint apenas
 * lê o XLSX Tirvu, casa por CPF, e atualiza Employee.registration onde nulo
 * ou divergente. Idempotente.
 */

interface BackfillRowResult {
  cpf: string
  outcome: 'updated' | 'unchanged' | 'unmatched' | 'invalid_row'
  registrationBefore?: string | null
  registrationAfter?: string | null
  message?: string
}

const backfill: FastifyPluginAsync = async (fastify) => {
  fastify.post('/registration/backfill', {
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
    const rows: BackfillRowResult[] = []

    try {
      for await (const row of parseRows(buffer)) {
        const cpfDigits = parseCpfNoMask(row.cpf)
        const newReg = normalizeMatricula(row.matricula)

        if (!cpfDigits) {
          rows.push({ cpf: row.cpf ?? '?', outcome: 'invalid_row', message: 'CPF inválido na planilha.' })
          continue
        }

        const employee = await fastify.prisma.employee.findFirst({
          where: { tenantId: user.tenantId, cpf: cpfDigits },
          select: { id: true, registration: true, name: true },
        })

        if (!employee) {
          rows.push({ cpf: cpfDigits, outcome: 'unmatched', message: 'CPF da planilha não bate com nenhum colaborador no sistema.' })
          continue
        }

        const currentReg = normalizeMatricula(employee.registration)
        if (currentReg === newReg) {
          rows.push({ cpf: cpfDigits, outcome: 'unchanged', registrationBefore: employee.registration, registrationAfter: employee.registration })
          continue
        }

        await fastify.prisma.employee.update({
          where: { id: employee.id },
          data: { registration: newReg },
        })
        await fastify.prisma.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.userId,
            action: 'REGISTRATION_BACKFILL',
            resourceType: 'EMPLOYEE',
            resourceId: employee.id,
            previousData: { registration: employee.registration } as never,
            newData: { registration: newReg, source: 'tirvu_xlsx' } as never,
          },
        })

        rows.push({
          cpf: cpfDigits,
          outcome: 'updated',
          registrationBefore: employee.registration,
          registrationAfter: newReg,
        })
      }
    } catch (e: any) {
      return reply.code(400).send({
        data: null,
        error: { code: 'PARSE_ERROR', message: e?.message || 'Falha ao ler planilha Tirvu.' },
      })
    }

    const summary = {
      total: rows.length,
      updated: rows.filter(r => r.outcome === 'updated').length,
      unchanged: rows.filter(r => r.outcome === 'unchanged').length,
      unmatched: rows.filter(r => r.outcome === 'unmatched').length,
      invalid: rows.filter(r => r.outcome === 'invalid_row').length,
    }

    return {
      data: {
        summary,
        results: rows.slice(0, 100),
        truncated: rows.length > 100,
      },
      error: null,
    }
  })
}

export default backfill
