import fp from 'fastify-plugin'
import websocket from '@fastify/websocket'

declare module 'fastify' {
  interface FastifyInstance {
    broadcast: (tenantId: string, message: any) => void;
  }
}

export default fp(async (fastify) => {
  await fastify.register(websocket)

  const clients = new Map<string, Set<any>>()

  // Rota de WebSocket com autenticação JWT via query param
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    const token = req.query ? (req.query as any).token : null

    if (!token) {
      connection.close(4401, 'Token obrigatório')
      return
    }

    let payload: { tenantId: string }
    try {
      payload = fastify.jwt.verify<{ tenantId: string }>(token)
    } catch {
      connection.close(4401, 'Token inválido ou expirado')
      return
    }

    const tenantId = payload.tenantId
    if (!tenantId) {
      connection.close(4401, 'Tenant não identificado no token')
      return
    }

    if (!clients.has(tenantId)) {
      clients.set(tenantId, new Set())
    }

    const tenantClients = clients.get(tenantId)!
    tenantClients.add(connection)

    fastify.log.info(`[WS] Cliente autenticado conectado para Tenant ${tenantId}`)

    connection.on('close', () => {
      tenantClients.delete(connection)
      fastify.log.info(`[WS] Cliente desconectado do Tenant ${tenantId}`)
    })
  })

  // Método auxiliar para broadcast por Tenant
  fastify.decorate('broadcast', (tenantId: string, message: any) => {
    const tenantClients = clients.get(tenantId)
    if (tenantClients) {
      const data = JSON.stringify(message)
      tenantClients.forEach(client => {
        if (client.readyState === 1) { // OPEN
          client.send(data)
        }
      })
    }
  })
})
