import { Prisma, type PrismaClient, type WorkplaceReconcileQueue } from '@prisma/client'
import { AuditService } from '../shared/audit-service'
import { WorkplaceAllocationService } from '../workplaces/workplace-allocation.service'

/**
 * Erros tipados para mapeamento limpo a códigos HTTP nas rotas.
 */
export class ReconcileQueueInvalidStateError extends Error {
  readonly code = 'RECONCILE_QUEUE_ITEM_INVALID_STATE'
  constructor(currentState: string) {
    super(`Item já foi resolvido (estado: ${currentState}). Operação não permitida.`)
    this.name = 'ReconcileQueueInvalidStateError'
  }
}

export class ReconcileQueueNotFoundError extends Error {
  readonly code = 'RECONCILE_QUEUE_ITEM_NOT_FOUND'
  constructor() {
    super('Item da fila não encontrado.')
    this.name = 'ReconcileQueueNotFoundError'
  }
}

export type ResolveAction = 'link' | 'create' | 'defer' | 'ignore'

export interface EnqueueInput {
  tenantId: string
  reconcileJobId: string
  employeeId: string
  workplaceNameRaw: string
  suggestions?: unknown // JSON serializável: [{ id, name, score }]
}

export interface ListInput {
  tenantId: string
  state?: 'PENDING' | 'DEFERRED' | 'RESOLVED' | 'IGNORED'
  jobId?: string
  page?: number
  pageSize?: number
}

export interface ResolveInput {
  id: string
  tenantId: string
  operatorUserId: string
  action: ResolveAction
  workplaceId?: string
  workplaceName?: string
  workplacePositionRole?: string
}

/**
 * CRUD da WorkplaceReconcileQueue + ações de resolução.
 *
 * Atende FR13–FR19 do PRD V3.3:
 * - enqueue: cria item PENDING ou atualiza existente (idempotente)
 * - list: paginado com filtros, multi-tenant strict
 * - resolve: 4 actions (link/create/defer/ignore) com auditoria
 *
 * link e create chamam WorkplaceAllocationService (Enforcement #1).
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D1
 */
export class ReconcileQueueService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly allocationService: WorkplaceAllocationService,
  ) {}

  async enqueue(input: EnqueueInput): Promise<WorkplaceReconcileQueue> {
    const existing = await this.prisma.workplaceReconcileQueue.findFirst({
      where: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        state: { in: ['PENDING', 'DEFERRED'] },
      },
    })

    if (existing) {
      return this.prisma.workplaceReconcileQueue.update({
        where: { id: existing.id },
        data: {
          workplaceNameRaw: input.workplaceNameRaw,
          suggestions:
            (input.suggestions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          reconcileJobId: input.reconcileJobId,
        },
      })
    }

    return this.prisma.workplaceReconcileQueue.create({
      data: {
        tenantId: input.tenantId,
        reconcileJobId: input.reconcileJobId,
        employeeId: input.employeeId,
        workplaceNameRaw: input.workplaceNameRaw,
        suggestions:
          (input.suggestions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        state: 'PENDING',
      },
    })
  }

  async list(input: ListInput): Promise<{
    items: Array<WorkplaceReconcileQueue & { employee: { id: string; name: string } }>
    total: number
    page: number
    pageSize: number
  }> {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20

    const where: Prisma.WorkplaceReconcileQueueWhereInput = {
      tenantId: input.tenantId,
      ...(input.state ? { state: input.state } : {}),
      ...(input.jobId ? { reconcileJobId: input.jobId } : {}),
    }

    const [items, total] = await Promise.all([
      this.prisma.workplaceReconcileQueue.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { employee: { select: { id: true, name: true } } },
      }),
      this.prisma.workplaceReconcileQueue.count({ where }),
    ])

    return { items, total, page, pageSize }
  }

  async resolve(input: ResolveInput): Promise<WorkplaceReconcileQueue> {
    const item = await this.prisma.workplaceReconcileQueue.findFirst({
      where: { id: input.id, tenantId: input.tenantId },
    })
    if (!item) throw new ReconcileQueueNotFoundError()
    if (item.state !== 'PENDING' && item.state !== 'DEFERRED') {
      throw new ReconcileQueueInvalidStateError(item.state)
    }

    const now = new Date()

    switch (input.action) {
      case 'link':
        return this.applyLink(item, input, now)
      case 'create':
        return this.applyCreate(item, input, now)
      case 'defer':
        return this.applyStateTransition(
          item,
          input,
          'DEFERRED',
          'RECONCILE_QUEUE_DEFER',
          null,
        )
      case 'ignore':
        return this.applyStateTransition(
          item,
          input,
          'IGNORED',
          'RECONCILE_QUEUE_IGNORE',
          now,
        )
      default:
        throw new Error(`Unknown action: ${input.action as string}`)
    }
  }

  // ─── Helpers privados ──────────────────────────────────────────────

  private async applyLink(
    item: WorkplaceReconcileQueue,
    input: ResolveInput,
    now: Date,
  ): Promise<WorkplaceReconcileQueue> {
    if (!input.workplaceId) {
      throw new Error('workplaceId é obrigatório para action=link')
    }

    const positionId = await this.ensureDefaultPosition(
      input.tenantId,
      input.workplaceId,
    )
    const employee = await this.requireEmployee(input.tenantId, item.employeeId)

    await this.allocationService.upsertFromImport({
      tenantId: input.tenantId,
      employeeId: item.employeeId,
      operatorUserId: input.operatorUserId,
      workplacePositionId: positionId,
      startDate: employee.hireDate,
      source: 'RECONCILE_QUEUE_RESOLVE',
    })

    const updated = await this.prisma.workplaceReconcileQueue.update({
      where: { id: item.id },
      data: {
        state: 'RESOLVED',
        resolvedToWorkplaceId: input.workplaceId,
        resolvedByUserId: input.operatorUserId,
        resolvedAt: now,
      },
    })

    await AuditService.log(this.prisma, {
      tenantId: input.tenantId,
      userId: input.operatorUserId,
      action: 'RECONCILE_QUEUE_RESOLVE',
      resourceId: item.id,
      resourceType: 'WORKPLACE_RECONCILE_QUEUE',
      previousData: item as unknown as object,
      newData: updated as unknown as object,
    })

    return updated
  }

  private async applyCreate(
    item: WorkplaceReconcileQueue,
    input: ResolveInput,
    now: Date,
  ): Promise<WorkplaceReconcileQueue> {
    if (!input.workplaceName) {
      throw new Error('workplaceName é obrigatório para action=create')
    }

    const workplace = await this.prisma.workplace.create({
      data: {
        tenantId: input.tenantId,
        name: input.workplaceName,
        importedBy: 'AUTO_USER_RESOLVE',
        importedAt: now,
      },
    })

    const position = await this.prisma.workplacePosition.create({
      data: {
        tenantId: input.tenantId,
        workplaceId: workplace.id,
        role: input.workplacePositionRole ?? 'Operacional',
        requiredCount: 1,
      },
    })

    const employee = await this.requireEmployee(input.tenantId, item.employeeId)

    await this.allocationService.upsertFromImport({
      tenantId: input.tenantId,
      employeeId: item.employeeId,
      operatorUserId: input.operatorUserId,
      workplacePositionId: position.id,
      startDate: employee.hireDate,
      source: 'RECONCILE_QUEUE_RESOLVE',
    })

    const updated = await this.prisma.workplaceReconcileQueue.update({
      where: { id: item.id },
      data: {
        state: 'RESOLVED',
        resolvedToWorkplaceId: workplace.id,
        resolvedByUserId: input.operatorUserId,
        resolvedAt: now,
      },
    })

    await AuditService.log(this.prisma, {
      tenantId: input.tenantId,
      userId: input.operatorUserId,
      action: 'RECONCILE_QUEUE_RESOLVE',
      resourceId: item.id,
      resourceType: 'WORKPLACE_RECONCILE_QUEUE',
      previousData: item as unknown as object,
      newData: {
        ...updated,
        createdWorkplaceId: workplace.id,
      } as unknown as object,
    })

    return updated
  }

  private async applyStateTransition(
    item: WorkplaceReconcileQueue,
    input: ResolveInput,
    newState: 'DEFERRED' | 'IGNORED',
    auditAction: string,
    resolvedAt: Date | null,
  ): Promise<WorkplaceReconcileQueue> {
    const updated = await this.prisma.workplaceReconcileQueue.update({
      where: { id: item.id },
      data: {
        state: newState,
        resolvedByUserId: resolvedAt ? input.operatorUserId : null,
        resolvedAt,
      },
    })

    await AuditService.log(this.prisma, {
      tenantId: input.tenantId,
      userId: input.operatorUserId,
      action: auditAction,
      resourceId: item.id,
      resourceType: 'WORKPLACE_RECONCILE_QUEUE',
      previousData: item as unknown as object,
      newData: updated as unknown as object,
    })

    return updated
  }

  private async ensureDefaultPosition(
    tenantId: string,
    workplaceId: string,
  ): Promise<string> {
    const existing = await this.prisma.workplacePosition.findFirst({
      where: { tenantId, workplaceId },
      orderBy: { createdAt: 'asc' },
    })
    if (existing) return existing.id

    const created = await this.prisma.workplacePosition.create({
      data: {
        tenantId,
        workplaceId,
        role: 'Operacional',
        requiredCount: 1,
      },
    })
    return created.id
  }

  private async requireEmployee(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, hireDate: true },
    })
    if (!employee) {
      throw new Error(`Employee ${employeeId} não encontrado no tenant ${tenantId}`)
    }
    return employee
  }
}
