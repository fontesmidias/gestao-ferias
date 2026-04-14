import { FastifyPluginAsync } from 'fastify'

const zapsignWebhook: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Webhook público recebido da ZapSign quando um documento é assinado
  fastify.post('/zapsign', async (request, reply) => {
    try {
      const body = request.body as any

      // ZapSign envia evento doc_signed quando todos os signatários assinaram
      const event = body?.event || body?.type
      const externalId = body?.external_id || body?.doc?.external_id

      if (!externalId) {
        fastify.log.warn('[ZapSign Webhook] Payload sem external_id, ignorando.')
        return reply.code(200).send({ ok: true })
      }

      // Verificar se a solicitação de férias existe
      const vacationRequest = await fastify.prisma.vacationRequest.findUnique({
        where: { id: externalId },
        include: { signature: true },
      })

      if (!vacationRequest) {
        fastify.log.warn(`[ZapSign Webhook] VacationRequest ${externalId} não encontrado.`)
        return reply.code(200).send({ ok: true })
      }

      // Processar evento de documento assinado
      if (event === 'doc_signed' || event === 'signed') {
        const now = new Date()

        // Atualizar assinatura com data de assinatura
        if (vacationRequest.signature) {
          await fastify.prisma.signature.update({
            where: { id: vacationRequest.signature.id },
            data: { signedAt: now },
          })
        }

        // Atualizar status da solicitação para SIGNED
        await fastify.prisma.vacationRequest.update({
          where: { id: externalId },
          data: { status: 'SIGNED' },
        })

        fastify.log.info(`[ZapSign Webhook] Documento assinado para férias ${externalId}.`)
      }

      return reply.code(200).send({ ok: true })
    } catch (err: any) {
      fastify.log.error(`[ZapSign Webhook] Erro ao processar: ${err.message}`)
      // Sempre retorna 200 para evitar reenvios do ZapSign
      return reply.code(200).send({ ok: true })
    }
  })
}

export default zapsignWebhook
