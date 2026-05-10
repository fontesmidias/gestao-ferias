import { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { ImportService } from '../../../../modules/employees/import-service'
import { AuditService } from '../../../../modules/shared/audit-service'
import { VacationEngine } from '../../../../modules/vacations/vacation-engine'
import { resolveBankDataField } from '../../../../modules/employees/bank-data-view'

const employees: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Download template de importacao
  fastify.get('/import/template', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const buffer = ImportService.generateEmployeeTemplate()
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="modelo-colaboradores.xlsx"')
      .send(buffer)
  })

  // Rota para importar colaboradores via arquivo (CSV/Excel)
  fastify.post('/import', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin] // Requer login admin
  }, async (request, reply) => {
    const data = await request.file()
    
    if (!data) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Nenhum arquivo enviado.' })
    }

    const buffer = await data.toBuffer()
    const extension = data.filename.split('.').pop()?.toLowerCase() || ''

    try {
      const rawData = await ImportService.parseFile(buffer, extension)
      const tenantId = (request.user as any).tenantId

      // Tentar enfileirar no Redis; se indisponivel, processar sincrono
      try {
        const job = await fastify.importQueue.add('process-import', {
          rawData, tenantId, uploadedBy: (request.user as any).userId
        })
        return { message: 'Arquivo recebido e enfileirado para processamento.', jobId: job.id, rowCount: rawData.length }
      } catch {
        // Fallback sincrono (sem Redis)
        const { SanitizationService } = await import('../../../../modules/employees/sanitization-service.js')
        let success = 0, errors = 0
        for (const row of rawData) {
          try {
            const cpf = SanitizationService.sanitizeCPF(row.cpf)
            const hireDate = SanitizationService.sanitizeDate(row.hireDate)
            const name = SanitizationService.sanitizeName(row.name)
            await fastify.prisma.employee.upsert({
              where: { cpf_tenantId: { cpf, tenantId } },
              update: { name, hireDate, phone: row.phone || undefined, position: row.position || undefined,
                employeeType: row.employeeType || undefined, branch: row.branch || undefined,
                department: row.department || undefined, workplace: row.workplace || undefined,
                shift: row.shift || undefined, salary: row.salary ? parseFloat(row.salary) : undefined,
                registration: row.registration || undefined },
              create: { name, cpf, hireDate, tenantId, phone: row.phone || null,
                position: row.position || 'Colaborador', employeeType: row.employeeType || 'EFETIVO',
                branch: row.branch || null, department: row.department || null,
                workplace: row.workplace || null, shift: row.shift || null,
                salary: row.salary ? parseFloat(row.salary) : 0, registration: row.registration || null }
            })
            success++
          } catch { errors++ }
        }
        return { message: `Importacao concluida: ${success} processados, ${errors} erros.`, rowCount: rawData.length, success, errors }
      }
    } catch (error: any) {
      request.log.error(error)
      return reply.code(400).send({ error: 'Import Error', message: error.message })
    }
  })

  // Criar funcionário manualmente
  fastify.post('/', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const tenantId = (request.user as any).tenantId
    const data = request.body as any
    
    // Minimal validation
    if (!data.name || !data.cpf || !data.hireDate) {
       return reply.code(400).send({ error: 'Campos obrigatórios: name, cpf, hireDate' })
    }

    try {
      const emp = await fastify.prisma.employee.create({
        data: {
          tenantId,
          name: data.name,
          cpf: data.cpf,
          registration: data.registration || undefined,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          position: data.position || 'Colaborador',
          status: data.status || 'ATIVO',
          branch: data.branch || undefined,
          department: data.department || undefined,
          workplace: data.workplace || undefined,
          shift: data.shift || undefined,
          salary: data.salary || 0,
          hireDate: new Date(data.hireDate),
          phone: data.phone || null,
          employeeType: data.employeeType || 'EFETIVO',
          isFerista: data.isFerista || false,
        }
      })
      return reply.code(201).send(emp)
    } catch (err: any) {
      return reply.code(400).send({ error: 'Erro ao criar colaborador', message: err.message })
    }
  })

  // Editar colaborador
  fastify.patch('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          cpf: { type: 'string' },
          phone: { type: 'string' },
          position: { type: 'string' },
          employeeType: { type: 'string' },
          isFerista: { type: 'boolean' },
          status: { type: 'string' },
          branch: { type: 'string' },
          department: { type: 'string' },
          workplace: { type: 'string' },
          shift: { type: 'string' },
          salary: { type: 'number' },
          registration: { type: 'string' },
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as any
    const data = request.body as any

    const existing = await fastify.prisma.employee.findFirst({ where: { id, tenantId } })
    if (!existing) return reply.code(404).send({ error: 'Not Found' })

    const updated = await fastify.prisma.employee.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        cpf: data.cpf !== undefined ? data.cpf : undefined,
        phone: data.phone !== undefined ? data.phone : undefined,
        position: data.position !== undefined ? data.position : undefined,
        employeeType: data.employeeType !== undefined ? data.employeeType : undefined,
        isFerista: data.isFerista !== undefined ? data.isFerista : undefined,
        status: data.status !== undefined ? data.status : undefined,
        branch: data.branch !== undefined ? data.branch : undefined,
        department: data.department !== undefined ? data.department : undefined,
        workplace: data.workplace !== undefined ? data.workplace : undefined,
        shift: data.shift !== undefined ? data.shift : undefined,
        salary: data.salary !== undefined ? data.salary : undefined,
        registration: data.registration !== undefined ? data.registration : undefined,
      }
    })

    return updated
  })

  // V3.4 FASE B: saldo CLT detalhado + janela sugerida do periodo concessivo aberto.
  // Alimenta o modal "Programar Ferias" para mostrar quanto a pessoa pode gozar
  // e qual janela faz sentido (periodo VENCIDO se houver, senao CONCESSIVO).
  fastify.get('/:id/vacation-balance', {
    onRequest: [fastify.requireAuth],
    schema: { params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenantId = (request.user as any).tenantId
    const employee = await fastify.prisma.employee.findFirst({
      where: { id, tenantId },
      select: {
        id: true, name: true, hireDate: true, balanceOffset: true,
        requests: {
          where: { status: { in: ['APPROVED', 'PENDING', 'SIGNED', 'COMPLETED'] } },
          select: { startDate: true, endDate: true, days: true, status: true },
        },
      },
    })
    if (!employee) {
      return reply.code(404).send({ data: null, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Colaborador nao encontrado.' } })
    }
    const periods = VacationEngine.calculatePeriodsWithUsage(
      employee.hireDate,
      employee.requests,
      0,
      employee.balanceOffset,
    )
    const totalAvailable = periods.reduce((acc, p) => acc + p.daysOfRight, 0)
    // Janela sugerida: prioriza VENCIDO com saldo > 0 (urgente); senao CONCESSIVO.
    const urgent = periods.find(p => p.status === 'VENCIDO' && p.daysOfRight > 0)
    const concessivo = periods.find(p => p.status === 'CONCESSIVO' && p.daysOfRight > 0)
    const target = urgent ?? concessivo ?? null
    const now = new Date()
    let suggestion: { startDate: string; endDate: string; days: number; reason: string } | null = null
    if (target) {
      // Limite: nao sugerir antes de hoje, nao depois do concessiveEndDate.
      const earliestStart = now > target.startDate ? now : target.startDate
      const latestEnd = target.concessiveEndDate
      const days = Math.min(target.daysOfRight, 30)
      const start = new Date(earliestStart)
      const end = new Date(start)
      end.setDate(end.getDate() + days - 1)
      // Se o end estourar concessiveEnd, ancora no fim e recua start.
      if (end > latestEnd) {
        end.setTime(latestEnd.getTime())
        start.setTime(end.getTime())
        start.setDate(start.getDate() - days + 1)
      }
      suggestion = {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        days,
        reason: target.status === 'VENCIDO'
          ? `Periodo VENCIDO desde ${target.endDate.toISOString().slice(0, 10)}, urgente (multa CLT Art. 137).`
          : `Periodo CONCESSIVO aberto, prazo final ${latestEnd.toISOString().slice(0, 10)}.`,
      }
    }
    return {
      data: {
        employeeId: employee.id,
        employeeName: employee.name,
        hireDate: employee.hireDate.toISOString().slice(0, 10),
        totalAvailable,
        periods: periods.map(p => ({
          startDate: p.startDate.toISOString().slice(0, 10),
          endDate: p.endDate.toISOString().slice(0, 10),
          concessiveEndDate: p.concessiveEndDate.toISOString().slice(0, 10),
          daysOfRight: p.daysOfRight,
          status: p.status,
        })),
        suggestion,
      },
      error: null,
    }
  })

  // Summary leve: KPIs + facets para alimentar dropdowns sem trazer 1k+ rows.
  fastify.get('/summary', {
    onRequest: [fastify.requireAuth]
  }, async (request) => {
    const tenantId = (request.user as any).tenantId
    const rows = await fastify.prisma.employee.findMany({
      where: { tenantId },
      select: { status: true, branch: true, workplace: true, position: true },
    })
    const branches = new Set<string>()
    const workplaces = new Set<string>()
    const statuses = new Set<string>()
    const positions = new Set<string>()
    let active = 0
    let vacation = 0
    let leave = 0
    let inactive = 0
    for (const r of rows) {
      if (r.branch) branches.add(r.branch)
      if (r.workplace) workplaces.add(r.workplace)
      if (r.status) statuses.add(r.status)
      if (r.position) positions.add(r.position)
      const upper = (r.status ?? '').toUpperCase().trim()
      if (upper === 'ATIVO') active++
      else if (/^F[EÉ]RIAS$/.test(upper)) vacation++
      else if (/AFASTAD|LICEN[ÇC]A|ATESTAD/.test(upper)) leave++
      else inactive++
    }
    return {
      total: rows.length,
      kpis: { active, vacation, leave, inactive },
      facets: {
        branches: Array.from(branches).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        workplaces: Array.from(workplaces).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        statuses: Array.from(statuses).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        positions: Array.from(positions).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      },
    }
  })

  // V3.4 FASE F6: edição em massa de campos arbitrários (salary, isFerista,
  // status, position). Recebe lista de employeeIds + objeto patch.
  // AuditLog 1 entrada por employee modificado. Idempotente por valor.
  fastify.patch('/bulk-edit', {
    onRequest: [fastify.requireAuth],
    schema: {
      body: {
        type: 'object',
        required: ['employeeIds', 'patch'],
        properties: {
          employeeIds: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 5000 },
          patch: {
            type: 'object',
            properties: {
              salary: { type: 'number', minimum: 0 },
              isFerista: { type: 'boolean' },
              status: { type: 'string' },
              position: { type: 'string' },
              shift: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; role: string }
    if (!['ADMIN', 'SUPERADMIN'].includes(user.role)) {
      return reply.code(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Apenas ADMIN/SUPERADMIN.' } })
    }
    const body = request.body as { employeeIds: string[]; patch: Record<string, unknown> }
    if (!body.employeeIds.length || Object.keys(body.patch).length === 0) {
      return reply.code(400).send({ data: null, error: { code: 'EMPTY_INPUT', message: 'Lista de IDs ou patch vazios.' } })
    }
    const employees = await fastify.prisma.employee.findMany({
      where: { tenantId: user.tenantId, id: { in: body.employeeIds } },
    })
    let applied = 0
    let noop = 0
    for (const emp of employees) {
      const previousData: Record<string, unknown> = {}
      const newData: Record<string, unknown> = {}
      let changed = false
      for (const k of Object.keys(body.patch)) {
        const cur = (emp as unknown as Record<string, unknown>)[k]
        const next = body.patch[k]
        const curN = cur === null || cur === undefined ? null : cur
        const nextN = next === null || next === undefined ? null : next
        if (typeof curN === 'object' && curN !== null && 'toNumber' in (curN as object)) {
          // Decimal field (ex: salary)
          if (Math.abs(Number(curN) - Number(nextN)) >= 0.01) {
            previousData[k] = Number(curN)
            newData[k] = nextN
            changed = true
          }
        } else if (curN !== nextN) {
          previousData[k] = curN
          newData[k] = nextN
          changed = true
        }
      }
      if (!changed) {
        noop++
        continue
      }
      await fastify.prisma.employee.update({
        where: { id: emp.id },
        data: body.patch as never,
      })
      await fastify.prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'EMPLOYEE_BULK_EDIT',
          resourceType: 'EMPLOYEE',
          resourceId: emp.id,
          previousData: previousData as never,
          newData: newData as never,
        },
      })
      applied++
    }

    return {
      data: {
        summary: {
          requested: body.employeeIds.length,
          matched: employees.length,
          applied,
          noop,
          skippedNotFound: body.employeeIds.length - employees.length,
        },
      },
      error: null,
    }
  })

  // Listar funcionários do Tenant. Aceita filtros server-side para evitar
  // carregar 1k+ rows quando o usuário só quer um subconjunto (NFR-PERF).
  fastify.get('/', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          status: { type: 'string' },
          workplace: { type: 'string' },
          branch: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 1000 },
          isFerista: { type: 'string', enum: ['true', 'false'] },
          position: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const tenantId = (request.user as any).tenantId
    const q = request.query as { search?: string; status?: string; workplace?: string; branch?: string; limit?: number; isFerista?: string; position?: string }
    const where: Prisma.EmployeeWhereInput = { tenantId }
    if (q.status) where.status = q.status
    if (q.workplace) where.workplace = q.workplace
    if (q.branch) where.branch = q.branch
    // V3.4 FASE F7: filtro por cargo (string match exato).
    if (q.position) where.position = q.position
    // V3.4 FASE C4: filtro 'Apenas Feristas' para o operador identificar
    // rapidamente quem pode cobrir vagas em /coverage.
    if (q.isFerista === 'true') where.isFerista = true
    if (q.search) {
      const term = q.search.trim()
      if (term.length > 0) {
        where.OR = [
          { name: { contains: term, mode: 'insensitive' } },
          { registration: { contains: term, mode: 'insensitive' } },
          { cpf: { contains: term } },
        ]
      }
    }
    const employees = await fastify.prisma.employee.findMany({
      where,
      orderBy: { name: 'asc' },
      take: q.limit ?? 1000,
    })
    return employees
  })

  // Detalhes do Funcionário + Saldo Calculado (Story 3.1)
  fastify.get('/:id', {
    onRequest: [fastify.requireAuth],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.user as { userId: string; tenantId: string; role?: string }
    const { tenantId } = user

    const employee = await fastify.prisma.employee.findFirst({
      where: { id, tenantId }
    })

    if (!employee) {
      return reply.code(404).send({ error: 'Not Found', message: 'Funcionário não encontrado.' })
    }

    // Calcular saldo via Motor de Regras CLT
    const vacationPeriods = VacationEngine.calculatePeriods(
      employee.hireDate,
      0, // TODO: Implementar registro de faltas na Story 2.x
      employee.balanceOffset
    )

    // ----- Story 5.2: bankData masking + AuditLog -----
    const wantsUnmask = String(request.headers['x-show-bank-data'] ?? '').toLowerCase() === 'true'
    const resolved = resolveBankDataField(
      { enc: employee.bankDataEnc, iv: employee.bankDataIv, tag: employee.bankDataTag },
      { tenantId, wantsUnmask, role: user.role },
    )

    let bankDataField: unknown = undefined

    if (resolved.kind === 'forbidden') {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN_BANK_DATA',
          message: 'Sem permissão para visualizar dados bancários',
        },
      })
    }
    if (resolved.kind === 'decryptError') {
      fastify.log.error(
        { employeeId: employee.id, tenantId },
        'decryptBankData falhou (modo desmascarar)',
      )
      return reply.code(500).send({
        error: {
          code: 'BANK_DATA_DECRYPT_FAILED',
          message: 'Erro ao acessar dados bancários',
        },
      })
    }
    if (resolved.kind === 'masked') {
      bankDataField = resolved.data
    }
    if (resolved.kind === 'unmasked') {
      bankDataField = resolved.data
      // LGPD Art. 37: registro de operações sobre dados sensíveis é hard
      // requirement. Awaitamos antes da response para garantir gravação.
      // Latência ~5ms é aceitável (operação rara, não hot path).
      try {
        await AuditService.log(fastify.prisma, {
          tenantId,
          userId: user.userId,
          action: 'EMPLOYEE_BANK_DATA_VIEWED',
          resourceId: employee.id,
          resourceType: 'EMPLOYEE',
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? undefined,
        })
      } catch (err) {
        // DB de audit caiu: NEGAR acesso desmascarado — sem audit, sem release.
        // Posição conservadora alinhada com prestação de contas LGPD.
        fastify.log.error(
          { err: (err as Error).message?.slice(0, 200), employeeId: employee.id },
          'AuditLog EMPLOYEE_BANK_DATA_VIEWED falhou — negando acesso',
        )
        return reply.code(503).send({
          error: {
            code: 'AUDIT_LOG_UNAVAILABLE',
            message: 'Não foi possível registrar o acesso. Tente novamente em instantes.',
          },
        })
      }
    }

    // Remove campos crus de ciphertext do response (defesa em profundidade).
    const {
      bankDataEnc: _bankDataEnc,
      bankDataIv: _bankDataIv,
      bankDataTag: _bankDataTag,
      ...employeeSafe
    } = employee
    // Tipo de eslint-disable: variáveis prefixadas com _ devem ser ignoradas.
    void _bankDataEnc
    void _bankDataIv
    void _bankDataTag

    return {
      ...employeeSafe,
      ...(bankDataField !== undefined ? { bankData: bankDataField } : {}),
      vacationSummary: {
        totalDaysOfRight: vacationPeriods.reduce((acc, p) => acc + p.daysOfRight, 0),
        periods: vacationPeriods
      }
    }
  })

  // Saldo de férias calculado (CLT)
  fastify.get('/:id/balance', {
    onRequest: [fastify.requireAuth],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as any

    const employee = await fastify.prisma.employee.findFirst({ where: { id, tenantId } })
    if (!employee) {
      return reply.code(404).send({ error: 'Not Found', message: 'Funcionário não encontrado.' })
    }

    const periods = VacationEngine.calculatePeriods(employee.hireDate, 0, employee.balanceOffset)
    const usedDays = await fastify.prisma.vacationRequest.aggregate({
      where: { employeeId: id, tenantId, status: { in: ['APPROVED', 'SIGNED', 'COMPLETED'] } },
      _sum: { days: true }
    })

    const totalRight = periods.reduce((acc, p) => acc + p.daysOfRight, 0)
    const totalUsed = usedDays._sum.days || 0

    return {
      employeeId: id,
      employeeName: employee.name,
      hireDate: employee.hireDate,
      balanceOffset: employee.balanceOffset,
      totalDaysOfRight: totalRight,
      totalDaysUsed: totalUsed,
      availableBalance: totalRight - totalUsed,
      periods
    }
  })

  // Ajuste manual de saldo de férias (RH Override)
  fastify.patch('/:id/balance', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      body: {
        type: 'object',
        required: ['adjustment', 'reason'],
        properties: {
          adjustment: { type: 'integer' },
          reason: { type: 'string', minLength: 5 }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { adjustment, reason } = request.body as { adjustment: number; reason: string }
    const { tenantId, userId } = request.user as any

    // 1. Verificar funcionário e tenant (isolamento garantido na query)
    const employee = await fastify.prisma.employee.findFirst({
      where: { id, tenantId }
    })

    if (!employee) {
      return reply.code(404).send({ error: 'Not Found', message: 'Funcionário não encontrado neste Tenant.' })
    }

    const previousBalance = employee.balanceOffset

    // 2. Transação: Atualizar Saldo + Log de Auditoria
    const result = await fastify.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedEmployee = await tx.employee.update({
        where: { id },
        data: { balanceOffset: { increment: adjustment } }
      })

      await AuditService.log(tx as any, {
        tenantId,
        userId,
        action: 'MANUAL_BALANCE_ADJUSTMENT',
        resourceId: id,
        resourceType: 'EMPLOYEE',
        previousData: { balanceOffset: previousBalance },
        newData: { balanceOffset: updatedEmployee.balanceOffset },
        reason,
        ip: request.ip,
        userAgent: request.headers['user-agent']
      })

      return updatedEmployee
    })

    return {
      message: 'Saldo ajustado com sucesso.',
      newBalanceOffset: result.balanceOffset
    }
  })
}

export default employees
