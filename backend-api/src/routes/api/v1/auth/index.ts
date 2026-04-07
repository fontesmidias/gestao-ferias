import { FastifyPluginAsync } from 'fastify'
import * as bcrypt from 'bcryptjs'

const auth: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Rota Clássica de Autenticação: E-mail + Senha
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body as any

    // Verificar se o usuário existe
    const user = await fastify.prisma.user.findUnique({
      where: { email },
      include: { tenant: true }
    })

    if (!user || !(user as any).passwordHash) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'E-mail ou senha incorretos.' })
    }

    // Validar a Hash BCrypt
    const isPasswordValid = await bcrypt.compare(password, (user as any).passwordHash)
    if (!isPasswordValid) {
       return reply.code(401).send({ error: 'Unauthorized', message: 'E-mail ou senha incorretos.' })
    }

    // Gerar Token de Sessão (expiração longa: 24h)
    const sessionToken = fastify.jwt.sign(
      { userId: user.id, tenantId: user.tenantId, email: user.email, role: user.role, name: user.name },
      { expiresIn: '24h' }
    )

    fastify.log.info(`[LOGIN VIA PASSWORD] Usuário logado com sucesso: ${email}`)

    return {
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId
      }
    }
  })

  // Rota Me (Teste de Autenticação e Carregamento de Perfil frontend)
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
