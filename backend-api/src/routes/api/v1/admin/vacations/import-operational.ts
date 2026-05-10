import type { FastifyPluginAsync } from 'fastify'
import { parseTirvuOperational } from '../../../../../modules/imports/tirvu-operational-parser'
import { parseISO } from 'date-fns'

/**
 * V3.4 Story 4.21: import em massa a partir do XLS "Gestao Operacional" do Tirvu.
 *
 * Para cada registro Motivo=FERIAS:
 * 1. Match titular por matricula. Sem match → skip (sem_match).
 * 2. Detecta VacationRequest ja existente (mesmo employee + mesmas datas) → ja_existe.
 * 3. Cria VacationRequest APPROVED com dispatchNote indicando origem.
 * 4. Se ha substituto e matricula, match e cria CoverageAssignment ACTIVE
 *    ligado ao workplacePosition ativo do titular.
 *
 * Idempotente: re-rodar nao duplica.
 *
 * POST multipart com campo 'file' (.xls/.xlsx) + query ?dryRun=true para preview.
 */
const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/import-operational', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; role: string }
    if (!['ADMIN', 'SUPERADMIN'].includes(user.role)) {
      return reply.code(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Apenas ADMIN/SUPERADMIN.' } })
    }

    const file = await request.file()
    if (!file) return reply.code(400).send({ data: null, error: { code: 'NO_FILE', message: 'Envie a planilha do Tirvu (Gestao Operacional).' } })
    const buffer = await file.toBuffer()

    const q = request.query as { dryRun?: string }
    const dryRun = q.dryRun === 'true'

    const parsed = parseTirvuOperational(buffer)

    type Result =
      | { rowIndex: number; titular: string; status: 'created' | 'already_exists' | 'no_match' | 'no_dates' | 'coverage_created' | 'coverage_no_substituto_match' | 'coverage_no_allocation'; vacationRequestId?: string; coverageId?: string; reason?: string }
    const results: Result[] = []
    let created = 0, alreadyExists = 0, noMatch = 0, noDates = 0
    let coverageCreated = 0, coverageNoMatch = 0, coverageNoAlloc = 0

    for (const rec of parsed.records) {
      if (rec.motivo !== 'FERIAS') continue
      if (!rec.titularMatricula) {
        results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'no_match', reason: 'Matricula do titular ausente.' })
        noMatch++; continue
      }
      if (!rec.inicioVigencia || !rec.fimVigencia) {
        results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'no_dates', reason: 'Inicio/Fim de vigencia ausentes.' })
        noDates++; continue
      }

      const titular = await fastify.prisma.employee.findFirst({
        where: { tenantId: user.tenantId, registration: rec.titularMatricula },
        include: { allocations: { where: { status: 'ACTIVE' }, include: { workplacePosition: true }, take: 1 } },
      })
      if (!titular) {
        results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'no_match', reason: `Sem colaborador com matricula ${rec.titularMatricula}.` })
        noMatch++; continue
      }

      const start = parseISO(rec.inicioVigencia)
      const end = parseISO(rec.fimVigencia)
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)

      // Idempotencia: mesma combinacao (employee + startDate + endDate + status not CANCELLED/REJECTED)
      const existing = await fastify.prisma.vacationRequest.findFirst({
        where: {
          tenantId: user.tenantId,
          employeeId: titular.id,
          startDate: start,
          endDate: end,
          status: { notIn: ['CANCELLED', 'REJECTED'] },
        },
      })
      let vacationRequestId: string
      if (existing) {
        vacationRequestId = existing.id
        alreadyExists++
        results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'already_exists', vacationRequestId })
      } else if (!dryRun) {
        const dispatchNote = `Importada da Gestão Operacional Tirvu (ID ${rec.tirvuId ?? '?'}) · ${rec.posto ?? 'sem posto'}${rec.observacoes ? ' · ' + rec.observacoes : ''}`
        const cr = await fastify.prisma.vacationRequest.create({
          data: {
            tenantId: user.tenantId,
            employeeId: titular.id,
            startDate: start,
            endDate: end,
            days,
            status: 'APPROVED',
            dispatchNote: dispatchNote.slice(0, 500),
            coverageWaived: rec.semCobertura,
            coverageWaiverReason: rec.semCobertura ? (rec.observacoes || 'Importado SEM COBERTURA da planilha Tirvu') : null,
          },
        })
        vacationRequestId = cr.id
        created++
        results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'created', vacationRequestId })
      } else {
        // dryRun: simula
        created++
        results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'created' })
        continue
      }

      // Cobertura
      if (!rec.semCobertura && rec.substitutoMatricula) {
        const sub = await fastify.prisma.employee.findFirst({
          where: { tenantId: user.tenantId, registration: rec.substitutoMatricula },
        })
        if (!sub) {
          results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'coverage_no_substituto_match', reason: `Substituto ${rec.substitutoNome} matr ${rec.substitutoMatricula} nao encontrado.` })
          coverageNoMatch++; continue
        }
        const alloc = titular.allocations[0]
        if (!alloc) {
          results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'coverage_no_allocation', reason: 'Titular sem allocation ACTIVE — nao posso vincular cobertura.' })
          coverageNoAlloc++; continue
        }
        // Idempotencia cobertura
        const existingCov = await fastify.prisma.coverageAssignment.findFirst({
          where: {
            tenantId: user.tenantId,
            vacationRequestId,
            replacementEmployeeId: sub.id,
            status: { in: ['PLANNED', 'ACTIVE'] },
          },
        })
        if (existingCov) {
          results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'coverage_created', coverageId: existingCov.id, reason: 'ja existente' })
          continue
        }
        if (!dryRun) {
          try {
            const cov = await fastify.prisma.coverageAssignment.create({
              data: {
                tenantId: user.tenantId,
                vacationRequestId,
                replacementEmployeeId: sub.id,
                workplacePositionId: alloc.workplacePosition.id,
                startDate: start,
                endDate: end,
                type: sub.isFerista ? 'FERISTA' : 'INTERMITENTE',
                status: 'ACTIVE',
                cost: sub.salary ? (Number(sub.salary) / 30) * days : null,
              },
            })
            coverageCreated++
            results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'coverage_created', coverageId: cov.id })
          } catch (err: any) {
            const sqlState = err?.meta?.code || err?.code
            if (sqlState === '23P01' || String(err?.message || '').includes('coverage_assignments_no_overlap_active')) {
              results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'coverage_no_substituto_match', reason: 'Substituto ja em cobertura sobreposta.' })
              coverageNoMatch++
            } else {
              throw err
            }
          }
        } else {
          coverageCreated++
        }
      }
    }

    await fastify.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        action: 'VACATION_BULK_IMPORT_OPERATIONAL',
        resourceType: 'VACATION_REQUEST',
        resourceId: '00000000-0000-0000-0000-000000000000',
        newData: {
          dryRun,
          fileRows: parsed.records.length,
          parsedVacations: parsed.vacationCount,
          created,
          alreadyExists,
          noMatch,
          noDates,
          coverageCreated,
          coverageNoMatch,
          coverageNoAlloc,
        } as never,
      },
    }).catch(() => { /* nao deixa auditoria quebrar o import */ })

    return reply.send({
      data: {
        summary: {
          dryRun,
          totalRows: parsed.records.length,
          ferias: parsed.vacationCount,
          created,
          alreadyExists,
          noMatch,
          noDates,
          coverageCreated,
          coverageNoMatch,
          coverageNoAlloc,
        },
        results,
      },
      error: null,
    })
  })
}

export default route
