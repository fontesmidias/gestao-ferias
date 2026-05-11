import type { FastifyPluginAsync } from 'fastify'
import { parseISO, differenceInDays } from 'date-fns'
import { VacationEngine } from '../../../../../modules/vacations/vacation-engine'
import { parseTirvuOperational } from '../../../../../modules/imports/tirvu-operational-parser'
import { parseDexionForecast } from '../../../../../modules/imports/dexion-forecast-parser'

/**
 * V3.4 MVP M4: Admin programa férias diretamente em nome do colaborador.
 *
 * Operação Green House: RH já sabe quem entra de férias nos próximos meses
 * (planilha manual). Não faz sentido forçar workflow PENDING→APPROVED.
 * Endpoint cria VacationRequest direto APPROVED com auditoria.
 *
 * Validações:
 * - Anti-overlap (M6): mesmo employee não pode ter outra VacationRequest em
 *   status APPROVED/PENDING/SIGNED no mesmo período.
 * - Saldo CLT (M7): valida via VacationEngine; com flag overrideBalance=true
 *   o ADMIN pode forçar criação (registrado em AuditLog).
 * - Regras CLT do VacationEngine (Art. 134): aplicadas igual ao endpoint público.
 */

const programmedVacations: FastifyPluginAsync = async (fastify) => {
  fastify.post('/programmed', {
    onRequest: [fastify.requireAuth],
    schema: {
      body: {
        type: 'object',
        required: ['employeeId', 'startDate', 'endDate'],
        properties: {
          employeeId: { type: 'string', format: 'uuid' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          dispatchNote: { type: 'string' },
          overrideBalance: { type: 'boolean', default: false },
          overrideOverlap: { type: 'boolean', default: false },
          // V3.4 Story 4.19: dispensa explicita de cobertura
          coverageWaived: { type: 'boolean', default: false },
          coverageWaiverReason: { type: 'string', maxLength: 500 },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; role: string }
    if (!['ADMIN', 'SUPERADMIN'].includes(user.role)) {
      return reply.code(403).send({
        data: null,
        error: { code: 'FORBIDDEN', message: 'Apenas ADMIN/SUPERADMIN.' },
      })
    }

    const body = request.body as {
      employeeId: string
      startDate: string
      endDate: string
      dispatchNote?: string
      overrideBalance?: boolean
      overrideOverlap?: boolean
      coverageWaived?: boolean
      coverageWaiverReason?: string
    }
    if (body.coverageWaived && !body.coverageWaiverReason?.trim()) {
      return reply.code(422).send({
        data: null,
        error: { code: 'WAIVER_REASON_REQUIRED', message: 'Ao dispensar cobertura, informe o motivo.' },
      })
    }

    const start = parseISO(body.startDate)
    const end = parseISO(body.endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return reply.code(400).send({
        data: null,
        error: { code: 'INVALID_DATES', message: 'Datas inválidas.' },
      })
    }
    if (end < start) {
      return reply.code(400).send({
        data: null,
        error: { code: 'INVALID_RANGE', message: 'endDate deve ser >= startDate.' },
      })
    }
    const days = differenceInDays(end, start) + 1

    const employee = await fastify.prisma.employee.findFirst({
      where: { id: body.employeeId, tenantId: user.tenantId },
    })
    if (!employee) {
      return reply.code(404).send({
        data: null,
        error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Colaborador não encontrado.' },
      })
    }

    // M6: anti-overlap — outras férias APPROVED/PENDING/SIGNED do mesmo employee
    // que sobreponham o período pedido.
    const conflicting = await fastify.prisma.vacationRequest.findMany({
      where: {
        tenantId: user.tenantId,
        employeeId: body.employeeId,
        status: { in: ['APPROVED', 'PENDING', 'SIGNED', 'COMPLETED'] },
        AND: [
          { startDate: { lte: end } },
          { endDate: { gte: start } },
        ],
      },
      select: { id: true, startDate: true, endDate: true, status: true },
    })
    if (conflicting.length > 0 && !body.overrideOverlap) {
      return reply.code(409).send({
        data: null,
        error: {
          code: 'VACATION_OVERLAP',
          message: 'Colaborador já possui férias sobrepondo este período.',
          conflicts: conflicting,
        },
      })
    }

    // M7: validação CLT + saldo. Se !overrideBalance, bloqueia. Caso contrário audita.
    const periods = VacationEngine.calculatePeriods(employee.hireDate, 0, employee.balanceOffset)
    const totalBalance = periods.reduce((acc, p) => acc + p.daysOfRight, 0)
    const targetPeriod = periods.find(p => start >= p.startDate && start < p.endDate)
    const periodDaysOfRight = targetPeriod?.daysOfRight ?? 30
    const existingRequests = await fastify.prisma.vacationRequest.findMany({
      where: {
        employeeId: body.employeeId,
        tenantId: user.tenantId,
        status: { not: 'REJECTED' },
        startDate: { gte: targetPeriod?.startDate ?? new Date(0) },
        endDate: { lt: targetPeriod?.endDate ?? new Date('2999-12-31') },
      },
      select: { startDate: true, endDate: true, days: true, status: true },
    })
    const validation = await VacationEngine.validateRequestFull(start, end, totalBalance, {
      tenantId: user.tenantId,
      resolver: fastify.holidayResolver,
      fractionContext: {
        existingFractions: existingRequests,
        periodDaysOfRight,
      },
    })
    if (!validation.isValid && !body.overrideBalance) {
      return reply.code(422).send({
        data: null,
        error: {
          code: 'CLT_VIOLATION',
          message: 'A solicitação viola regras da CLT (Art. 134).',
          details: validation.errors,
          codes: validation.errorDetails?.map(e => e.code),
        },
      })
    }

    // V3.4 Story 4.6: bloqueia se este colaborador esta como replacement em
    // CoverageAssignment PLANNED/ACTIVE sobreposta. Override por overrideOverlap=true.
    const conflictingCoverage = await fastify.prisma.coverageAssignment.findFirst({
      where: {
        tenantId: user.tenantId,
        replacementEmployeeId: body.employeeId,
        status: { in: ['PLANNED', 'ACTIVE'] },
        AND: [
          { startDate: { lte: end } },
          { endDate: { gte: start } },
        ],
      },
      include: {
        workplacePosition: { select: { role: true, workplace: { select: { name: true } } } },
        vacationRequest: { select: { employee: { select: { name: true } } } },
      },
    })
    if (conflictingCoverage && !body.overrideOverlap) {
      return reply.code(409).send({
        data: null,
        error: {
          code: 'EMPLOYEE_HAS_ACTIVE_COVERAGE',
          message: `${employee.name} esta atribuido como substituto em cobertura ${conflictingCoverage.status} de ${conflictingCoverage.vacationRequest.employee.name} (${conflictingCoverage.workplacePosition.workplace.name} / ${conflictingCoverage.workplacePosition.role}). Remova/reagende a cobertura ou marque overrideOverlap.`,
          conflict: {
            coverageId: conflictingCoverage.id,
            status: conflictingCoverage.status,
            startDate: conflictingCoverage.startDate,
            endDate: conflictingCoverage.endDate,
            coveringFor: conflictingCoverage.vacationRequest.employee.name,
            workplace: conflictingCoverage.workplacePosition.workplace.name,
            role: conflictingCoverage.workplacePosition.role,
          },
        },
      })
    }

    // Cria APPROVED com dispatchNote indicando origem.
    const note = body.dispatchNote?.trim() || 'Programada pelo RH'
    const created = await fastify.prisma.vacationRequest.create({
      data: {
        tenantId: user.tenantId,
        employeeId: body.employeeId,
        startDate: start,
        endDate: end,
        days,
        status: 'APPROVED',
        dispatchNote: note,
        coverageWaived: body.coverageWaived ?? false,
        coverageWaiverReason: body.coverageWaived ? body.coverageWaiverReason?.trim() : null,
      },
    })

    await fastify.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.userId,
        action: 'VACATION_PROGRAMMED',
        resourceType: 'VACATION_REQUEST',
        resourceId: created.id,
        newData: {
          employeeId: body.employeeId,
          startDate: body.startDate,
          endDate: body.endDate,
          days,
          dispatchNote: note,
          overrideBalance: body.overrideBalance ?? false,
          overrideOverlap: body.overrideOverlap ?? false,
          conflicts: conflicting.length,
          cltWarnings: validation.isValid ? [] : validation.errors,
        } as never,
      },
    })

    return reply.code(201).send({
      data: created,
      error: null,
      meta: {
        cltWarnings: validation.isValid ? [] : validation.errors,
        overlapDetected: conflicting.length > 0,
      },
    })
  })

  // ============================================================================
  // V3.4 Story 4.21: Import Tirvu Gestao Operacional (movido de import-operational.ts
  // porque fastify-autoload nao estava carregando o arquivo separado).
  // ============================================================================

  fastify.get('/import-operational/ping', { onRequest: [fastify.requireAuth] }, async () => ({ ok: true, route: 'import-operational' }))

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

    let parsed
    try {
      parsed = parseTirvuOperational(buffer)
    } catch (err: any) {
      return reply.code(400).send({
        data: null,
        error: {
          code: 'PARSE_FAILED',
          message: `Nao consegui ler a planilha. Verifique se enviou o XLS "Gestao Operacional" do Tirvu (com colunas Status, Motivo, Colaborador, Matricula, Posto, Substituto, Vigencia). Detalhe tecnico: ${err?.message || 'erro desconhecido'}`,
        },
      })
    }
    if (parsed.records.length === 0) {
      return reply.code(400).send({
        data: null,
        error: {
          code: 'EMPTY_OR_WRONG_FILE',
          message: 'A planilha foi lida mas nenhuma linha foi reconhecida. Voce enviou o arquivo certo? Esperado: "Gestao Operacional - YYYY-MM-DD a YYYY-MM-DD.xls" do Tirvu — NAO o "Trabalhadores" nem o "Plano de Ferias".',
        },
      })
    }
    if (parsed.vacationCount === 0) {
      return reply.code(400).send({
        data: null,
        error: {
          code: 'NO_VACATIONS_FOUND',
          message: `Planilha lida (${parsed.records.length} linhas), mas nenhuma tem Motivo=FERIAS. Provavel que voce enviou um arquivo diferente — esperado: "Gestao Operacional" do Tirvu com pelo menos 1 colaborador em ferias no periodo.`,
        },
      })
    }

    type Result =
      | { rowIndex: number; titular: string; status: 'created' | 'already_exists' | 'no_match' | 'no_dates' | 'coverage_created' | 'coverage_no_substituto_match' | 'coverage_no_allocation'; vacationRequestId?: string; coverageId?: string; reason?: string }
    const results: Result[] = []
    let createdCount = 0, alreadyExists = 0, noMatch = 0, noDates = 0
    let coverageCreated = 0, coverageNoMatch = 0, coverageNoAlloc = 0

    for (const rec of parsed.records) {
      if (rec.motivo !== 'FERIAS') continue
      try {
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

      let start = parseISO(rec.inicioVigencia)
      let end = parseISO(rec.fimVigencia)
      // V3.4 fix: Tirvu exporta colunas com Inicio/Fim invertidas em alguns rows
      // (Data OS no lugar de Fim Vigencia). Detecta e auto-corrige.
      if (end < start) {
        const tmp = start; start = end; end = tmp
      }
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
      // Sanity: se diferenca > 365 dias, provavelmente nao e ferias real — skip
      if (days > 365) {
        results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'no_dates', reason: `Periodo absurdo (${days}d). Verificar planilha origem.` })
        noDates++; continue
      }

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
        createdCount++
        results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'created', vacationRequestId })
      } else {
        createdCount++
        results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'created' })
        continue
      }

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
      } catch (err: any) {
        // Linha quebrou — registra e segue. Evita 500 no batch inteiro.
        const msg = err?.message || err?.code || 'erro desconhecido'
        results.push({ rowIndex: rec.rowIndex, titular: rec.titularNome, status: 'no_dates', reason: `Erro ao processar linha: ${msg.slice(0, 200)}` })
        noDates++
        fastify.log.warn({ err: msg, rowIndex: rec.rowIndex }, 'import-operational: linha falhou')
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
          created: createdCount,
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
          created: createdCount,
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

  // ============================================================================
  // V3.4 Story 4.22: Analise da Previsao de Ferias Dexion vs sistema.
  // Read-only: parseia o XLS, casa por matricula, lista divergencias.
  // ============================================================================

  fastify.post('/analyze-dexion-forecast', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const user = request.user as { tenantId: string; role: string }
    if (!['ADMIN', 'SUPERADMIN'].includes(user.role)) {
      return reply.code(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Apenas ADMIN/SUPERADMIN.' } })
    }

    const file = await request.file()
    if (!file) return reply.code(400).send({ data: null, error: { code: 'NO_FILE', message: 'Envie o XLS "Relacao de Previsao de Ferias" do Dexion.' } })
    const buffer = await file.toBuffer()

    let parsed
    try {
      parsed = parseDexionForecast(buffer)
    } catch (err: any) {
      return reply.code(400).send({ data: null, error: { code: 'PARSE_FAILED', message: `Nao consegui ler. Verifique se enviou "Relacao de Previsao de Ferias" do Dexion. Detalhe: ${err?.message || 'erro'}` } })
    }
    if (parsed.records.length === 0) {
      return reply.code(400).send({ data: null, error: { code: 'EMPTY_OR_WRONG_FILE', message: 'Planilha lida mas sem colaboradores. Arquivo errado? Esperado: Dexion - Relacao de Previsao de Ferias.' } })
    }

    // Indexa colaboradores do sistema por matricula
    const employees = await fastify.prisma.employee.findMany({
      where: { tenantId: user.tenantId, registration: { not: null } },
      select: { id: true, name: true, registration: true, hireDate: true, balanceOffset: true },
    })
    const byMat = new Map<string, typeof employees[number]>()
    for (const e of employees) {
      if (e.registration) byMat.set(e.registration, e)
    }

    type DivergenceItem = {
      matricula: string
      nome: string
      cargo: string | null
      vencidosCount: number
      periodos: Array<{ aquisitivoStart: string; aquisitivoEnd: string; gozoAte: string; dias: number; vencido: boolean }>
      ultimaFerias: string | null
      employeeId: string | null
      hireDate: string | null
    }

    const matched: DivergenceItem[] = []
    const unmatched: { matricula: string; nome: string }[] = []
    let vencidosTotal = 0
    let employeesComVencido = 0

    for (const rec of parsed.records) {
      const sysEmployee = byMat.get(rec.matricula)
      if (!sysEmployee) {
        unmatched.push({ matricula: rec.matricula, nome: rec.nome })
        continue
      }
      const vencidos = rec.periodos.filter(p => p.vencido)
      if (vencidos.length > 0) {
        employeesComVencido++
        vencidosTotal += vencidos.length
      }
      matched.push({
        matricula: rec.matricula,
        nome: rec.nome,
        cargo: rec.cargo,
        vencidosCount: vencidos.length,
        periodos: rec.periodos,
        ultimaFerias: rec.ultimaFerias,
        employeeId: sysEmployee.id,
        hireDate: sysEmployee.hireDate.toISOString().slice(0, 10),
      })
    }

    // Ordena por mais vencidos primeiro (acao prioritaria)
    matched.sort((a, b) => b.vencidosCount - a.vencidosCount)

    return reply.send({
      data: {
        summary: {
          dexionEmployees: parsed.totalEmployees,
          dexionPeriodos: parsed.totalPeriods,
          dexionVencidos: parsed.vencidosCount,
          matchedEmployees: matched.length,
          unmatchedEmployees: unmatched.length,
          employeesComVencido,
          vencidosTotal,
        },
        matched: matched.slice(0, 500), // cap UI
        unmatched: unmatched.slice(0, 100),
      },
      error: null,
    })
  })
}

export default programmedVacations
