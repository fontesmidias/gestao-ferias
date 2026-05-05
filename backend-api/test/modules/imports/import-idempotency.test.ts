import test from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'

// encryption module exige env antes do import
process.env.BANK_DATA_ENCRYPTION_KEY ??= '5JtP44Gz4XwhPUi0NCxOOeqgdZtZ18FrQsXkuiXYvwg='

const applier = require('../../../src/modules/imports/import-applier') as typeof import('../../../src/modules/imports/import-applier')
import type { ApplyContext, ApplyItem, ApplyOptions } from '../../../src/modules/imports/import-applier'
import type { Employee, TirvuRow } from '../../../src/modules/imports/types'
import { importWorkplaces } from '../../../src/modules/workplaces/import-workplaces.service'
import type { RawWorkplace } from '../../../src/modules/employees/import-service'

const TENANT = randomUUID()
const JOB_ID = randomUUID()
const USER_ID = randomUUID()

// ──────────────────────────────────────────────────────────────────────
// Mock leve compartilhado para Tirvu (espelha import-applier.test.ts)
// ──────────────────────────────────────────────────────────────────────

interface WorkplaceRow {
  id: string
  tenantId: string
  name: string
  createdAt: Date
}
interface PositionRow {
  id: string
  tenantId: string
  workplaceId: string
  createdAt: Date
}
interface AllocationRow {
  id: string
  tenantId: string
  employeeId: string
  workplacePositionId: string
  status: string
}
interface EmployeeStateRow {
  id: string
  tenantId: string
  workplaceId: string | null
}

function makeTirvuMocks() {
  const workplaces: WorkplaceRow[] = []
  const positions: PositionRow[] = []
  const allocations: AllocationRow[] = []
  const employeeStates = new Map<string, EmployeeStateRow>()
  const calls = {
    workplaceCreates: 0,
    positionCreates: 0,
    allocationCreates: 0,
    allocationUpdates: 0,
    auditLogs: [] as Array<{ action: string }>,
  }

  const tx = {
    employee: {
      async create({ data }: { data: Record<string, unknown> }) {
        const id = randomUUID()
        employeeStates.set(id, {
          id,
          tenantId: data.tenantId as string,
          workplaceId: null,
        })
        return { id, ...data }
      },
      async update({
        where: { id },
        data,
      }: {
        where: { id: string }
        data: Record<string, unknown>
      }) {
        const cur = employeeStates.get(id)
        if (cur && 'workplaceId' in data) {
          cur.workplaceId = (data.workplaceId as string | null) ?? null
        }
        return { id, ...data }
      },
    },
    workplace: {
      async create({ data }: { data: Record<string, unknown> }) {
        const id = randomUUID()
        const row: WorkplaceRow = {
          id,
          tenantId: data.tenantId as string,
          name: data.name as string,
          createdAt: new Date(),
        }
        workplaces.push(row)
        calls.workplaceCreates++
        return { id, ...data }
      },
      async findMany({
        where,
      }: {
        where: { tenantId: string; name?: { equals: string; mode?: string } }
      }) {
        return workplaces.filter((w) => {
          if (where.tenantId && w.tenantId !== where.tenantId) return false
          if (where.name?.equals) {
            return w.name.toLowerCase() === where.name.equals.toLowerCase()
          }
          return true
        })
      },
    },
    workplacePosition: {
      async findFirst({
        where,
      }: {
        where: { tenantId: string; workplaceId: string }
      }) {
        return (
          positions.find(
            (p) => p.tenantId === where.tenantId && p.workplaceId === where.workplaceId,
          ) ?? null
        )
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const id = randomUUID()
        positions.push({
          id,
          tenantId: data.tenantId as string,
          workplaceId: data.workplaceId as string,
          createdAt: new Date(),
        })
        calls.positionCreates++
        return { id, ...data }
      },
    },
    workplaceAllocation: {
      async findFirst({
        where,
      }: {
        where: {
          tenantId: string
          employeeId: string
          status?: string
          workplacePositionId?: string
        }
      }) {
        return (
          allocations.find(
            (a) =>
              a.tenantId === where.tenantId &&
              a.employeeId === where.employeeId &&
              (!where.status || a.status === where.status) &&
              (!where.workplacePositionId ||
                a.workplacePositionId === where.workplacePositionId),
          ) ?? null
        )
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const id = randomUUID()
        allocations.push({
          id,
          tenantId: data.tenantId as string,
          employeeId: data.employeeId as string,
          workplacePositionId: data.workplacePositionId as string,
          status: (data.status as string) ?? 'ACTIVE',
        })
        calls.allocationCreates++
        return { id, ...data }
      },
      async update({
        where: { id },
        data,
      }: {
        where: { id: string }
        data: Record<string, unknown>
      }) {
        const idx = allocations.findIndex((a) => a.id === id)
        if (idx >= 0 && 'status' in data) {
          allocations[idx].status = data.status as string
        }
        calls.allocationUpdates++
        return { id, ...data }
      },
    },
    auditLog: {
      async create({ data }: { data: Record<string, unknown> }) {
        calls.auditLogs.push({ action: data.action as string })
        return { id: randomUUID(), ...data }
      },
    },
  }

  // Allocation service espelhado (mesma logica de Story 2.1 test).
  const allocationService = {
    async upsertFromImport(input: Record<string, unknown>) {
      const txAny = tx as never as {
        workplaceAllocation: {
          findFirst: (a: { where: { tenantId: string; employeeId: string; status?: string } }) => Promise<{ id: string; workplacePositionId: string } | null>
          create: (a: { data: Record<string, unknown> }) => Promise<{ id: string }>
          update: (a: { where: { id: string }; data: Record<string, unknown> }) => Promise<{ id: string }>
        }
        auditLog: { create: (a: { data: Record<string, unknown> }) => Promise<unknown> }
      }
      const existing = await txAny.workplaceAllocation.findFirst({
        where: {
          tenantId: input.tenantId as string,
          employeeId: input.employeeId as string,
          status: 'ACTIVE',
        },
      })
      if (existing && existing.workplacePositionId === input.workplacePositionId) {
        return { kind: 'noop' as const, allocationId: existing.id }
      }
      if (existing && existing.workplacePositionId !== input.workplacePositionId) {
        await txAny.workplaceAllocation.update({
          where: { id: existing.id },
          data: { status: 'ENDED', endDate: new Date() },
        })
        const created = await txAny.workplaceAllocation.create({
          data: {
            tenantId: input.tenantId,
            employeeId: input.employeeId,
            workplacePositionId: input.workplacePositionId,
            startDate: input.startDate,
            status: 'ACTIVE',
          },
        })
        await txAny.auditLog.create({
          data: {
            tenantId: input.tenantId,
            userId: input.operatorUserId,
            action: input.source,
            resourceType: 'WORKPLACE_ALLOCATION',
            resourceId: created.id,
          },
        })
        return { kind: 'replaced' as const, allocationId: created.id, previousAllocationId: existing.id }
      }
      const created = await txAny.workplaceAllocation.create({
        data: {
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          workplacePositionId: input.workplacePositionId,
          startDate: input.startDate,
          status: 'ACTIVE',
        },
      })
      await txAny.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.operatorUserId,
          action: input.source,
          resourceType: 'WORKPLACE_ALLOCATION',
          resourceId: created.id,
        },
      })
      return { kind: 'created' as const, allocationId: created.id }
    },
  }

  return { tx: tx as never, allocationService: allocationService as never, state: { workplaces, positions, allocations, employeeStates, calls } }
}

function ctx(allocationService: unknown): ApplyContext {
  return {
    tenantId: TENANT,
    jobId: JOB_ID,
    userId: USER_ID,
    options: { createWorkplaces: [], markAbsentAsPending: false, reactivateAll: false } as ApplyOptions,
    allocationService: allocationService as never,
  }
}

function makeRow(o: Partial<TirvuRow> = {}): TirvuRow {
  return {
    rowIndex: 1,
    rawRowIndex: 1,
    tirvuId: '1001',
    cpf: '03670788131',
    name: 'Fulano',
    matricula: null,
    sexo: null,
    nascimento: null,
    email: null,
    telefone: null,
    pcd: null,
    deficiencia: null,
    nomePai: null,
    nomeMae: null,
    rgNumero: null,
    rgOrgao: null,
    rgDataEmissao: null,
    pisPasep: null,
    ctpsNumero: null,
    ctpsSerie: null,
    status: 'ATIVO',
    empresa: 'GH',
    lotacao: 'INEP',
    admissao: new Date(Date.UTC(2024, 0, 15)),
    demissao: null,
    cargo: 'Aux',
    jornada: '12x36',
    inicioJornada: null,
    sindicato: null,
    foraDaCerca: null,
    semGeo: null,
    cep: null,
    endereco: null,
    enderecoNumero: null,
    enderecoComplemento: null,
    enderecoBairro: null,
    enderecoUf: null,
    enderecoCidade: null,
    salario: 1500,
    salarioComplemento: null,
    salarioExtra: null,
    tipoPix: null,
    chavePix: null,
    banco: null,
    tipoConta: null,
    agencia: null,
    conta: null,
    dataLog: null,
    ...o,
  }
}

function makeEmp(o: Partial<Employee> = {}): Employee {
  const now = new Date()
  return {
    id: 'emp-1',
    name: 'Fulano',
    cpf: '03670788131',
    registration: null,
    birthDate: null,
    position: 'Aux',
    employeeType: 'EFETIVO',
    isFerista: false,
    status: 'ATIVO',
    branch: 'GH',
    department: null,
    workplace: null,
    workplaceId: null,
    shift: '12x36',
    phone: null,
    salary: 1500 as unknown as Employee['salary'],
    hireDate: new Date(Date.UTC(2024, 0, 15)),
    balanceOffset: 0,
    userId: null,
    tenantId: TENANT,
    tirvuId: '1001',
    personalData: null,
    address: null,
    bankDataEnc: null,
    bankDataIv: null,
    bankDataTag: null,
    unionName: null,
    geofencingFlags: null,
    inactivePending: false,
    terminationDate: null,
    createdAt: now,
    updatedAt: now,
    ...o,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Story 2.4: Tirvu multi-employee + transição idempotentes
// ──────────────────────────────────────────────────────────────────────

test('Story 2.4 — Tirvu multi-employee re-run sem deltas no 2 apply', async () => {
  const { tx, allocationService, state } = makeTirvuMocks()

  // 1º apply: 5 creates com lotações A,A,B,B,C (3 distintas)
  const lots = ['A', 'A', 'B', 'B', 'C']
  for (let i = 0; i < lots.length; i++) {
    const item: ApplyItem = {
      kind: 'create',
      row: makeRow({ rowIndex: i + 1, lotacao: lots[i], cpf: `1111111111${i}`, tirvuId: `T${i}` }),
      patch: {
        name: `Emp${i}`,
        hireDate: new Date(Date.UTC(2024, 0, 15)),
        workplace: lots[i],
      } as never,
    }
    await applier.applyItem(tx, item, ctx(allocationService))
  }

  assert.strictEqual(state.calls.workplaceCreates, 3, '3 workplaces distintos criados')
  assert.strictEqual(state.calls.positionCreates, 3, '3 positions padrão (Operacional)')
  assert.strictEqual(state.calls.allocationCreates, 5, '5 allocations criadas')

  const allocCreatesAfter1 = state.calls.allocationCreates
  const wpCreatesAfter1 = state.calls.workplaceCreates
  const auditCountAfter1 = state.calls.auditLogs.filter(
    (a) => a.action === 'IMPORT_TIRVU_ALLOCATE',
  ).length
  assert.strictEqual(auditCountAfter1, 5, '5 audits IMPORT_TIRVU_ALLOCATE no 1º apply')

  // 2º apply: mesmas rows mas como kind='update' com employee já tendo workplaceId.
  // Para simular o estado pós-1º apply, montamos employee com workplaceId set ao posto.
  const wpByName = new Map<string, string>()
  for (const wp of state.workplaces) wpByName.set(wp.name, wp.id)

  for (let i = 0; i < lots.length; i++) {
    const lotName = lots[i]
    const employeeWithFk = makeEmp({
      id: `emp-${i}`,
      cpf: `1111111111${i}`,
      tirvuId: `T${i}`,
      workplace: lotName,
      workplaceId: wpByName.get(lotName)!,
    })
    const item: ApplyItem = {
      kind: 'update',
      row: makeRow({ rowIndex: i + 1, lotacao: lotName, cpf: `1111111111${i}`, tirvuId: `T${i}` }),
      employee: employeeWithFk,
      patch: { workplace: lotName } as never,
      diff: {}, // sem mudanças
    }
    await applier.applyItem(tx, item, ctx(allocationService))
  }

  assert.strictEqual(
    state.calls.allocationCreates,
    allocCreatesAfter1,
    '2º apply: 0 novas allocations',
  )
  assert.strictEqual(
    state.calls.workplaceCreates,
    wpCreatesAfter1,
    '2º apply: 0 novos workplaces',
  )
  const auditCountAfter2 = state.calls.auditLogs.filter(
    (a) => a.action === 'IMPORT_TIRVU_ALLOCATE',
  ).length
  assert.strictEqual(auditCountAfter2, auditCountAfter1, 'noop NÃO emite audit')
})

test('Story 2.4 — Tirvu transição A→B idempotente em 2 passos', async () => {
  const { tx, allocationService, state } = makeTirvuMocks()

  // Setup: workplace A, position A, employee com allocation ACTIVE em A
  const wpA = await tx.workplace.create({
    data: { tenantId: TENANT, name: 'A' },
  })
  const posA = await tx.workplacePosition.create({
    data: { tenantId: TENANT, workplaceId: wpA.id },
  })
  const emp1 = await tx.employee.create({
    data: { tenantId: TENANT, cpf: '03670788131' },
  })
  await tx.workplaceAllocation.create({
    data: {
      tenantId: TENANT,
      employeeId: emp1.id,
      workplacePositionId: posA.id,
      status: 'ACTIVE',
      startDate: new Date(),
    },
  })
  // Atualiza employee.workplaceId no mock (simula state após import inicial).
  await tx.employee.update({
    where: { id: emp1.id },
    data: { workplaceId: wpA.id },
  })

  // Reset counters de setup (não contam para o teste)
  state.calls.workplaceCreates = 0
  state.calls.positionCreates = 0
  state.calls.allocationCreates = 0
  state.calls.allocationUpdates = 0
  state.calls.auditLogs.length = 0

  // 1º apply: update transição A→B
  const item1: ApplyItem = {
    kind: 'update',
    row: makeRow({ lotacao: 'B' }),
    employee: makeEmp({
      id: emp1.id,
      cpf: '03670788131',
      workplace: 'A',
      workplaceId: wpA.id,
    }),
    patch: { workplace: 'B' } as never,
    diff: { workplace: { from: 'A', to: 'B' } },
  }
  await applier.applyItem(tx, item1, ctx(allocationService))

  assert.strictEqual(state.calls.workplaceCreates, 1, 'workplace B criado')
  assert.strictEqual(state.calls.allocationCreates, 1, 'allocation B criada')
  assert.strictEqual(state.calls.allocationUpdates, 1, 'allocation A encerrada')
  const audits1 = state.calls.auditLogs.filter(
    (a) => a.action === 'IMPORT_TIRVU_ALLOCATE',
  ).length
  assert.strictEqual(audits1, 1)

  // 2º apply: mesma planilha (employee agora em workplaceId=B, allocation B ACTIVE).
  // No mundo real, a mesma planilha geraria diff vazio em 2ª passagem (ou não estaria em update).
  // Simulamos um update sem diff de workplace (idempotência total).
  const wpBId = state.workplaces.find((w) => w.name === 'B')!.id
  const item2: ApplyItem = {
    kind: 'update',
    row: makeRow({ lotacao: 'B' }),
    employee: makeEmp({
      id: emp1.id,
      cpf: '03670788131',
      workplace: 'B',
      workplaceId: wpBId,
    }),
    patch: { workplace: 'B' } as never,
    diff: {}, // sem mudança
  }
  await applier.applyItem(tx, item2, ctx(allocationService))

  // Sem novos creates ou updates de allocation
  assert.strictEqual(state.calls.allocationCreates, 1, '2º apply: nenhuma nova allocation')
  assert.strictEqual(state.calls.allocationUpdates, 1, '2º apply: nenhum update de allocation')
  assert.strictEqual(state.calls.workplaceCreates, 1, 'workplace B segue só uma vez')
  const audits2 = state.calls.auditLogs.filter(
    (a) => a.action === 'IMPORT_TIRVU_ALLOCATE',
  ).length
  assert.strictEqual(audits2, audits1, 'audit count inalterado no 2º')
})

// ──────────────────────────────────────────────────────────────────────
// Story 2.4: Postos idempotência reforçada
// ──────────────────────────────────────────────────────────────────────

interface PostosWorkplace {
  id: string
  tenantId: string
  name: string
  externalId: string | null
}
interface PostosPosition {
  id: string
  tenantId: string
  workplaceId: string
  role: string
  shiftPattern: string | null
  requiredCount: number
}

function makePostosPrisma() {
  const workplaces: PostosWorkplace[] = []
  const positions: PostosPosition[] = []
  const prisma = {
    workplace: {
      async findFirst({
        where,
      }: {
        where: { tenantId: string; externalId?: string | null; name?: string }
      }) {
        return (
          workplaces.find(
            (w) =>
              w.tenantId === where.tenantId &&
              (where.externalId === undefined || w.externalId === where.externalId) &&
              (where.name === undefined || w.name === where.name),
          ) ?? null
        )
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row: PostosWorkplace = {
          id: randomUUID(),
          tenantId: data.tenantId as string,
          name: data.name as string,
          externalId: (data.externalId as string | null) ?? null,
        }
        workplaces.push(row)
        return row
      },
      async update({ where }: { where: { id: string } }) {
        return workplaces.find((w) => w.id === where.id)!
      },
    },
    workplacePosition: {
      async findFirst({
        where,
      }: {
        where: {
          workplaceId: string
          role?: string
          shiftPattern?: string | null
        }
      }) {
        return (
          positions.find(
            (p) =>
              p.workplaceId === where.workplaceId &&
              (where.role === undefined || p.role === where.role) &&
              (where.shiftPattern === undefined ||
                p.shiftPattern === where.shiftPattern),
          ) ?? null
        )
      },
      async count({ where }: { where: { tenantId: string; workplaceId: string } }) {
        return positions.filter(
          (p) => p.tenantId === where.tenantId && p.workplaceId === where.workplaceId,
        ).length
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row: PostosPosition = {
          id: randomUUID(),
          tenantId: data.tenantId as string,
          workplaceId: data.workplaceId as string,
          role: data.role as string,
          shiftPattern: (data.shiftPattern as string | null) ?? null,
          requiredCount: (data.requiredCount as number) ?? 1,
        }
        positions.push(row)
        return row
      },
    },
  }
  return { prisma: prisma as never, state: { workplaces, positions } }
}

test('Story 2.4 — Postos: 2 apply consecutivos sem deltas', async () => {
  const { prisma, state } = makePostosPrisma()
  const rawData: RawWorkplace[] = [
    { name: 'Posto X', positionRole: 'Vigia' },
    { name: 'Posto Y' }, // sem cargo → default
    { name: 'Posto Z' }, // sem cargo → default
  ]
  const r1 = await importWorkplaces({ prisma, tenantId: TENANT, rawData })
  assert.strictEqual(r1.created, 3)
  assert.strictEqual(r1.positions, 1)
  assert.strictEqual(r1.defaultsCreated, 2)
  const wpsAfter1 = state.workplaces.length
  const posAfter1 = state.positions.length

  const r2 = await importWorkplaces({ prisma, tenantId: TENANT, rawData })
  assert.strictEqual(r2.created, 0, 'nenhum novo workplace')
  assert.strictEqual(r2.updated, 3, '3 updates idempotentes')
  assert.strictEqual(r2.positions, 0, 'nenhuma nova position explicit')
  assert.strictEqual(r2.defaultsCreated, 0, 'nenhum default novo (já tinham)')
  assert.strictEqual(state.workplaces.length, wpsAfter1)
  assert.strictEqual(state.positions.length, posAfter1)
})
