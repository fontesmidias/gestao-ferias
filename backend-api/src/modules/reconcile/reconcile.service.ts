import type { PrismaClient } from '@prisma/client'
import { WorkplaceAllocationService } from '../workplaces/workplace-allocation.service'
import { ReconcileQueueService } from './reconcile-queue.service'
import { DeterministicMatcher } from './matchers/deterministic-matcher'
import { FuzzyMatcher } from './matchers/fuzzy-matcher'
import { normalize } from './matchers/normalize'
import {
  FUZZY_LOW_CONFIDENCE_THRESHOLD,
  ReconcileAuditAction,
  type RunSingleOutcome,
} from './reconcile.types'

export class ReconcileEmployeeNotFoundError extends Error {
  readonly code = 'RECONCILE_EMPLOYEE_NOT_FOUND'
  constructor(employeeId: string) {
    super(`Employee ${employeeId} não encontrado no tenant.`)
    this.name = 'ReconcileEmployeeNotFoundError'
  }
}

export interface RunSingleInput {
  tenantId: string
  employeeId: string
  reconcileJobId: string
  operatorUserId: string
}

/**
 * Reconcilia 1 employee: aplica matchers, vincula automaticamente em match
 * determinístico único, ou enfileira via ReconcileQueueService quando ambíguo
 * ou sem match (FR9, FR10, FR11).
 *
 * Implementação per-employee facilita unit testing; orquestração de loop fica
 * em `ReconcileRunner.run`.
 *
 * @see _evo-output/planning-artifacts/v3-3-reconciliacao-postos/architecture.md#D5
 */
export class ReconcileService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly allocationService: WorkplaceAllocationService,
    private readonly queueService: ReconcileQueueService,
    private readonly deterministicMatcher: DeterministicMatcher,
    private readonly fuzzyMatcher: FuzzyMatcher,
  ) {}

  async runSingle(input: RunSingleInput): Promise<RunSingleOutcome> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, tenantId: input.tenantId },
      select: {
        id: true,
        workplace: true,
        workplaceId: true,
        hireDate: true,
        status: true,
        position: true,
      },
    })
    if (!employee) throw new ReconcileEmployeeNotFoundError(input.employeeId)

    if (employee.workplaceId) return { outcome: 'skipped' }
    if (employee.status === 'INATIVO') return { outcome: 'skipped_inactive' }

    const raw = (employee.workplace ?? '').trim()
    if (!raw) return { outcome: 'no_legacy' }

    const normalized = normalize(raw)
    const det = await this.deterministicMatcher.match(input.tenantId, normalized)

    if (det.kind === 'unique') {
      // V3.4 MVP M2: usar a Position do cargo do colaborador (ou criar) em vez
      // de empilhar todos numa Position default. Mantém o KPI alocados/necessários
      // significativo por cargo.
      const positionId = await this.ensurePositionByRole(
        input.tenantId,
        det.workplace.id,
        employee.position,
      )
      const result = await this.allocationService.upsertFromImport({
        tenantId: input.tenantId,
        employeeId: employee.id,
        operatorUserId: input.operatorUserId,
        workplacePositionId: positionId,
        startDate: employee.hireDate,
        source: ReconcileAuditAction.RECONCILE,
      })
      await this.prisma.employee.update({
        where: { id: employee.id },
        data: { workplaceId: det.workplace.id },
      })
      return {
        outcome: 'matched_deterministic',
        workplaceId: det.workplace.id,
        allocationKind: result.kind,
      }
    }

    const suggestions = await this.fuzzyMatcher.suggest(
      input.tenantId,
      normalized,
      3,
    )

    if (det.kind === 'ambiguous') {
      await this.queueService.enqueue({
        tenantId: input.tenantId,
        reconcileJobId: input.reconcileJobId,
        employeeId: employee.id,
        workplaceNameRaw: raw,
        suggestions,
      })
      return { outcome: 'queued_ambiguous' }
    }

    // det.kind === 'none'
    const top = suggestions[0]?.score ?? 0
    if (top >= FUZZY_LOW_CONFIDENCE_THRESHOLD) {
      await this.queueService.enqueue({
        tenantId: input.tenantId,
        reconcileJobId: input.reconcileJobId,
        employeeId: employee.id,
        workplaceNameRaw: raw,
        suggestions,
      })
      return { outcome: 'queued_low_confidence' }
    }

    await this.queueService.enqueue({
      tenantId: input.tenantId,
      reconcileJobId: input.reconcileJobId,
      employeeId: employee.id,
      workplaceNameRaw: raw,
      suggestions: [],
    })
    return { outcome: 'queued_no_match' }
  }

  private async ensurePositionByRole(
    tenantId: string,
    workplaceId: string,
    role: string | null | undefined,
  ): Promise<string> {
    const trimmedRole = role?.trim() || null
    if (trimmedRole) {
      const found = await this.prisma.workplacePosition.findFirst({
        where: { tenantId, workplaceId, role: { equals: trimmedRole, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
      })
      if (found) return found.id
      const created = await this.prisma.workplacePosition.create({
        data: { tenantId, workplaceId, role: trimmedRole, requiredCount: 1 },
      })
      return created.id
    }

    // Sem cargo definido: usa a primeira Position existente ou cria 'Operacional'.
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
}
