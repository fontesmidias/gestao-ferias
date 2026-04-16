import { FastifyPluginAsync } from 'fastify'
import { randomUUID, timingSafeEqual } from 'crypto'
import { addDays } from 'date-fns'

const masterkey: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.post('/', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 hour'
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'masterKey'],
        properties: {
          email: { type: 'string', format: 'email' },
          masterKey: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { email, masterKey } = request.body as { email: string; masterKey: string }

    // Buscar MasterKey do banco de dados
    const config = await fastify.prisma.systemConfig.findUnique({ where: { id: 'singleton' } })

    // Se MasterKey nao esta configurada ou esta desabilitada, rota "nao existe"
    if (!config || !config.masterKey || !config.masterKeyEnabled || config.masterKey.length < 32) {
      return reply.code(404).send({ error: 'Not Found' })
    }

    const MASTER_KEY = config.masterKey

    // Buscar usuario por email
    const user = await fastify.prisma.user.findFirst({
      where: { email },
      include: { tenant: true, employee: { select: { id: true } } }
    })

    // Comparacao timing-safe (padded para mesmo tamanho)
    const keyBuffer = Buffer.alloc(256, 0)
    const envBuffer = Buffer.alloc(256, 0)
    keyBuffer.write(masterKey)
    envBuffer.write(MASTER_KEY)
    const isKeyValid = timingSafeEqual(keyBuffer, envBuffer)

    // Logar tentativa (sucesso ou falha)
    await fastify.prisma.masterKeyLog.create({
      data: {
        userId: user?.id || null,
        email,
        targetRole: user?.role || null,
        ip: request.ip,
        userAgent: request.headers['user-agent'] || null,
        success: isKeyValid && !!user
      }
    })

    // Falha: chave invalida ou usuario nao encontrado
    if (!isKeyValid || !user) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Credenciais invalidas.' })
    }

    fastify.log.warn(`[MASTERKEY] Emergency access for: ${email} from IP: ${request.ip}`)

    // Buscar employeeId vinculado
    const employeeId = (user as any).employee?.id || null

    // Gerar Access Token com claim masterKeyAccess
    const accessToken = fastify.jwt.sign(
      {
        userId: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role,
        name: user.name,
        employeeId,
        masterKeyAccess: true
      },
      { expiresIn: '15m' }
    )

    // Gerar Refresh Token
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
}

export default masterkey
