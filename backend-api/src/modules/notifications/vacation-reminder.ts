// Story 6.3 / M2 — Lembrete de férias vencendo em ~30 dias.
// Endereça AC linha 840-842 do epics.md V3:
//   "colaborador com férias vencendo em 30 dias → email de alerta enviado".
// E AC linha 844-846:
//   "SMTP falha → registrada no AuditLog, sem falha silenciosa (NFR-REL-002)".

import type { PrismaClient } from '@prisma/client'
import { VacationEngine } from '../vacations/vacation-engine'

export interface ReminderEmployee {
  id: string
  name: string
  email: string | null
  hireDate: Date
  absences: number
}

export interface ReminderHit {
  employeeId: string
  employeeName: string
  email: string | null
  concessiveEndDate: Date
  daysUntilDeadline: number
  status: 'CONCESSIVO' | 'AQUISITIVO' | 'VENCIDO' | 'QUITADO'
}

export interface ReminderRunSummary {
  scanned: number
  matched: number
  emailsSent: number
  emailsFailed: number
  hits: ReminderHit[]
}

export interface SendEmailFn {
  (input: {
    to: string
    subject: string
    html: string
    tenantId: string
  }): Promise<boolean>
}

export interface AuditFailureFn {
  (input: {
    tenantId: string
    userId: string
    employeeId: string
    reason: string
  }): Promise<void>
}

export interface RunRemindersOpts {
  /** Janela em dias para sinalizar lembrete. Default 30. */
  windowDays?: number
  /** Se true, não envia email — apenas retorna lista de hits. */
  dryRun?: boolean
  /** UserId que dispara a execução (para audit). */
  triggeredByUserId: string
}

const DEFAULT_WINDOW_DAYS = 30

/**
 * Identifica colaboradores cujo período concessivo termina dentro da janela.
 * Pega apenas o período mais "perto" de vencer (não duplica colaborador).
 */
export function findEmployeesNearingDeadline(
  employees: ReminderEmployee[],
  windowDays: number = DEFAULT_WINDOW_DAYS,
  now: Date = new Date(),
): ReminderHit[] {
  const todayMs = now.getTime()
  const hits: ReminderHit[] = []

  for (const emp of employees) {
    const periods = VacationEngine.calculatePeriods(emp.hireDate, emp.absences)
    // Pega periodo CONCESSIVO ou VENCIDO mais critico (menor concessiveEndDate >= hoje, ou ja vencido).
    let candidate: typeof periods[number] | null = null
    for (const p of periods) {
      if (p.status === 'QUITADO') continue
      const deadlineMs = p.concessiveEndDate.getTime()
      const daysUntil = Math.ceil((deadlineMs - todayMs) / (24 * 60 * 60 * 1000))
      // Janela: vai vencer dentro de N dias (incluindo já vencido).
      if (daysUntil <= windowDays) {
        if (!candidate || p.concessiveEndDate < candidate.concessiveEndDate) {
          candidate = p
        }
      }
    }
    if (candidate) {
      const daysUntilDeadline = Math.ceil(
        (candidate.concessiveEndDate.getTime() - todayMs) / (24 * 60 * 60 * 1000),
      )
      hits.push({
        employeeId: emp.id,
        employeeName: emp.name,
        email: emp.email,
        concessiveEndDate: candidate.concessiveEndDate,
        daysUntilDeadline,
        status: candidate.status,
      })
    }
  }

  return hits
}

export function buildReminderEmailHtml(hit: ReminderHit, tenantName: string): string {
  const deadlineStr = hit.concessiveEndDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  const status = hit.daysUntilDeadline < 0
    ? `VENCIDO há ${Math.abs(hit.daysUntilDeadline)} dia(s)`
    : `vence em ${hit.daysUntilDeadline} dia(s)`
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
      <h2 style="color:#f59e0b;margin-bottom:12px">Suas férias estão vencendo</h2>
      <p>Olá <b>${hit.employeeName}</b>,</p>
      <p>Identificamos que seu período concessivo de férias <b>${status}</b> (limite: <b>${deadlineStr}</b>).</p>
      <p style="background:#1e293b;padding:12px 16px;border-left:3px solid #f59e0b;border-radius:6px">
        Solicite suas férias o quanto antes para evitar pagamento em dobro pela empresa (CLT Art. 137).
      </p>
      <hr style="border:none;border-top:1px solid #334155;margin:24px 0">
      <p style="color:#475569;font-size:11px">${tenantName} · GestaoFerias — Sistema de Gestão de Férias</p>
    </div>
  `
}

/**
 * Roda lembretes para um tenant. Não emite quando email do colaborador é null
 * (audit log de skip não bloqueia o run).
 */
export async function runRemindersForTenant(
  prisma: PrismaClient,
  tenantId: string,
  sendEmail: SendEmailFn,
  auditFailure: AuditFailureFn,
  opts: RunRemindersOpts,
): Promise<ReminderRunSummary> {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  })
  const tenantName = tenant?.name ?? 'Empresa'

  const employees = await prisma.employee.findMany({
    where: { tenantId, status: 'ATIVO' },
    select: {
      id: true, name: true, hireDate: true,
      user: { select: { email: true } },
    },
  })

  const summary: ReminderRunSummary = {
    scanned: employees.length,
    matched: 0,
    emailsSent: 0,
    emailsFailed: 0,
    hits: [],
  }

  const hits = findEmployeesNearingDeadline(
    employees.map((e) => ({
      id: e.id, name: e.name,
      email: e.user?.email ?? null,
      hireDate: e.hireDate,
      absences: 0,
    })),
    windowDays,
  )
  summary.matched = hits.length
  summary.hits = hits

  if (opts.dryRun) return summary

  for (const hit of hits) {
    if (!hit.email) {
      await auditFailure({
        tenantId,
        userId: opts.triggeredByUserId,
        employeeId: hit.employeeId,
        reason: 'Colaborador sem email cadastrado',
      }).catch(() => {/* swallow */})
      summary.emailsFailed += 1
      continue
    }

    const html = buildReminderEmailHtml(hit, tenantName)
    const ok = await sendEmail({
      to: hit.email,
      subject: `[${tenantName}] Suas férias estão vencendo`,
      html,
      tenantId,
    }).catch(() => false)

    if (ok) {
      summary.emailsSent += 1
    } else {
      summary.emailsFailed += 1
      await auditFailure({
        tenantId,
        userId: opts.triggeredByUserId,
        employeeId: hit.employeeId,
        reason: 'SMTP falhou ao enviar lembrete (sem credencial ou erro de envio)',
      }).catch(() => {/* swallow */})
    }
  }

  return summary
}
