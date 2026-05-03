// Story 6.3 / M2 — admin endpoint para disparar lembretes de férias vencendo.
// Job de cron BullMQ é responsabilidade infra (ver TODO no final).

import type { FastifyPluginAsync } from 'fastify'
import { runRemindersForTenant } from '../../../../modules/notifications/vacation-reminder'
import { EmailService } from '../../../../modules/notifications/email-service'
import { AuditService } from '../../../../modules/shared/audit-service'

const route: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/vacation-reminders/run
  // Roda lembretes para o tenant do JWT. Body opcional: { dryRun, windowDays }.
  fastify.post('/run', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean', default: false },
          windowDays: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
        },
      },
    },
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request) => {
    const { tenantId, userId } = request.user as { tenantId: string; userId: string }
    const body = (request.body ?? {}) as { dryRun?: boolean; windowDays?: number }

    const summary = await runRemindersForTenant(
      fastify.prisma,
      tenantId,
      async ({ to, subject, html, tenantId: tid }) => {
        return EmailService.sendMail(tid, to, subject, html, fastify.prisma)
      },
      async ({ tenantId: tid, userId: uid, employeeId, reason }) => {
        // AC linha 844-846: falha SMTP grava AuditLog (NFR-REL-002).
        await AuditService.log(fastify.prisma, {
          tenantId: tid,
          userId: uid,
          action: 'EMAIL_REMINDER_FAILED',
          resourceId: employeeId,
          resourceType: 'EMPLOYEE',
          reason,
        })
      },
      {
        windowDays: body.windowDays ?? 30,
        dryRun: body.dryRun ?? false,
        triggeredByUserId: userId,
      },
    )

    fastify.log.info(
      { tenantId, scanned: summary.scanned, matched: summary.matched, sent: summary.emailsSent, failed: summary.emailsFailed },
      'VACATION_REMINDER_RUN_COMPLETED',
    )

    return summary
  })

  // TODO(infra): wire BullMQ scheduler diário neste worker:
  //   fastify.queues.notification.upsertJobScheduler(
  //     'vacation-reminders-daily',
  //     { pattern: '0 8 * * *' },                // 08:00 todo dia
  //     { name: 'reminder', data: { allTenants: true } },
  //   )
  // Worker correspondente itera tenants ativos e chama runRemindersForTenant
  // com triggeredByUserId apontando para um SystemUser (ainda não criado).
  // Por enquanto o disparo é manual via POST /run (suficiente para MVP).
}

export default route
