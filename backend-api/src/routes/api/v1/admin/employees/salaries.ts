import type { FastifyPluginAsync } from 'fastify'
import * as XLSX from 'xlsx'
import { parseDexionWorkers } from '../../../../../modules/imports/dexion-parser'
import { normalizeMatricula } from '../../../../../modules/imports/matricula'

/**
 * V3.4 FASE F2/F3/F4: importador de salários do Dexion.
 *
 * Workflow:
 * 1. Operador faz upload do XLSX Dexion -> /preview retorna 3 listas
 *    (unchanged, divergent, unmatched). Não persiste nada.
 * 2. Operador delibera quais aplicar (individual ou em massa).
 * 3. /apply recebe lista de employeeIds + salários e atualiza com AuditLog.
 *
 * Match: matricula normalizada (Number-coerce) Dexion vs Employee.registration.
 * Fallback opcional por CPF se registration null (raro).
 */

interface PreviewItem {
  rowIndex: number
  matricula: string
  nome: string
  cargo: string | null
  cpf: string | null
  salarioDexion: number
  // Para divergent/unchanged:
  employeeId?: string
  employeeName?: string
  salarioAtual?: number | null
  delta?: number  // salarioDexion - salarioAtual
  deltaPct?: number | null
  matchBy?: 'matricula' | 'cpf'
}

interface PreviewResponse {
  summary: {
    totalRows: number
    skippedFromParse: number
    unchanged: number
    divergent: number
    unmatched: number
  }
  unchanged: PreviewItem[]
  divergent: PreviewItem[]
  unmatched: PreviewItem[]
}

const salaries: FastifyPluginAsync = async (fastify) => {
  // Modelo XLSX simples (matrícula, salário, nome opcional). Para upload manual
  // alternativo ao Dexion.
  fastify.get('/salaries/template', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const wb = XLSX.utils.book_new()
    const data = [
      ['Matrícula', 'Nome (opcional)', 'Salário'],
      ['1364', 'ADLLA CRUZ DE MORAES', 1862.09],
      ['1378', 'ALESSANDRA MESSIAS GUEDES', 1862.09],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Salarios')
    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="modelo-salarios.xlsx"')
      .send(buffer)
  })

  // Preview: parse + match + classifica em unchanged/divergent/unmatched.
  // NÃO persiste. Operador delibera e chama /apply depois.
  fastify.post('/salaries/preview', {
    onRequest: [fastify.requireAuth],
  }, async (request, reply) => {
    const user = request.user as { tenantId: string; role: string }
    if (!['ADMIN', 'SUPERADMIN'].includes(user.role)) {
      return reply.code(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Apenas ADMIN/SUPERADMIN.' } })
    }
    const file = await request.file()
    if (!file) {
      return reply.code(400).send({ data: null, error: { code: 'NO_FILE', message: 'Nenhum arquivo enviado.' } })
    }

    const buffer = await file.toBuffer()
    let parseResult
    try {
      parseResult = parseDexionWorkers(buffer)
    } catch (e: any) {
      return reply.code(400).send({
        data: null,
        error: { code: 'PARSE_ERROR', message: e?.message || 'Falha ao ler planilha Dexion.' },
      })
    }

    const matriculas = parseResult.workers.map(w => w.matricula).filter(Boolean)
    const cpfs = parseResult.workers.map(w => w.cpf).filter((v): v is string => !!v)
    const employees = await fastify.prisma.employee.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          matriculas.length ? { registration: { in: matriculas } } : undefined,
          cpfs.length ? { cpf: { in: cpfs } } : undefined,
        ].filter(Boolean) as any,
      },
      select: { id: true, name: true, registration: true, cpf: true, salary: true, position: true },
    })

    const byRegistration = new Map<string, typeof employees[number]>()
    const byCpf = new Map<string, typeof employees[number]>()
    for (const e of employees) {
      const reg = normalizeMatricula(e.registration)
      if (reg) byRegistration.set(reg, e)
      if (e.cpf) byCpf.set(e.cpf, e)
    }

    const unchanged: PreviewItem[] = []
    const divergent: PreviewItem[] = []
    const unmatched: PreviewItem[] = []

    for (const w of parseResult.workers) {
      const base: PreviewItem = {
        rowIndex: w.rowIndex,
        matricula: w.matricula,
        nome: w.nome,
        cargo: w.cargo,
        cpf: w.cpf,
        salarioDexion: w.salario,
      }
      // Match prioritário por matrícula.
      let emp = byRegistration.get(w.matricula)
      let matchBy: 'matricula' | 'cpf' = 'matricula'
      if (!emp && w.cpf) {
        emp = byCpf.get(w.cpf)
        matchBy = 'cpf'
      }
      if (!emp) {
        unmatched.push(base)
        continue
      }
      const current = emp.salary !== null && emp.salary !== undefined ? Number(emp.salary) : null
      const item: PreviewItem = {
        ...base,
        employeeId: emp.id,
        employeeName: emp.name,
        salarioAtual: current,
        matchBy,
      }
      // Comparação tolerante a 0.01 de diferença (arredondamento).
      const diff = current === null ? w.salario : Math.round((w.salario - current) * 100) / 100
      item.delta = diff
      item.deltaPct = current && current !== 0 ? Math.round((diff / current) * 10000) / 100 : null
      if (current !== null && Math.abs(diff) < 0.01) {
        unchanged.push(item)
      } else {
        divergent.push(item)
      }
    }

    const response: PreviewResponse = {
      summary: {
        totalRows: parseResult.workers.length,
        skippedFromParse: parseResult.skippedRows,
        unchanged: unchanged.length,
        divergent: divergent.length,
        unmatched: unmatched.length,
      },
      unchanged,
      divergent,
      unmatched,
    }
    return { data: response, error: null }
  })

  // Apply: aplica os salários selecionados pelo operador. AuditLog 1 entrada
  // por employee atualizado. Idempotente (re-aplicar mesmo valor = no-op).
  fastify.post('/salaries/apply', {
    onRequest: [fastify.requireAuth],
    schema: {
      body: {
        type: 'object',
        required: ['updates'],
        properties: {
          updates: {
            type: 'array',
            items: {
              type: 'object',
              required: ['employeeId', 'newSalary'],
              properties: {
                employeeId: { type: 'string', format: 'uuid' },
                newSalary: { type: 'number', minimum: 0 },
              },
            },
            maxItems: 5000,
          },
          source: { type: 'string', default: 'dexion' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; role: string }
    if (!['ADMIN', 'SUPERADMIN'].includes(user.role)) {
      return reply.code(403).send({ data: null, error: { code: 'FORBIDDEN', message: 'Apenas ADMIN/SUPERADMIN.' } })
    }
    const body = request.body as { updates: { employeeId: string; newSalary: number }[]; source?: string }
    const source = body.source || 'dexion'

    const employees = await fastify.prisma.employee.findMany({
      where: {
        tenantId: user.tenantId,
        id: { in: body.updates.map(u => u.employeeId) },
      },
      select: { id: true, salary: true, name: true, registration: true },
    })
    const byId = new Map(employees.map(e => [e.id, e]))

    let applied = 0
    let noop = 0
    let skipped_not_found = 0
    const errors: { employeeId: string; message: string }[] = []

    for (const u of body.updates) {
      const emp = byId.get(u.employeeId)
      if (!emp) {
        skipped_not_found++
        continue
      }
      const current = emp.salary !== null && emp.salary !== undefined ? Number(emp.salary) : null
      if (current !== null && Math.abs(current - u.newSalary) < 0.01) {
        noop++
        continue
      }
      try {
        await fastify.prisma.employee.update({
          where: { id: u.employeeId },
          data: { salary: u.newSalary },
        })
        await fastify.prisma.auditLog.create({
          data: {
            tenantId: user.tenantId,
            userId: user.userId,
            action: 'SALARY_UPDATE_FROM_IMPORT',
            resourceType: 'EMPLOYEE',
            resourceId: u.employeeId,
            previousData: { salary: current } as never,
            newData: { salary: u.newSalary, source } as never,
          },
        })
        applied++
      } catch (e: any) {
        errors.push({ employeeId: u.employeeId, message: e?.message || 'Falha ao atualizar' })
      }
    }

    return {
      data: {
        summary: {
          totalRequested: body.updates.length,
          applied,
          noop,
          skippedNotFound: skipped_not_found,
          errors: errors.length,
        },
        errors: errors.slice(0, 50),
      },
      error: null,
    }
  })
}

export default salaries
