import type { PrismaClient } from '@prisma/client'

/**
 * V3.4 MVP M3: Re-materialização de WorkplacePositions por cargo real.
 *
 * Contexto: Reconcile V3.3 e importer Tirvu antigo criavam apenas 1
 * WorkplacePosition default ('Operacional') por Workplace, empilhando
 * colaboradores de cargos distintos numa única Position. Isso descaracteriza
 * o KPI alocados/necessários (5/1 quando deveria ser Recepcionista 2/2 +
 * Servente 1/1 + Aux. Limpeza 1/1 + Aux. Serviços 1/1).
 *
 * Este serviço corrige tenants legados percorrendo Workplaces com
 * Allocations ACTIVE de cargos múltiplos numa mesma Position e movendo as
 * Allocations para Positions específicas por cargo (criando-as quando
 * necessário). Idempotente: chamadas adicionais são no-op.
 *
 * Princípio operacional: o colaborador NÃO mudou de posto/cargo. Estamos
 * apenas refletindo corretamente a estrutura. AuditLog 'POSITION_REMATERIALIZE'
 * preserva a trilha. Diferente de mudança real de cargo (que exige
 * encerrar+criar conforme CLT), esta é correção de modelagem.
 */

export interface RematerializationStats {
  workplacesScanned: number
  positionsCreated: number
  allocationsMoved: number
  workplacesAlreadyOk: number
  durationMs: number
}

export async function rematerializePositionsByRole(
  prisma: PrismaClient,
  tenantId: string,
  operatorUserId: string,
): Promise<RematerializationStats> {
  const start = Date.now()
  const stats: RematerializationStats = {
    workplacesScanned: 0,
    positionsCreated: 0,
    allocationsMoved: 0,
    workplacesAlreadyOk: 0,
    durationMs: 0,
  }

  const workplaces = await prisma.workplace.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  })

  for (const wp of workplaces) {
    stats.workplacesScanned++

    const allocations = await prisma.workplaceAllocation.findMany({
      where: { tenantId, workplacePosition: { workplaceId: wp.id }, status: 'ACTIVE' },
      include: {
        employee: { select: { position: true } },
      },
    })

    if (allocations.length === 0) {
      stats.workplacesAlreadyOk++
      continue
    }

    // Agrupa por (currentPositionId, employee.position) para detectar empilhamento.
    type AllocItem = (typeof allocations)[number]
    const byCurrentPosition = new Map<string, AllocItem[]>()
    for (const a of allocations) {
      const list = byCurrentPosition.get(a.workplacePositionId) ?? []
      list.push(a)
      byCurrentPosition.set(a.workplacePositionId, list)
    }

    let workplaceTouched = false

    for (const [currentPositionId, items] of byCurrentPosition) {
      // Cargos distintos vinculados à mesma Position.
      const rolesInThisPosition = new Set(
        items
          .map((a) => (a.employee.position ?? '').trim())
          .filter((r) => r.length > 0),
      )
      if (rolesInThisPosition.size <= 1) continue // já correto

      const currentPosition = await prisma.workplacePosition.findUnique({
        where: { id: currentPositionId },
        select: { role: true },
      })
      const currentRole = (currentPosition?.role ?? '').trim().toLowerCase()

      // Para cada cargo distinto, cria/encontra a Position certa e move allocations.
      const rolesArr = Array.from(rolesInThisPosition)
      for (const role of rolesArr) {
        if (role.toLowerCase() === currentRole) {
          // Esse cargo bate com a Position atual — não precisa mover.
          continue
        }

        let target = await prisma.workplacePosition.findFirst({
          where: {
            tenantId,
            workplaceId: wp.id,
            role: { equals: role, mode: 'insensitive' },
          },
        })
        if (!target) {
          target = await prisma.workplacePosition.create({
            data: {
              tenantId,
              workplaceId: wp.id,
              role,
              requiredCount: 1,
            },
          })
          stats.positionsCreated++
        }

        const allocsToMove = items.filter(
          (a) => (a.employee.position ?? '').trim().toLowerCase() === role.toLowerCase(),
        )

        if (allocsToMove.length === 0) continue

        await prisma.$transaction(async (tx) => {
          for (const alloc of allocsToMove) {
            await tx.workplaceAllocation.update({
              where: { id: alloc.id },
              data: { workplacePositionId: target!.id },
            })
            await tx.auditLog.create({
              data: {
                tenantId,
                userId: operatorUserId,
                action: 'POSITION_REMATERIALIZE',
                resourceType: 'WORKPLACE_ALLOCATION',
                resourceId: alloc.id,
                previousData: {
                  workplacePositionId: currentPositionId,
                } as never,
                newData: {
                  workplacePositionId: target!.id,
                  role,
                } as never,
              },
            })
          }
        })
        stats.allocationsMoved += allocsToMove.length
        workplaceTouched = true
      }

      // Atualiza requiredCount da Position atual (que ficou só com o role original).
      const remaining = items.filter(
        (a) => (a.employee.position ?? '').trim().toLowerCase() === currentRole,
      )
      if (remaining.length > 0) {
        const wpPos = await prisma.workplacePosition.findUnique({
          where: { id: currentPositionId },
          select: { requiredCount: true },
        })
        if (wpPos && wpPos.requiredCount < remaining.length) {
          await prisma.workplacePosition.update({
            where: { id: currentPositionId },
            data: { requiredCount: remaining.length },
          })
        }
      }
    }

    if (!workplaceTouched) stats.workplacesAlreadyOk++
  }

  stats.durationMs = Date.now() - start
  return stats
}
