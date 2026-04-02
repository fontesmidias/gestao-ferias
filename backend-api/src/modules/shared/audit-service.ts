import { PrismaClient } from '@prisma/client'

export interface AuditLogOptions {
  tenantId: string;
  userId: string;
  action: string;
  resourceId: string;
  resourceType: string;
  previousData?: any;
  newData?: any;
  reason?: string;
  ip?: string;
  userAgent?: string;
}

export class AuditService {
  /**
   * Grava um log de auditoria no banco de dados.
   * Utiliza a instância do Prisma injetada.
   */
  static async log(prisma: PrismaClient, options: AuditLogOptions) {
    return await prisma.auditLog.create({
      data: {
        tenantId: options.tenantId,
        userId: options.userId,
        action: options.action,
        resourceId: options.resourceId,
        resourceType: options.resourceType,
        previousData: options.previousData,
        newData: options.newData,
        reason: options.reason,
        ip: options.ip,
        userAgent: options.userAgent
      }
    })
  }
}
