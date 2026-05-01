// Plugin Fastify que decora `fastify.requirePermission(key)` retornando preHandler.
// Cadeia esperada: jwt → auth-guard.requireAuth → permissions.requirePermission(key)
// TODO(v3-3-rbac-data-driven): quando RBAC virar data-driven, esta camada permanece;
// apenas o módulo `auth/permissions.ts` (mapa estático) será substituído por consulta DB.

import fp from 'fastify-plugin'
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import {
  PERMISSION_TO_ROLES,
  type PermissionKey,
  isPermissionKey,
  roleHasPermission,
} from '../modules/auth/permissions'

export default fp(async (fastify) => {
  fastify.decorate('requirePermission', (key: PermissionKey): preHandlerAsyncHookHandler => {
    if (!isPermissionKey(key)) {
      throw new Error(
        `Unknown permission key: "${key}". Valid keys: ${Object.keys(PERMISSION_TO_ROLES).join(', ')}`
      )
    }
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as { role?: string } | undefined
      if (!roleHasPermission(user?.role, key)) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Acesso restrito.',
          code: 'FORBIDDEN',
        })
      }
    }
  })
})

declare module 'fastify' {
  export interface FastifyInstance {
    requirePermission(key: PermissionKey): preHandlerAsyncHookHandler
  }
}
