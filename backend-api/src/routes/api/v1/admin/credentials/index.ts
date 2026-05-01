import { FastifyPluginAsync } from 'fastify'
import {
  detectEmailConflicts,
  detectWhatsappConflicts
} from '../../../../../modules/credentials/credential-resolver'
import { EmailService } from '../../../../../modules/notifications/email-service'
import { WhatsAppService } from '../../../../../modules/notifications/whatsapp-service'

const credentials: FastifyPluginAsync = async (fastify) => {
  // ============================================================
  // EMAIL CREDENTIALS
  // ============================================================

  fastify.get('/email', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async () => {
    const list = await fastify.prisma.emailCredential.findMany({
      include: { tenantAssignments: { select: { tenantId: true } } },
      orderBy: { createdAt: 'desc' }
    })
    return list.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      scope: c.scope,
      isActive: c.isActive,
      smtpHost: c.smtpHost,
      smtpPort: c.smtpPort,
      smtpUser: c.smtpUser,
      smtpPass: '••••••••',
      smtpFrom: c.smtpFrom,
      tenantIds: c.tenantAssignments.map(a => a.tenantId),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }))
  })

  fastify.post('/email', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'scope', 'smtpHost', 'smtpPort', 'smtpUser', 'smtpPass'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          scope: { type: 'string', enum: ['ALL', 'SPECIFIC'] },
          isActive: { type: 'boolean' },
          smtpHost: { type: 'string' },
          smtpPort: { type: 'integer' },
          smtpUser: { type: 'string' },
          smtpPass: { type: 'string' },
          smtpFrom: { type: 'string' },
          tenantIds: { type: 'array', items: { type: 'string', format: 'uuid' } }
        }
      }
    }
  }, async (request, reply) => {
    const body = request.body as any
    const isActive = body.isActive ?? true

    // Detectar conflito antes de criar
    const conflicts = await detectEmailConflicts(fastify.prisma as any, {
      scope: body.scope,
      isActive,
      tenantIds: body.tenantIds || []
    })
    if (conflicts.length > 0) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Conflito detectado: alguns tenants ficariam cobertos por mais de uma credencial SMTP ativa.',
        conflicts
      })
    }

    const created = await fastify.prisma.emailCredential.create({
      data: {
        name: body.name,
        description: body.description || null,
        scope: body.scope,
        isActive,
        smtpHost: body.smtpHost,
        smtpPort: body.smtpPort,
        smtpUser: body.smtpUser,
        smtpPass: body.smtpPass,
        smtpFrom: body.smtpFrom || null,
        tenantAssignments: body.scope === 'SPECIFIC' && Array.isArray(body.tenantIds)
          ? { create: body.tenantIds.map((tid: string) => ({ tenantId: tid })) }
          : undefined
      }
    })
    return reply.code(201).send(created)
  })

  fastify.patch('/email/:id', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          scope: { type: 'string', enum: ['ALL', 'SPECIFIC'] },
          isActive: { type: 'boolean' },
          smtpHost: { type: 'string' },
          smtpPort: { type: 'integer' },
          smtpUser: { type: 'string' },
          smtpPass: { type: 'string' },
          smtpFrom: { type: 'string' },
          tenantIds: { type: 'array', items: { type: 'string', format: 'uuid' } }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as any
    const existing = await fastify.prisma.emailCredential.findUnique({ where: { id }, include: { tenantAssignments: true } })
    if (!existing) return reply.code(404).send({ error: 'Not Found' })

    const nextScope = body.scope ?? existing.scope as 'ALL' | 'SPECIFIC'
    const nextActive = body.isActive ?? existing.isActive
    const nextTenantIds = body.tenantIds ?? existing.tenantAssignments.map(a => a.tenantId)

    const conflicts = await detectEmailConflicts(fastify.prisma as any, {
      id, scope: nextScope, isActive: nextActive, tenantIds: nextTenantIds
    })
    if (conflicts.length > 0) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Conflito detectado.',
        conflicts
      })
    }

    const data: any = {}
    if (body.name !== undefined) data.name = body.name
    if (body.description !== undefined) data.description = body.description || null
    if (body.scope !== undefined) data.scope = body.scope
    if (body.isActive !== undefined) data.isActive = body.isActive
    if (body.smtpHost !== undefined) data.smtpHost = body.smtpHost
    if (body.smtpPort !== undefined) data.smtpPort = body.smtpPort
    if (body.smtpUser !== undefined) data.smtpUser = body.smtpUser
    // Segurança: string vazia ou sentinela = manter senha atual (nunca sobrescrever por acidente)
    if (body.smtpPass !== undefined && body.smtpPass !== '••••••••' && body.smtpPass !== '') data.smtpPass = body.smtpPass
    if (body.smtpFrom !== undefined) data.smtpFrom = body.smtpFrom || null

    if (body.tenantIds !== undefined) {
      // Reset assignments
      await fastify.prisma.emailCredentialTenant.deleteMany({ where: { credentialId: id } })
      if (Array.isArray(body.tenantIds) && nextScope === 'SPECIFIC') {
        await fastify.prisma.emailCredentialTenant.createMany({
          data: body.tenantIds.map((tid: string) => ({ credentialId: id, tenantId: tid }))
        })
      }
    }

    const updated = await fastify.prisma.emailCredential.update({ where: { id }, data })
    return updated
  })

  fastify.delete('/email/:id', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const existing = await fastify.prisma.emailCredential.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Not Found' })
    await fastify.prisma.emailCredential.delete({ where: { id } })
    return reply.code(204).send()
  })

  // POST /admin/email-credentials/:id/test — envia e-mail de teste com a credencial salva
  fastify.post('/email/:id/test', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['to'], properties: { to: { type: 'string', format: 'email' } } }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { to } = request.body as { to: string }
    const cred = await fastify.prisma.emailCredential.findUnique({ where: { id } })
    if (!cred) return reply.code(404).send({ error: 'Not Found' })
    return await EmailService.sendTestEmail(to, {
      smtpHost: cred.smtpHost,
      smtpPort: cred.smtpPort,
      smtpUser: cred.smtpUser,
      smtpPass: cred.smtpPass,
      smtpFrom: cred.smtpFrom || undefined
    })
  })

  // ============================================================
  // WHATSAPP CREDENTIALS
  // ============================================================

  fastify.get('/whatsapp', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async () => {
    const list = await fastify.prisma.whatsappCredential.findMany({
      include: { tenantAssignments: { select: { tenantId: true } } },
      orderBy: { createdAt: 'desc' }
    })
    return list.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      scope: c.scope,
      isActive: c.isActive,
      evoApiUrl: c.evoApiUrl,
      evoApiKey: '••••••••',
      evoInstanceName: c.evoInstanceName,
      tenantIds: c.tenantAssignments.map(a => a.tenantId),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }))
  })

  fastify.post('/whatsapp', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'scope', 'evoApiUrl', 'evoApiKey', 'evoInstanceName'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          scope: { type: 'string', enum: ['ALL', 'SPECIFIC'] },
          isActive: { type: 'boolean' },
          evoApiUrl: { type: 'string' },
          evoApiKey: { type: 'string' },
          evoInstanceName: { type: 'string' },
          tenantIds: { type: 'array', items: { type: 'string', format: 'uuid' } }
        }
      }
    }
  }, async (request, reply) => {
    const body = request.body as any
    const isActive = body.isActive ?? true

    const conflicts = await detectWhatsappConflicts(fastify.prisma as any, {
      scope: body.scope,
      isActive,
      tenantIds: body.tenantIds || []
    })
    if (conflicts.length > 0) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Conflito detectado: alguns tenants ficariam cobertos por mais de uma credencial WhatsApp ativa.',
        conflicts
      })
    }

    const created = await fastify.prisma.whatsappCredential.create({
      data: {
        name: body.name,
        description: body.description || null,
        scope: body.scope,
        isActive,
        evoApiUrl: body.evoApiUrl,
        evoApiKey: body.evoApiKey,
        evoInstanceName: body.evoInstanceName,
        tenantAssignments: body.scope === 'SPECIFIC' && Array.isArray(body.tenantIds)
          ? { create: body.tenantIds.map((tid: string) => ({ tenantId: tid })) }
          : undefined
      }
    })
    return reply.code(201).send(created)
  })

  fastify.patch('/whatsapp/:id', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          scope: { type: 'string', enum: ['ALL', 'SPECIFIC'] },
          isActive: { type: 'boolean' },
          evoApiUrl: { type: 'string' },
          evoApiKey: { type: 'string' },
          evoInstanceName: { type: 'string' },
          tenantIds: { type: 'array', items: { type: 'string', format: 'uuid' } }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as any
    const existing = await fastify.prisma.whatsappCredential.findUnique({ where: { id }, include: { tenantAssignments: true } })
    if (!existing) return reply.code(404).send({ error: 'Not Found' })

    const nextScope = body.scope ?? existing.scope as 'ALL' | 'SPECIFIC'
    const nextActive = body.isActive ?? existing.isActive
    const nextTenantIds = body.tenantIds ?? existing.tenantAssignments.map(a => a.tenantId)

    const conflicts = await detectWhatsappConflicts(fastify.prisma as any, {
      id, scope: nextScope, isActive: nextActive, tenantIds: nextTenantIds
    })
    if (conflicts.length > 0) {
      return reply.code(409).send({ error: 'Conflict', message: 'Conflito detectado.', conflicts })
    }

    const data: any = {}
    if (body.name !== undefined) data.name = body.name
    if (body.description !== undefined) data.description = body.description || null
    if (body.scope !== undefined) data.scope = body.scope
    if (body.isActive !== undefined) data.isActive = body.isActive
    if (body.evoApiUrl !== undefined) data.evoApiUrl = body.evoApiUrl
    if (body.evoApiKey !== undefined && body.evoApiKey !== '••••••••' && body.evoApiKey !== '') data.evoApiKey = body.evoApiKey
    if (body.evoInstanceName !== undefined) data.evoInstanceName = body.evoInstanceName

    if (body.tenantIds !== undefined) {
      await fastify.prisma.whatsappCredentialTenant.deleteMany({ where: { credentialId: id } })
      if (Array.isArray(body.tenantIds) && nextScope === 'SPECIFIC') {
        await fastify.prisma.whatsappCredentialTenant.createMany({
          data: body.tenantIds.map((tid: string) => ({ credentialId: id, tenantId: tid }))
        })
      }
    }

    const updated = await fastify.prisma.whatsappCredential.update({ where: { id }, data })
    return updated
  })

  fastify.delete('/whatsapp/:id', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin]
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const existing = await fastify.prisma.whatsappCredential.findUnique({ where: { id } })
    if (!existing) return reply.code(404).send({ error: 'Not Found' })
    await fastify.prisma.whatsappCredential.delete({ where: { id } })
    return reply.code(204).send()
  })

  // POST /admin/whatsapp-credentials/:id/test — envia mensagem de teste
  fastify.post('/whatsapp/:id/test', {
    onRequest: [fastify.requireAuth, fastify.requireSuperAdmin],
    schema: {
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['to'], properties: { to: { type: 'string', minLength: 8 } } }
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { to } = request.body as { to: string }
    const cred = await fastify.prisma.whatsappCredential.findUnique({ where: { id } })
    if (!cred) return reply.code(404).send({ error: 'Not Found' })

    const formatted = WhatsAppService.formatPhone(to)
    const url = `${cred.evoApiUrl.replace(/\/+$/, '')}/message/sendText/${cred.evoInstanceName}`
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cred.evoApiKey },
        body: JSON.stringify({
          number: formatted,
          text: `Teste WhatsApp — credencial "${cred.name}" — ${new Date().toLocaleString('pt-BR')}`
        })
      })
      if (!resp.ok) {
        const errBody = await resp.text()
        return reply.code(422).send({ ok: false, status: resp.status, error: errBody })
      }
      return { ok: true, status: resp.status, normalizedPhone: formatted }
    } catch (err: any) {
      return reply.code(422).send({ ok: false, error: err.message })
    }
  })
}

export default credentials
