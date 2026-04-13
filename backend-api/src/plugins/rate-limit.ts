import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'

export default fp(async (fastify) => {
  await fastify.register(rateLimit, {
    global: false, // Não aplicar globalmente — apenas nas rotas configuradas
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  })
})
