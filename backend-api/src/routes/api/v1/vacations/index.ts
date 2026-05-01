import { FastifyPluginAsync } from 'fastify'
import { VacationEngine } from '../../../../modules/vacations/vacation-engine'
import { AuditService } from '../../../../modules/shared/audit-service'
import { WhatsAppService } from '../../../../modules/notifications/whatsapp-service'
import { WebhookService } from '../../../../modules/integrations/webhook-service'
import { EmailService } from '../../../../modules/notifications/email-service'
import { ZapSignService } from '../../../../modules/integrations/zapsign-service'
import { SignatureService } from '../../../../modules/signatures/signature-service'
import { ImportService } from '../../../../modules/employees/import-service'
import { SanitizationService } from '../../../../modules/employees/sanitization-service'
import { differenceInDays, parseISO, format } from 'date-fns'

/**
 * Dispara webhooks via BullMQ queue com retry automático (Story 6.2).
 * Se Redis indisponível, fallback para disparo direto.
 */
async function triggerWebhooks(fastify: any, tenantId: string, event: string, data: any) {
  try {
    // Tentar usar a fila BullMQ (com retry automático)
    if (fastify.queues?.webhook?.add) {
      await fastify.queues.webhook.add(`webhook-${event}`, { event, tenantId, data }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30000 } // 30s, 60s, 120s
      })
      return
    }
  } catch (err: any) {
    console.warn(`[WEBHOOK] Fila indisponível, fallback direto: ${err.message}`)
  }
  // Fallback: disparo direto sem retry
  const webhooks = await fastify.prisma.webhook.findMany({
    where: { tenantId, isActive: true, events: { has: event } }
  })
  for (const wh of webhooks) {
    WebhookService.trigger(wh.url, wh.secret, {
      event,
      timestamp: new Date().toISOString(),
      tenantId,
      data
    }).catch((err: any) => console.error(`[WEBHOOK] Falha ${event} para ${wh.url}:`, err))
  }
}

/**
 * Envia email de notificacao para o colaborador via SMTP do tenant.
 */
async function sendNotificationEmail(prisma: any, tenantId: string, employeeEmail: string | null, subject: string, html: string) {
  if (!employeeEmail) return
  EmailService.sendMail(tenantId, employeeEmail, subject, html, prisma)
    .catch((err: any) => console.error(`[EMAIL] Falha ao enviar para ${employeeEmail}:`, err))
}

const vacations: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Download template de programacao de ferias
  fastify.get('/import/template', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const buffer = ImportService.generateVacationTemplate()
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="modelo-ferias.xlsx"')
      .send(buffer)
  })

  // Importar programacao de ferias em massa
  fastify.post('/import', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin]
  }, async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'Bad Request', message: 'Nenhum arquivo enviado.' })

    const buffer = await data.toBuffer()
    const ext = data.filename.split('.').pop()?.toLowerCase() || ''
    const { tenantId } = request.user as any

    try {
      const rows = await ImportService.parseVacations(buffer, ext)
      let created = 0; let errors = 0; const errorDetails: string[] = []

      for (const row of rows) {
        try {
          if (!row.employeeCpf || !row.startDate || !row.endDate) {
            errors++; errorDetails.push(`Linha com dados incompletos`); continue
          }
          const cpf = SanitizationService.sanitizeCPF(row.employeeCpf)
          const employee = await fastify.prisma.employee.findFirst({ where: { cpf, tenantId } })
          if (!employee) { errors++; errorDetails.push(`CPF ${row.employeeCpf} nao encontrado`); continue }

          const start = SanitizationService.sanitizeDate(row.startDate)
          const end = SanitizationService.sanitizeDate(row.endDate)
          const days = row.days ? parseInt(row.days) : differenceInDays(end, start) + 1

          await fastify.prisma.vacationRequest.create({
            data: { tenantId, employeeId: employee.id, startDate: start, endDate: end, days, status: 'PENDING' }
          })
          created++
        } catch (err: any) {
          errors++; errorDetails.push(err.message)
        }
      }

      return {
        message: `Importacao concluida: ${created} ferias criadas (PENDING), ${errors} erros.`,
        created, errors,
        errorDetails: errorDetails.slice(0, 10)
      }
    } catch (error: any) {
      return reply.code(400).send({ error: 'Import Error', message: error.message })
    }
  })

  // Criar solicitação de férias (Story 3.2)
  fastify.post('/', {
    onRequest: [fastify.requireAuth],
    schema: {
      body: {
        type: 'object',
        required: ['employeeId', 'startDate', 'endDate'],
        properties: {
          employeeId: { type: 'string', format: 'uuid' },
          startDate: { type: 'string' },
          endDate: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { employeeId, startDate, endDate } = request.body as any
    const { tenantId } = request.user as any

    const start = parseISO(startDate)
    const end = parseISO(endDate)
    const days = differenceInDays(end, start) + 1

    // 1. Buscar funcionário e calcular saldo atual (com isolamento de tenant)
    const employee = await fastify.prisma.employee.findFirst({
      where: { id: employeeId, tenantId }
    })

    if (!employee) {
      return reply.code(404).send({ error: 'Not Found', message: 'Funcionário não encontrado.' })
    }

    const periods = VacationEngine.calculatePeriods(employee.hireDate, 0, employee.balanceOffset)
    const totalBalance = periods.reduce((acc, p) => acc + p.daysOfRight, 0)

    // 2. Buscar frações existentes do mesmo período aquisitivo (CLT Art. 134 §1º)
    const targetPeriod = periods.find(p => start >= p.startDate && start < p.endDate)
    const periodDaysOfRight = targetPeriod?.daysOfRight ?? 30
    const existingRequests = await fastify.prisma.vacationRequest.findMany({
      where: {
        employeeId,
        tenantId,
        status: { not: 'REJECTED' },
        startDate: { gte: targetPeriod?.startDate ?? new Date(0) },
        endDate: { lt: targetPeriod?.endDate ?? new Date('2999-12-31') }
      },
      select: { startDate: true, endDate: true, days: true, status: true }
    })

    // 3. Validação Legal completa (Art. 134 CLT — inclui feriados + fracionamento)
    const validation = await VacationEngine.validateRequestFull(start, end, totalBalance, {
      tenantId,
      resolver: fastify.holidayResolver,
      fractionContext: {
        existingFractions: existingRequests,
        periodDaysOfRight
      }
    })

    if (!validation.isValid) {
      return reply.code(422).send({
        error: 'Legal Block',
        message: 'A solicitação viola regras da CLT (Art. 134).',
        details: validation.errors,
        codes: validation.errorDetails?.map(e => e.code)
      })
    }

    // 3. Persistência
    const vacationRequest = await fastify.prisma.vacationRequest.create({
      data: {
        tenantId,
        employeeId,
        startDate: start,
        endDate: end,
        days,
        status: 'PENDING'
      }
    })

    return vacationRequest
  })

  // Listar solicitações do Tenant (com hasCoverage)
  fastify.get('/', {
    onRequest: [fastify.requireAuth]
  }, async (request) => {
    const { tenantId } = request.user as any
    const results = await fastify.prisma.vacationRequest.findMany({
      where: { tenantId },
      include: {
        employee: true,
        signature: { select: { id: true, signUrl: true, signedAt: true, zapSignDocToken: true } },
        coverages: { select: { id: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    // Adicionar campo hasCoverage (FR-APR-004)
    return results.map((r: any) => ({
      ...r,
      hasCoverage: r.coverages && r.coverages.length > 0,
      coverages: undefined // Não expor detalhes de coverage nesta listagem
    }))
  })

  // Bulk Status Update (Ação em Massa)
  fastify.patch('/bulk', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin]
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { requestIds, status, dispatchNote } = request.body as any

    if (!Array.isArray(requestIds) || !status) {
       return reply.code(400).send({ error: 'Bad Request', message: 'ids e status são obrigatórios.' })
    }

    const { count } = await fastify.prisma.vacationRequest.updateMany({
      where: { id: { in: requestIds }, tenantId },
      data: { status, dispatchNote: dispatchNote || undefined }
    })

    return reply.send({ message: `Atualizados ${count} registros para ${status}.` })
  })

  // Edit / Approve Single Request (Story 3.2 — com cobertura integrada)
  fastify.patch('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin]
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as any
    const { status, dispatchNote, startDate, endDate, coverageEmployeeId } = request.body as any

    const existing = await fastify.prisma.vacationRequest.findFirst({ where: { id, tenantId } })
    if (!existing) return reply.code(404).send({ error: 'Not Found' })

    const updateData: any = { status, dispatchNote: dispatchNote !== undefined ? dispatchNote : undefined }

    // Admin is forcibly editing dates
    if (startDate && endDate) {
      updateData.originalStartDate = existing.originalStartDate || existing.startDate
      updateData.originalEndDate = existing.originalEndDate || existing.endDate
      updateData.startDate = parseISO(startDate)
      updateData.endDate = parseISO(endDate)
      updateData.days = differenceInDays(updateData.endDate, updateData.startDate) + 1
    }

    // Update usando o ID verificado — tenant isolation garantida pelo findFirst acima
    const updated = await fastify.prisma.vacationRequest.update({
      where: { id: existing.id },
      data: updateData
    })

    // Story 3.2 — Criar CoverageAssignment ao aprovar com cobertura
    let coverageCreated = null
    if (updated.status === 'APPROVED' && coverageEmployeeId) {
      // Buscar alocação ativa do colaborador que sai de férias
      const allocation = await fastify.prisma.workplaceAllocation.findFirst({
        where: { employeeId: existing.employeeId, status: 'ACTIVE' },
        select: { workplacePositionId: true }
      })
      // Buscar dados do substituto
      const replacement = await fastify.prisma.employee.findFirst({
        where: { id: coverageEmployeeId, tenantId },
        select: { id: true, name: true, salary: true, isFerista: true, employeeType: true }
      })

      if (replacement && allocation) {
        const days = differenceInDays(updated.endDate, updated.startDate) + 1
        const cost = replacement.salary ? Number(replacement.salary) / 30 * days : null
        coverageCreated = await fastify.prisma.coverageAssignment.create({
          data: {
            vacationRequestId: existing.id,
            replacementEmployeeId: replacement.id,
            workplacePositionId: allocation.workplacePositionId,
            startDate: updated.startDate,
            endDate: updated.endDate,
            type: replacement.isFerista ? 'FERISTA' : 'INTERMITENTE',
            cost,
            status: 'ACTIVE',
            tenantId
          }
        })
        // Webhook: coverage.assigned
        triggerWebhooks(fastify, tenantId, 'coverage.assigned', {
          coverageId: coverageCreated.id,
          vacationRequestId: existing.id,
          replacementEmployeeName: replacement.name,
          startDate: updated.startDate,
          endDate: updated.endDate
        })
      }
    }

    // Audit log
    const { userId } = request.user as any
    await AuditService.log(fastify.prisma as any, {
      tenantId, userId,
      action: status === 'APPROVED' ? 'VACATION_APPROVED' : status === 'REJECTED' ? 'VACATION_REJECTED' : `VACATION_${status}`,
      resourceId: existing.id,
      resourceType: 'VACATION_REQUEST',
      previousData: { status: existing.status },
      newData: { status: updated.status, coverageEmployeeId: coverageEmployeeId || null },
      reason: dispatchNote || undefined,
      ip: request.ip,
      userAgent: request.headers['user-agent']
    })

    // Notificação WhatsApp + Email + Webhooks ao aprovar ou rejeitar
    if (updated.status === 'APPROVED' || updated.status === 'REJECTED') {
      // Disparar webhooks (FR-WHK-002)
      const webhookEvent = updated.status === 'APPROVED' ? 'vacation.approved' : 'vacation.rejected'
      triggerWebhooks(fastify, tenantId, webhookEvent, {
        vacationRequestId: existing.id,
        employeeId: existing.employeeId,
        status: updated.status,
        startDate: updated.startDate,
        endDate: updated.endDate,
        days: updated.days,
        hasCoverage: !!coverageCreated
      })

      try {
        const employee = await fastify.prisma.employee.findUnique({
          where: { id: existing.employeeId },
          select: { phone: true, name: true, cpf: true, userId: true },
        })

        // Buscar email do User vinculado ao Employee (FR-NOT-001)
        let employeeEmail: string | null = null
        if (employee?.userId) {
          const user = await fastify.prisma.user.findUnique({
            where: { id: employee.userId },
            select: { email: true }
          })
          employeeEmail = user?.email || null
        }

        // Email de notificação
        if (employee) {
          const startFormatted = format(updated.startDate, 'dd/MM/yyyy')
          const endFormatted = format(updated.endDate, 'dd/MM/yyyy')
          if (updated.status === 'APPROVED') {
            const coverageInfo = coverageCreated ? '<br><strong>Cobertura definida</strong> para o seu posto.' : ''
            sendNotificationEmail(
              fastify.prisma, tenantId, employeeEmail,
              'Férias Aprovadas',
              `<p>Olá ${employee.name},</p><p>Suas férias de <strong>${startFormatted}</strong> a <strong>${endFormatted}</strong> (${updated.days} dias) foram <strong style="color:green">APROVADAS</strong>.${coverageInfo}</p>`
            )
          } else {
            const motivo = updated.dispatchNote || 'Não informado'
            sendNotificationEmail(
              fastify.prisma, tenantId, employeeEmail,
              'Férias Reprovadas',
              `<p>Olá ${employee.name},</p><p>Sua solicitação de férias foi <strong style="color:red">REPROVADA</strong>.</p><p>Motivo: ${motivo}</p>`
            )
          }
        }

        if (employee?.phone) {
          let message: string
          if (updated.status === 'APPROVED') {
            const startFormatted = format(updated.startDate, 'dd/MM/yyyy')
            const endFormatted = format(updated.endDate, 'dd/MM/yyyy')
            message = `Suas férias de ${startFormatted} a ${endFormatted} (${updated.days} dias) foram APROVADAS pelo RH.`
          } else {
            const motivo = updated.dispatchNote || 'Não informado'
            message = `Sua solicitação de férias foi REPROVADA. Motivo: ${motivo}`
          }

          // Envio assíncrono — não bloqueia a resposta da API
          WhatsAppService.sendMessage(fastify.prisma as any, employee.phone, message, tenantId)
            .catch((err: any) => fastify.log.error(`[WhatsApp] Falha ao notificar ${employee.name}: ${err.message}`))
        }

        // ZapSign: criar documento de assinatura digital ao aprovar
        if (updated.status === 'APPROVED') {
          try {
            const zapSignConfigured = await ZapSignService.isConfigured(tenantId, fastify.prisma as any)
            if (zapSignConfigured) {
              const emp = employee || await fastify.prisma.employee.findUnique({
                where: { id: existing.employeeId },
                select: { phone: true, name: true, cpf: true, position: true, hireDate: true, salary: true },
              })

              if (emp) {
                const tenant = await fastify.prisma.tenant.findUnique({
                  where: { id: tenantId },
                  select: { name: true, cnpj: true },
                })

                const startFormatted = format(updated.startDate, 'dd/MM/yyyy')
                const endFormatted = format(updated.endDate, 'dd/MM/yyyy')

                // Gerar PDF do aviso de ferias (completo para validade juridica)
                const receiptData = {
                  tenantName: tenant?.name || 'Empresa',
                  tenantCnpj: tenant?.cnpj || '',
                  employeeName: emp.name,
                  cpf: emp.cpf,
                  position: (emp as any).position || 'Colaborador',
                  hireDate: (emp as any).hireDate ? format((emp as any).hireDate, 'dd/MM/yyyy') : '',
                  startDate: startFormatted,
                  endDate: endFormatted,
                  days: updated.days,
                  salary: (emp as any).salary ? Number((emp as any).salary) : 0,
                }
                const { buffer, hash } = await SignatureService.generateReceipt(receiptData)
                const pdfBase64 = buffer.toString('base64')

                // Criar documento na ZapSign
                const docName = `Aviso de Férias - ${emp.name}`
                const signers = [{
                  name: emp.name,
                  phone_country: '55',
                  phone_number: emp.phone ? emp.phone.replace(/\D/g, '') : '',
                }]

                const zapResult = await ZapSignService.createDocument(
                  tenantId,
                  pdfBase64,
                  docName,
                  signers,
                  existing.id,
                  fastify.prisma as any
                )

                const firstSigner = zapResult.signers[0]

                // Criar ou atualizar registro de assinatura
                const existingSignature = await fastify.prisma.signature.findUnique({
                  where: { vacationRequestId: existing.id },
                })

                if (existingSignature) {
                  await fastify.prisma.signature.update({
                    where: { id: existingSignature.id },
                    data: {
                      zapSignDocToken: zapResult.docToken,
                      zapSignSignerToken: firstSigner?.token || null,
                      signUrl: firstSigner?.signUrl || null,
                    },
                  })
                } else {
                  await fastify.prisma.signature.create({
                    data: {
                      tenantId,
                      vacationRequestId: existing.id,
                      hash,
                      zapSignDocToken: zapResult.docToken,
                      zapSignSignerToken: firstSigner?.token || null,
                      signUrl: firstSigner?.signUrl || null,
                    },
                  })
                }

                // Enviar link de assinatura via WhatsApp
                if (emp.phone && firstSigner?.signUrl) {
                  const signMessage = `Seu aviso de férias está pronto para assinatura digital. Acesse o link para assinar: ${firstSigner.signUrl}`
                  WhatsAppService.sendMessage(fastify.prisma as any, emp.phone, signMessage, tenantId)
                    .catch((err: any) => fastify.log.error(`[WhatsApp] Falha ao enviar link de assinatura: ${err.message}`))
                }

                fastify.log.info(`[ZapSign] Documento criado para férias ${existing.id}: ${zapResult.docToken}`)
              }
            }
          } catch (zapErr: any) {
            fastify.log.error(`[ZapSign] Erro ao criar documento: ${zapErr.message}`)
          }
        }
      } catch (whatsappErr: any) {
        fastify.log.error(`[WhatsApp] Erro ao preparar notificação: ${whatsappErr.message}`)
      }
    }

    return updated
  })

  // Bulk Create de Férias (Story 3.4 / FR-APR-005)
  fastify.post('/bulk-create', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            maxItems: 50,
            items: {
              type: 'object',
              required: ['employeeId', 'startDate', 'endDate'],
              properties: {
                employeeId: { type: 'string', format: 'uuid' },
                startDate: { type: 'string' },
                endDate: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { items } = request.body as { items: { employeeId: string; startDate: string; endDate: string }[] }

    if (items.length > 50) {
      return reply.code(422).send({ error: 'Validation Error', message: 'Máximo 50 itens por requisição.' })
    }

    const results: { employeeId: string; status: 'created' | 'error'; message?: string; codes?: string[] }[] = []
    let created = 0
    let errors = 0

    for (const item of items) {
      try {
        const employee = await fastify.prisma.employee.findFirst({
          where: { id: item.employeeId, tenantId }
        })
        if (!employee) {
          errors++
          results.push({ employeeId: item.employeeId, status: 'error', message: 'Funcionário não encontrado.' })
          continue
        }

        const start = parseISO(item.startDate)
        const end = parseISO(item.endDate)
        const days = differenceInDays(end, start) + 1

        // Validar CLT (com fracionamento)
        const periods = VacationEngine.calculatePeriods(employee.hireDate, 0, employee.balanceOffset)
        const totalBalance = periods.reduce((acc: number, p: any) => acc + p.daysOfRight, 0)
        const targetPeriod = periods.find((p: any) => start >= p.startDate && start < p.endDate)
        const periodDaysOfRight = targetPeriod?.daysOfRight ?? 30
        const existingRequests = await fastify.prisma.vacationRequest.findMany({
          where: {
            employeeId: item.employeeId,
            tenantId,
            status: { not: 'REJECTED' },
            startDate: { gte: targetPeriod?.startDate ?? new Date(0) },
            endDate: { lt: targetPeriod?.endDate ?? new Date('2999-12-31') }
          },
          select: { startDate: true, endDate: true, days: true, status: true }
        })
        const validation = await VacationEngine.validateRequestFull(start, end, totalBalance, {
          tenantId,
          resolver: fastify.holidayResolver,
          fractionContext: { existingFractions: existingRequests, periodDaysOfRight }
        })

        if (!validation.isValid) {
          errors++
          results.push({
            employeeId: item.employeeId,
            status: 'error',
            message: validation.errors.join('; '),
            codes: validation.errorDetails?.map(e => e.code)
          })
          continue
        }

        await fastify.prisma.vacationRequest.create({
          data: { tenantId, employeeId: item.employeeId, startDate: start, endDate: end, days, status: 'PENDING' }
        })
        created++
        results.push({ employeeId: item.employeeId, status: 'created' })
      } catch (err: any) {
        errors++
        results.push({ employeeId: item.employeeId, status: 'error', message: err.message })
      }
    }

    return { created, errors, results }
  })

  // GET /api/v1/vacations/fractioning/:employeeId — análise para guiar UI
  // Retorna: estado de fracionamento do aquisitivo atual + feriados/domingos próximos
  fastify.get('/fractioning/:employeeId', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { employeeId } = request.params as { employeeId: string }

    const employee = await fastify.prisma.employee.findFirst({
      where: { id: employeeId, tenantId }
    })
    if (!employee) return reply.code(404).send({ error: 'Not Found' })

    const periods = VacationEngine.calculatePeriods(employee.hireDate, 0, employee.balanceOffset)
    const today = new Date()
    const currentPeriod =
      periods.find((p: any) => today >= p.startDate && today < p.endDate) ||
      periods[periods.length - 1]
    if (!currentPeriod) return { analysis: null, period: null, holidaysAhead: [] }

    const existing = await fastify.prisma.vacationRequest.findMany({
      where: {
        employeeId,
        tenantId,
        status: { not: 'REJECTED' },
        startDate: { gte: currentPeriod.startDate },
        endDate: { lt: currentPeriod.endDate }
      },
      select: { startDate: true, endDate: true, days: true, status: true }
    })

    const analysis = VacationEngine.analyzeFractioning(existing, currentPeriod.daysOfRight)

    // Próximos 12 meses de feriados (para o calendário de seleção)
    const year = today.getFullYear()
    const [thisYear, nextYear] = await Promise.all([
      fastify.holidayResolver.getHolidays({ tenantId, year }),
      fastify.holidayResolver.getHolidays({ tenantId, year: year + 1 })
    ])

    return {
      period: {
        startDate: currentPeriod.startDate,
        endDate: currentPeriod.endDate,
        concessiveEndDate: currentPeriod.concessiveEndDate,
        daysOfRight: currentPeriod.daysOfRight,
        status: currentPeriod.status
      },
      analysis,
      existingFractions: existing,
      holidaysAhead: [...thisYear, ...nextYear].filter(h => h.date >= today.toISOString().slice(0, 10))
    }
  })
}

export default vacations
