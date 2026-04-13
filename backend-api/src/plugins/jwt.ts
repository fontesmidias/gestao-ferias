import jwt from '@fastify/jwt'
import fp from 'fastify-plugin'

export default fp(async (fastify) => {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required. Set it in your .env file.')
  }

  fastify.register(jwt, {
    secret: jwtSecret
  })

})
