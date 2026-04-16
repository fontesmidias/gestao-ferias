import { FastifyPluginAsync } from 'fastify'
import * as bcrypt from 'bcryptjs'
import { randomUUID, randomInt } from 'node:crypto'
import { addDays, addMinutes, isAfter } from 'date-fns'
import { EmailService } from '../../../../modules/notifications/email-service.js'

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

    // Verificar se conta esta ativa
    if ((user as any).isActive === false) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Conta desativada. Entre em contato com o administrador.' })
    }

    // Validar a Hash BCrypt
    const isPasswordValid = await bcrypt.compare(password, (user as any).passwordHash)
    if (!isPasswordValid) {
       return reply.code(401).send({ error: 'Unauthorized', message: 'E-mail ou senha incorretos.' })
    }

    // Atualizar lastLoginAt do tenant
    if (user.tenantId) {
      await fastify.prisma.tenant.update({
        where: { id: user.tenantId },
        data: { lastLoginAt: new Date() }
      })
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

    // 1. Buscar token no banco (com employee para manter employeeId)
    const stored = await fastify.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { employee: { select: { id: true } } } } }
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

    // 4. Gerar novo par (preservar employeeId e contexto de switch)
    const user = stored.user
    const refreshEmployeeId = (user as any).employee?.id || null
    const newAccessToken = fastify.jwt.sign(
      { userId: user.id, tenantId: stored.tenantId, email: user.email, role: user.role, name: user.name, employeeId: refreshEmployeeId },
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
    const user = request.user as any
    // Story 7.2: Incluir branding do tenant na resposta
    if (user.tenantId) {
      const tenant = await fastify.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { brandName: true, brandPrimaryColor: true, brandSecondaryColor: true, brandLogoUrl: true }
      })
      if (tenant) {
        return { ...user, branding: tenant }
      }
    }
    return user
  })

  // ─── Perfil do usuario (qualquer role autenticado) ─────
  fastify.patch('/profile', {
    onRequest: [fastify.requireAuth],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2 },
          email: { type: 'string', format: 'email' },
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 6 }
        }
      }
    }
  }, async (request, reply) => {
    const { userId } = request.user as any
    const { name, email, currentPassword, newPassword } = request.body as {
      name?: string; email?: string; currentPassword?: string; newPassword?: string
    }

    const user = await fastify.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return reply.code(404).send({ error: 'Usuario nao encontrado.' })

    // Se quer trocar senha, precisa da senha atual
    if (newPassword) {
      if (!currentPassword) {
        return reply.code(400).send({ error: 'Informe a senha atual para definir uma nova.' })
      }
      const isValid = await bcrypt.compare(currentPassword, (user as any).passwordHash || '')
      if (!isValid) {
        return reply.code(401).send({ error: 'Senha atual incorreta.' })
      }
    }

    const data: any = {}
    if (name !== undefined) data.name = name
    if (email !== undefined) data.email = email
    if (newPassword) data.passwordHash = await bcrypt.hash(newPassword, 10)

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'Nenhum campo para atualizar.' })
    }

    try {
      const updated = await fastify.prisma.user.update({
        where: { id: userId },
        data,
        select: { id: true, name: true, email: true, role: true }
      })
      return updated
    } catch (err: any) {
      if (err.code === 'P2002') {
        return reply.code(409).send({ error: 'Este email ja esta em uso.' })
      }
      throw err
    }
  })

  // ─── Gestao de equipe pelo ADMIN do tenant ─────────────

  // Listar usuarios do meu tenant
  fastify.get('/team', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin]
  }, async (request) => {
    const { tenantId } = request.user as any
    if (!tenantId) return []

    return await fastify.prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true, name: true, email: true, role: true, isActive: true, createdAt: true,
        employee: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  })

  // Criar usuario no meu tenant (ADMIN cria ADMIN, USER, AUDITOR)
  fastify.post('/team', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email', 'password', 'role'],
        properties: {
          name: { type: 'string', minLength: 2 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          role: { type: 'string', enum: ['ADMIN', 'USER', 'AUDITOR'] }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    if (!tenantId) return reply.code(403).send({ error: 'Forbidden' })

    const { name, email, password, role } = request.body as any
    const passwordHash = await bcrypt.hash(password, 10)

    try {
      const user = await fastify.prisma.user.create({
        data: { name, email, passwordHash, role, tenantId }
      })
      return reply.code(201).send({
        id: user.id, name: user.name, email: user.email, role: user.role
      })
    } catch (err: any) {
      if (err.code === 'P2002') {
        return reply.code(409).send({ error: 'Email ja existe nesta empresa.' })
      }
      throw err
    }
  })

  // Editar usuario do meu tenant
  fastify.patch('/team/:userId', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['ADMIN', 'USER', 'AUDITOR'] },
          isActive: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { userId } = request.params as { userId: string }

    const existing = await fastify.prisma.user.findFirst({ where: { id: userId, tenantId } })
    if (!existing) return reply.code(404).send({ error: 'Usuario nao encontrado.' })

    const data = request.body as any
    const updated = await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name !== undefined ? data.name : undefined,
        email: data.email !== undefined ? data.email : undefined,
        role: data.role !== undefined ? data.role : undefined,
        isActive: data.isActive !== undefined ? data.isActive : undefined,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    })
    return updated
  })

  // Desativar usuario do meu tenant
  fastify.delete('/team/:userId', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin]
  }, async (request, reply) => {
    const { tenantId, userId: currentUserId } = request.user as any
    const { userId } = request.params as { userId: string }

    if (userId === currentUserId) {
      return reply.code(400).send({ error: 'Voce nao pode desativar sua propria conta.' })
    }

    const existing = await fastify.prisma.user.findFirst({ where: { id: userId, tenantId } })
    if (!existing) return reply.code(404).send({ error: 'Usuario nao encontrado.' })

    await fastify.prisma.user.update({ where: { id: userId }, data: { isActive: false } })
    return { message: 'Usuario desativado.' }
  })

  // ─── Esqueci minha senha ───────────────────────────────

  fastify.post('/forgot-password', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 hour'
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request) => {
    const { email } = request.body as { email: string }

    // Sempre retornar sucesso (nao revelar se email existe)
    const successMsg = { message: 'Se o email existir no sistema, enviaremos instrucoes de recuperacao.' }

    const user = await fastify.prisma.user.findFirst({
      where: { email },
      include: { tenant: true }
    })

    if (!user) return successMsg

    // Gerar codigo de 6 digitos
    const code = String(randomInt(100000, 999999))
    const expires = addMinutes(new Date(), 30)

    await fastify.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: code,
        passwordResetExpires: expires
      }
    })

    // Enviar email (nao bloquear se falhar)
    if (user.tenantId) {
      EmailService.sendPasswordReset(user.tenantId, email, code, fastify.prisma).catch(() => {})
    }

    fastify.log.info(`[AUTH] Password reset requested for: ${email}`)
    return successMsg
  })

  fastify.post('/reset-password', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 hour'
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'code', 'newPassword'],
        properties: {
          email: { type: 'string', format: 'email' },
          code: { type: 'string', minLength: 6, maxLength: 6 },
          newPassword: { type: 'string', minLength: 6 }
        }
      }
    }
  }, async (request, reply) => {
    const { email, code, newPassword } = request.body as { email: string; code: string; newPassword: string }

    const user = await fastify.prisma.user.findFirst({
      where: { email, passwordResetToken: code }
    })

    if (!user || !user.passwordResetExpires || isAfter(new Date(), user.passwordResetExpires)) {
      return reply.code(400).send({ error: 'Codigo invalido ou expirado.' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await fastify.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null
      }
    })

    fastify.log.info(`[AUTH] Password reset completed for: ${email}`)
    return { message: 'Senha alterada com sucesso. Faca login com a nova senha.' }
  })

  // ─── Verificacao de email ──────────────────────────────

  fastify.post('/send-verification', {
    onRequest: [fastify.requireAuth],
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 hour'
      }
    }
  }, async (request) => {
    const { userId, tenantId, email } = request.user as any

    const code = String(randomInt(100000, 999999))

    await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetToken: code,
        passwordResetExpires: addMinutes(new Date(), 30)
      }
    })

    if (tenantId) {
      EmailService.sendEmailVerification(tenantId, email, code, fastify.prisma).catch(() => {})
    }

    return { message: 'Codigo de verificacao enviado para seu email.' }
  })

  fastify.post('/verify-email', {
    onRequest: [fastify.requireAuth],
    schema: {
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 6, maxLength: 6 }
        }
      }
    }
  }, async (request, reply) => {
    const { userId } = request.user as any
    const { code } = request.body as { code: string }

    const user = await fastify.prisma.user.findUnique({ where: { id: userId } })

    if (!user || user.passwordResetToken !== code || !user.passwordResetExpires || isAfter(new Date(), user.passwordResetExpires)) {
      return reply.code(400).send({ error: 'Codigo invalido ou expirado.' })
    }

    await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: new Date(),
        passwordResetToken: null,
        passwordResetExpires: null
      }
    })

    return { message: 'Email verificado com sucesso!' }
  })
}

export default auth
