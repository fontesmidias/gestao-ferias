import fp from 'fastify-plugin'
import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

export default fp(async (fastify) => {
  fastify.setErrorHandler(function (error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
    // Validação do JSON Schema do Fastify
    if (error.validation) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Falha na validação dos dados enviados.',
        details: error.validation
      })
    }

    // Erros do Prisma
    if (error.code && error.code.startsWith('P2')) {
      fastify.log.error({ prismaCode: error.code, message: error.message, url: request.url, method: request.method }, `Prisma Error: ${error.code}`)

      if (error.code === 'P2002') {
        return reply.status(409).send({ error: 'Conflict', message: 'Registro duplicado detectado no banco de dados.' })
      }

      if (error.code === 'P2003' || error.code === 'P2014') {
        return reply.status(409).send({ error: 'Conflict', message: 'Nao foi possivel concluir a operacao pois existem dados vinculados.' })
      }

      if (error.code === 'P2025') {
        return reply.status(404).send({ error: 'Not Found', message: 'Registro nao encontrado.' })
      }

      return reply.status(500).send({ error: 'DatabaseError', message: 'Erro interno no banco de dados.' })
    }

    // Rate Limit
    if (error.statusCode === 429) {
      return reply.status(429).send({ error: 'Too Many Requests', message: 'Limite de requisicoes excedido. Tente novamente em alguns minutos.' })
    }

    // Default Fallback
    fastify.log.error({ err: error, url: request.url, method: request.method, statusCode: error.statusCode }, 'Unhandled error')
    reply.status(error.statusCode || 500).send({
      error: error.name || 'Internal Server Error',
      message: error.message || 'Ocorreu um erro interno.'
    })
  })
})
