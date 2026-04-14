import { FastifyPluginAsync } from 'fastify'
import * as bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { addDays, isAfter } from 'date-fns'

const auth: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Rota Clássica de Autenticação: E-mail + Senha (rate limited: 5/min por IP)
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    },
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

    // Verificar se o usuário existe (email não é mais globally unique)
    const user = await fastify.prisma.user.findFirst({
      where: { email },
      include: { tenant: true, employee: { select: { id: true } } }
    })

    if (!user || !(user as any).passwordHash) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'E-mail ou senha incorretos.' })
    }

    // Validar a Hash BCrypt
    const isPasswordValid = await bcrypt.compare(password, (user as any).passwordHash)
    if (!isPasswordValid) {
       return reply.code(401).send({ error: 'Unauthorized', message: 'E-mail ou senha incorretos.' })
    }

    // Buscar employeeId vinculado (se existir)
    const employeeId = (user as any).employee?.id || null

    // Gerar Access Token (curto: 15 minutos)
    const accessToken = fastify.jwt.sign(
      { userId: user.id, tenantId: user.tenantId, email: user.email, role: user.role, name: user.name, employeeId },
      { expiresIn: '15m' }
    )

    // Gerar Refresh Token (longo: 7 dias) e salvar no banco
    const refreshTokenValue = randomUUID()
    if (user.tenantId) {
      await fastify.prisma.refreshToken.create({
        data: {
          token: refreshTokenValue,
          userId: user.id,
          tenantId: user.tenantId,
          expiresAt: addDays(new Date(), 7)
        }
      })
    }

    fastify.log.info(`[LOGIN] Usuário logado com sucesso: ${email}`)

    return {
      token: accessToken,
      refreshToken: refreshTokenValue,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        employeeId
      }
    }
  })

  // Refresh Token: gera novo par de tokens
  fastify.post('/refresh', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string }

    // 1. Buscar token no banco
    const stored = await fastify.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true }
    })

    if (!stored) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Refresh token inválido.' })
    }

    // 2. Verificar expiração
    if (isAfter(new Date(), stored.expiresAt)) {
      await fastify.prisma.refreshToken.delete({ where: { id: stored.id } })
      return reply.code(401).send({ error: 'Unauthorized', message: 'Refresh token expirado.' })
    }

    // 3. Revogar token antigo (rotation)
    await fastify.prisma.refreshToken.delete({ where: { id: stored.id } })

    // 4. Gerar novo par
    const user = stored.user
    const newAccessToken = fastify.jwt.sign(
      { userId: user.id, tenantId: stored.tenantId, email: user.email, role: user.role, name: user.name },
      { expiresIn: '15m' }
    )

    const newRefreshTokenValue = randomUUID()
    await fastify.prisma.refreshToken.create({
      data: {
        token: newRefreshTokenValue,
        userId: user.id,
        tenantId: stored.tenantId,
        expiresAt: addDays(new Date(), 7)
      }
    })

    return {
      token: newAccessToken,
      refreshToken: newRefreshTokenValue,
    }
  })

  // Logout: invalida refresh token
  fastify.post('/logout', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string }
    const { userId } = request.user as any

    if (refreshToken) {
      // Revogar token específico
      await fastify.prisma.refreshToken.deleteMany({
        where: { token: refreshToken, userId }
      })
    } else {
      // Revogar todos os tokens do usuário
      await fastify.prisma.refreshToken.deleteMany({
        where: { userId }
      })
    }

    return { message: 'Logout realizado com sucesso.' }
  })

  // Rota Me (Teste de Autenticação e Carregamento de Perfil frontend)
  fastify.get('/me', {
    onRequest: [fastify.requireAuth]
  }, async (request) => {
    return request.user
  })
}

export default auth
