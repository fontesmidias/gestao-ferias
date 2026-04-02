import { FastifyPluginAsync } from 'fastify'
import { addMinutes, isAfter } from 'date-fns'

const signatureAuth: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Solicitar código OTP via WhatsApp (Story 4.2)
  fastify.post('/request-otp', {
    schema: {
      body: {
        type: 'object',
        required: ['signatureId', 'phone'],
        properties: {
          signatureId: { type: 'string', format: 'uuid' },
          phone: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { signatureId, phone } = request.body as any
    
    // 1. Verificar registro de assinatura
    const signature = await fastify.prisma.signature.findUnique({
      where: { id: signatureId }
    })

    if (!signature || signature.signedAt) {
      return reply.code(400).send({ error: 'Invalid Request', message: 'Assinatura inválida ou já realizada.' })
    }

    // 2. Gerar código OTP (6 dígitos)
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = addMinutes(new Date(), 5)

    // 3. Persistir OTP
    await fastify.prisma.signature.update({
      where: { id: signatureId },
      data: {
        otpCode: code,
        otpExpiresAt: expiresAt
      }
    })

    // 4. Enfileirar para envio via WhatsApp (Story 4.3)
    await fastify.queues.notification.add('SEND_SIGNATURE_OTP', {
      type: 'SEND_SIGNATURE_OTP',
      data: { phone, code }
    })

    return { message: 'Código enfileirado para envio.' }
  })

  // Verificar OTP e Assinar Documento (Story 4.2)
  fastify.post('/verify-otp', {
    schema: {
      body: {
        type: 'object',
        required: ['signatureId', 'code'],
        properties: {
          signatureId: { type: 'string', format: 'uuid' },
          code: { type: 'string', minLength: 6, maxLength: 6 }
        }
      }
    }
  }, async (request, reply) => {
    const { signatureId, code } = request.body as any

    const signature = await fastify.prisma.signature.findUnique({
      where: { id: signatureId }
    })

    if (!signature || !signature.otpCode || !signature.otpExpiresAt) {
      return reply.code(400).send({ error: 'Error', message: 'Solicitação de OTP não encontrada.' })
    }

    // 1. Validar Código e Expiração
    if (signature.otpCode !== code || isAfter(new Date(), signature.otpExpiresAt)) {
      return reply.code(400).send({ error: 'Invalid OTP', message: 'Código inválido ou expirado.' })
    }

    // 2. Transação: Selar Documento + Atualizar Status das Férias
    const result = await fastify.prisma.$transaction([
      fastify.prisma.signature.update({
        where: { id: signatureId },
        data: {
          signedAt: new Date(),
          otpCode: null,
          otpExpiresAt: null
        }
      }),
      fastify.prisma.vacationRequest.update({
        where: { id: signature.vacationRequestId },
        data: { status: 'SIGNED' }
      })
    ])

    // 3. Enfileirar Webhook (Epic 6)
    await fastify.queues.webhook.add('VACATION_SIGNED', {
      event: 'VACATION_SIGNED',
      tenantId: signature.tenantId,
      data: {
        signatureId: signature.id,
        vacationRequestId: signature.vacationRequestId,
        signedAt: result[0].signedAt
      }
    })

    return { 
      message: 'Documento assinado com sucesso e validade jurídica garantida.',
      signedAt: result[0].signedAt 
    }
  })
}

export default signatureAuth
