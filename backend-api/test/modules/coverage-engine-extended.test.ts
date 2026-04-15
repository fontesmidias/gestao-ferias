import test from 'node:test'
import assert from 'node:assert'
import { CoverageEngine } from '../../src/modules/coverage-engine/coverage-engine'

/**
 * Helper to create a mock PrismaClient with chainable query methods.
 */
function createMockPrisma(overrides: Record<string, any> = {}) {
  return {
    vacationRequest: {
      findFirst: overrides.vacationRequestFindFirst || (async () => null),
    },
    employee: {
      findMany: overrides.employeeFindMany || (async () => []),
    },
    workplacePosition: {
      findMany: overrides.workplacePositionFindMany || (async () => []),
    },
    coverageAssignment: {
      findMany: overrides.coverageAssignmentFindMany || (async () => []),
    },
  } as any
}

test('CoverageEngine.getOptions - extended', async (t) => {
  await t.test('Should return null when vacation request is not found', async () => {
    const prisma = createMockPrisma()
    const result = await CoverageEngine.getOptions('non-existent-id', 'tenant-1', prisma)

    assert.strictEqual(result, null)
  })

  await t.test('Should return feristas and intermitentes arrays', async () => {
    const mockVacation = {
      id: 'vac-1',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-05-15'),
      days: 15,
      employee: {
        name: 'João Silva',
        allocations: [
          {
            status: 'ACTIVE',
            workplacePosition: {
              id: 'pos-1',
              role: 'Vigilante',
              workplace: { name: 'Posto Central' },
            },
          },
        ],
      },
    }

    let findManyCallCount = 0
    const prisma = createMockPrisma({
      vacationRequestFindFirst: async () => mockVacation,
      employeeFindMany: async () => {
        findManyCallCount++
        if (findManyCallCount === 1) {
          // feristas
          return [
            { id: 'emp-f1', name: 'Carlos Ferista', salary: 2000, employeeType: 'EFETIVO' },
          ]
        }
        // intermitentes
        return [
          { id: 'emp-i1', name: 'Ana Intermitente', salary: 1500, employeeType: 'INTERMITENTE' },
        ]
      },
    })

    const result = await CoverageEngine.getOptions('vac-1', 'tenant-1', prisma)

    assert.ok(result !== null)
    assert.ok(Array.isArray(result!.feristas))
    assert.ok(Array.isArray(result!.intermitentes))
    assert.strictEqual(result!.feristas.length, 1)
    assert.strictEqual(result!.intermitentes.length, 1)
    assert.strictEqual(result!.feristas[0].name, 'Carlos Ferista')
    assert.strictEqual(result!.intermitentes[0].name, 'Ana Intermitente')
  })

  await t.test('Should include vacation request metadata in result', async () => {
    const mockVacation = {
      id: 'vac-2',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-20'),
      days: 20,
      employee: {
        name: 'Maria Santos',
        allocations: [],
      },
    }

    const prisma = createMockPrisma({
      vacationRequestFindFirst: async () => mockVacation,
      employeeFindMany: async () => [],
    })

    const result = await CoverageEngine.getOptions('vac-2', 'tenant-1', prisma)

    assert.ok(result !== null)
    assert.strictEqual(result!.vacationRequest.id, 'vac-2')
    assert.strictEqual(result!.vacationRequest.employeeName, 'Maria Santos')
    assert.strictEqual(result!.vacationRequest.days, 20)
    assert.strictEqual(result!.vacationRequest.position, null)
  })

  await t.test('Should include estimated cost for employees with salary', async () => {
    const mockVacation = {
      id: 'vac-3',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-10'),
      days: 10,
      employee: {
        name: 'Pedro Oliveira',
        allocations: [],
      },
    }

    const prisma = createMockPrisma({
      vacationRequestFindFirst: async () => mockVacation,
      employeeFindMany: async () => [
        { id: 'emp-1', name: 'Substituto A', salary: 3000, employeeType: 'EFETIVO' },
      ],
    })

    const result = await CoverageEngine.getOptions('vac-3', 'tenant-1', prisma)

    assert.ok(result !== null)
    assert.ok(result!.feristas.length > 0 || result!.intermitentes.length > 0)
    const allCandidates = [...result!.feristas, ...result!.intermitentes]
    assert.ok(allCandidates[0].estimatedCost !== undefined)
  })
})

test('CoverageEngine.getTimeline - extended', async (t) => {
  await t.test('Should return coverage entries for positions', async () => {
    const mockPositions = [
      {
        id: 'pos-1',
        role: 'Vigilante',
        requiredCount: 3,
        allocations: [
          { employee: { id: 'emp-1', name: 'João Silva' } },
          { employee: { id: 'emp-2', name: 'Maria Santos' } },
        ],
        coverages: [
          {
            id: 'cov-1',
            replacementEmployee: { id: 'emp-f1', name: 'Carlos Ferista', employeeType: 'EFETIVO' },
            vacationRequest: { id: 'vac-1', employee: { name: 'João Silva' } },
            startDate: new Date('2026-05-01'),
            endDate: new Date('2026-05-15'),
            type: 'FERISTA',
            status: 'PLANNED',
          },
        ],
      },
    ]

    const prisma = createMockPrisma({
      workplacePositionFindMany: async () => mockPositions,
    })

    const result = await CoverageEngine.getTimeline(
      'wp-1',
      new Date('2026-05-01'),
      new Date('2026-05-31'),
      'tenant-1',
      prisma
    )

    assert.ok(Array.isArray(result))
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].positionId, 'pos-1')
    assert.strictEqual(result[0].role, 'Vigilante')
    assert.strictEqual(result[0].requiredCount, 3)
    assert.strictEqual(result[0].currentStaff.length, 2)
    assert.strictEqual(result[0].coverages.length, 1)
    assert.strictEqual(result[0].coverages[0].replacing, 'João Silva')
    assert.strictEqual(result[0].coverages[0].status, 'PLANNED')
  })

  await t.test('Should return empty array when no positions exist', async () => {
    const prisma = createMockPrisma({
      workplacePositionFindMany: async () => [],
    })

    const result = await CoverageEngine.getTimeline(
      'wp-1',
      new Date('2026-05-01'),
      new Date('2026-05-31'),
      'tenant-1',
      prisma
    )

    assert.ok(Array.isArray(result))
    assert.strictEqual(result.length, 0)
  })
})

test('CoverageEngine.detectChaining - extended', async (t) => {
  await t.test('Should return available gaps between assignments', async () => {
    const mockCoverages = [
      {
        id: 'cov-1',
        startDate: new Date('2026-05-01'),
        endDate: new Date('2026-05-10'),
        workplacePosition: { role: 'Vigilante', workplace: { name: 'Posto Central' } },
      },
      {
        id: 'cov-2',
        startDate: new Date('2026-05-20'),
        endDate: new Date('2026-05-30'),
        workplacePosition: { role: 'Porteiro', workplace: { name: 'Posto Norte' } },
      },
    ]

    const prisma = createMockPrisma({
      coverageAssignmentFindMany: async () => mockCoverages,
    })

    const result = await CoverageEngine.detectChaining('ferista-1', 'tenant-1', prisma)

    assert.strictEqual(result.feristaId, 'ferista-1')
    assert.strictEqual(result.totalCoverages, 2)
    assert.strictEqual(result.canChain, true)
    assert.strictEqual(result.availableGaps.length, 1)
    assert.deepStrictEqual(result.availableGaps[0].from, new Date('2026-05-10'))
    assert.deepStrictEqual(result.availableGaps[0].to, new Date('2026-05-20'))
  })

  await t.test('Should return no gaps when coverages are contiguous', async () => {
    const mockCoverages = [
      {
        id: 'cov-1',
        startDate: new Date('2026-05-01'),
        endDate: new Date('2026-05-15'),
        workplacePosition: { role: 'Vigilante', workplace: { name: 'Posto A' } },
      },
      {
        id: 'cov-2',
        startDate: new Date('2026-05-15'),
        endDate: new Date('2026-05-30'),
        workplacePosition: { role: 'Vigilante', workplace: { name: 'Posto B' } },
      },
    ]

    const prisma = createMockPrisma({
      coverageAssignmentFindMany: async () => mockCoverages,
    })

    const result = await CoverageEngine.detectChaining('ferista-2', 'tenant-1', prisma)

    assert.strictEqual(result.canChain, false)
    assert.strictEqual(result.availableGaps.length, 0)
  })

  await t.test('Should return no gaps when only one coverage exists', async () => {
    const mockCoverages = [
      {
        id: 'cov-1',
        startDate: new Date('2026-05-01'),
        endDate: new Date('2026-05-15'),
        workplacePosition: { role: 'Vigilante', workplace: { name: 'Posto A' } },
      },
    ]

    const prisma = createMockPrisma({
      coverageAssignmentFindMany: async () => mockCoverages,
    })

    const result = await CoverageEngine.detectChaining('ferista-3', 'tenant-1', prisma)

    assert.strictEqual(result.totalCoverages, 1)
    assert.strictEqual(result.canChain, false)
    assert.strictEqual(result.availableGaps.length, 0)
  })

  await t.test('Should return empty result when no coverages exist', async () => {
    const prisma = createMockPrisma({
      coverageAssignmentFindMany: async () => [],
    })

    const result = await CoverageEngine.detectChaining('ferista-4', 'tenant-1', prisma)

    assert.strictEqual(result.totalCoverages, 0)
    assert.strictEqual(result.canChain, false)
    assert.strictEqual(result.availableGaps.length, 0)
    assert.strictEqual(result.coverages.length, 0)
  })

  await t.test('Should include coverage metadata with workplace and role', async () => {
    const mockCoverages = [
      {
        id: 'cov-1',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-10'),
        workplacePosition: { role: 'Vigilante', workplace: { name: 'Posto Central' } },
      },
    ]

    const prisma = createMockPrisma({
      coverageAssignmentFindMany: async () => mockCoverages,
    })

    const result = await CoverageEngine.detectChaining('ferista-5', 'tenant-1', prisma)

    assert.strictEqual(result.coverages[0].workplace, 'Posto Central')
    assert.strictEqual(result.coverages[0].role, 'Vigilante')
    assert.deepStrictEqual(result.coverages[0].startDate, new Date('2026-06-01'))
  })
})
