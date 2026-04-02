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

    // Erros do Prisma (Exemplo: Unique Constraint P2002)
    if (error.code && error.code.startsWith('P2')) {
      fastify.log.warn(`Prisma Error: ${error.code} - ${error.message}`)
      
      // Alguns tratamos direto nas rotas, como Tenants.
      // Se escapou para cá, é um genérico não tratado.
      if (error.code === 'P2002') {
        return reply.status(409).send({ error: 'Conflict', message: 'Registro duplicado detectado no banco de dados.' })
      }
      
      if (error.code === 'P2025') {
        return reply.status(404).send({ error: 'Not Found', message: 'Registro não encontrado.' })
      }

      return reply.status(500).send({ error: 'Internal Server Error', message: 'Erro interno no banco de dados.' })
    }

    // Rate Limit (se adicionado)
    if (error.statusCode === 429) {
      return reply.status(429).send({ error: 'Too Many Requests', message: 'Limite de requisições excedido.' })
    }

    // Default Fallback 500
    fastify.log.error(error)
    reply.status(error.statusCode || 500).send({
      error: error.name || 'Internal Server Error',
      message: 'Ocorreu um erro interno e inesperado. Nossa equipe já foi notificada.'
    })
  })
})
