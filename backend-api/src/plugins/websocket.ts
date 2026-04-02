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

  // Rota de WebSocket para notificações em tempo real (Story 5.3)
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    const tenantId = req.query ? (req.query as any).tenantId : 'default'
    
    if (!clients.has(tenantId)) {
      clients.set(tenantId, new Set())
    }
    
    const tenantClients = clients.get(tenantId)!
    tenantClients.add(connection)
    
    fastify.log.info(`[WS] Novo cliente conectado para o Tenant ${tenantId}`)

    connection.on('close', () => {
      tenantClients.delete(connection)
      fastify.log.info(`[WS] Cliente desconectado do Tenant ${tenantId}`)
    })
  })

  // Método auxiliar para broadcast por Tenant (Story 5.3)
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
