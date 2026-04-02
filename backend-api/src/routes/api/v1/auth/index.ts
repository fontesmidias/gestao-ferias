import { FastifyPluginAsync } from 'fastify'

const auth: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Rota para solicitar o Magic Link
  fastify.post('/magic-link', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request, reply) => {
    const { email } = request.body as { email: string }

    // Verificar se o usuário existe
    const user = await fastify.prisma.user.findUnique({
      where: { email },
      include: { tenant: true }
    })

    if (!user) {
      // Por segurança, não confirmamos que o e-mail não existe.
      return reply.send({ message: 'Se o e-mail estiver cadastrado, você receberá um link de acesso.' })
    }

    // Gerar Token de Magic Link (expiração curta: 15 min)
    const token = fastify.jwt.sign(
      { userId: user.id, tenantId: user.tenantId, email: user.email, action: 'magic-link' },
      { expiresIn: '15m' }
    )

    // Simular envio de e-mail (Log no console)
    const loginUrl = `http://localhost:3000/auth/callback?token=${token}`
    
    fastify.log.info(`[MOCK EMAIL] Magic Link para ${email}: ${loginUrl}`)
    console.log(`\n==== MOCK EMAIL SENT ====\nTo: ${email}\nLink: ${loginUrl}\n========================\n`)

    return { message: 'Se o e-mail estiver cadastrado, você receberá um link de acesso.' }
  })

  // Rota para verificar o Magic Link e gerar sessão
  fastify.get('/verify', {
    schema: {
      querystring: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { token } = request.query as { token: string }

    try {
      const decoded = fastify.jwt.verify(token) as any
      
      if (decoded.action !== 'magic-link') {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Token inválido para esta ação.' })
      }

      // Gerar Token de Sessão (expiração longa: 24h)
      const sessionToken = fastify.jwt.sign(
        { userId: decoded.userId, tenantId: decoded.tenantId, email: decoded.email },
        { expiresIn: '24h' }
      )

      return {
        token: sessionToken,
        user: {
          id: decoded.userId,
          email: decoded.email,
          tenantId: decoded.tenantId
        }
      }
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Link expirado ou inválido.' })
    }
  })

  // Rota Me (Teste de Autenticação)
  fastify.get('/me', {
    onRequest: [async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.send(err)
      }
    }]
  }, async (request) => {
    return request.user
  })
}

export default auth
