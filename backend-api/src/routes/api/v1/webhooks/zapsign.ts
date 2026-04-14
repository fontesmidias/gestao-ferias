import { FastifyPluginAsync } from 'fastify'
import { ZapSignService } from '../../../../modules/integrations/zapsign-service'

const zapsignWebhook: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Webhook publico recebido da ZapSign quando um documento e assinado
  fastify.post('/zapsign', async (request, reply) => {
    try {
      const body = request.body as any

      const event = body?.event || body?.type
      const externalId = body?.external_id || body?.doc?.external_id
      const docToken = body?.token || body?.doc?.token

      if (!externalId) {
        fastify.log.warn('[ZapSign Webhook] Payload sem external_id, ignorando.')
        return reply.code(200).send({ ok: true })
      }

      // Verificar se a solicitacao de ferias existe
      const vacationRequest = await fastify.prisma.vacationRequest.findUnique({
        where: { id: externalId },
        include: { signature: true },
      })

      if (!vacationRequest) {
        fastify.log.warn(`[ZapSign Webhook] VacationRequest ${externalId} nao encontrado.`)
        return reply.code(200).send({ ok: true })
      }

      // Validar: o docToken do webhook deve bater com o que temos no banco
      if (vacationRequest.signature?.zapSignDocToken && docToken) {
        if (vacationRequest.signature.zapSignDocToken !== docToken) {
          fastify.log.warn(`[ZapSign Webhook] Token mismatch para ${externalId}. Possivel fraude.`)
          return reply.code(200).send({ ok: true })
        }
      }

      // Processar evento de documento assinado
      if (event === 'doc_signed' || event === 'signed') {
        const now = new Date()

        // Tentar baixar o PDF assinado
        let signedFileUrl: string | null = null
        if (vacationRequest.signature?.zapSignDocToken) {
          try {
            const docStatus = await ZapSignService.getDocumentStatus(
              vacationRequest.tenantId,
              vacationRequest.signature.zapSignDocToken,
              fastify.prisma as any
            )
            signedFileUrl = docStatus.signed_file || null
          } catch (err) {
            fastify.log.error(`[ZapSign Webhook] Falha ao buscar PDF assinado: ${err}`)
          }
        }

        // Atualizar assinatura com data e URL do PDF assinado
        if (vacationRequest.signature) {
          await fastify.prisma.signature.update({
            where: { id: vacationRequest.signature.id },
            data: {
              signedAt: now,
              pdfUrl: signedFileUrl,
            },
          })
        }

        // Atualizar status da solicitacao para SIGNED
        await fastify.prisma.vacationRequest.update({
          where: { id: externalId },
          data: { status: 'SIGNED' },
        })

        fastify.log.info(`[ZapSign Webhook] Documento assinado para ferias ${externalId}.`)
      }

      return reply.code(200).send({ ok: true })
    } catch (err: any) {
      fastify.log.error(`[ZapSign Webhook] Erro ao processar: ${err.message}`)
      return reply.code(200).send({ ok: true })
    }
  })
}

export default zapsignWebhook
