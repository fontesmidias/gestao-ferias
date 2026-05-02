// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import type { Prisma, PrismaClient } from '@prisma/client'
import { encryptBankData } from './bank-data-encryption'
import { parseCpfNoMask } from './utils'
import type {
  BankData,
  Diff,
  Employee,
  EmployeePatch,
  TirvuRow,
} from './types'

export interface ApplyOptions {
  createWorkplaces: string[]
  markAbsentAsPending: boolean
  reactivateAll: boolean
}

export interface ApplyContext {
  tenantId: string
  jobId: string
  userId: string
  options: ApplyOptions
}

export type ApplyItem =
  | { kind: 'create'; row: TirvuRow; patch: EmployeePatch }
  | {
      kind: 'update'
      row: TirvuRow
      employee: Employee
      patch: EmployeePatch
      diff: Diff
    }
  | {
      kind: 'reactivation'
      row: TirvuRow
      employee: Employee
      patch: EmployeePatch
      diff: Diff
    }
  | { kind: 'absent'; employee: Employee }
  | { kind: 'invalid'; row: TirvuRow; errors: string[] }
  | { kind: 'workplace'; name: string }

export interface ApplyResult {
  created: number
  updated: number
  reactivated: number
  pendingMarked: number
  invalidLogged: number
  workplacesCreated: number
}

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

function buildBankData(row: TirvuRow): BankData | null {
  if (
    !row.tipoPix &&
    !row.chavePix &&
    !row.banco &&
    !row.tipoConta &&
    !row.agencia &&
    !row.conta
  ) {
    return null
  }
  return {
    tipoPix: row.tipoPix,
    chavePix: row.chavePix,
    banco: row.banco,
    tipoConta: row.tipoConta,
    agencia: row.agencia,
    conta: row.conta,
  }
}

function redactForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const {
    bankDataEnc: _bde,
    bankDataIv: _bdi,
    bankDataTag: _bdt,
    ...rest
  } = obj
  return rest
}

function patchWithBankData(
  row: TirvuRow,
  basePatch: EmployeePatch,
  tenantId: string,
): { data: Record<string, unknown>; hasBankData: boolean } {
  const data: Record<string, unknown> = { ...basePatch }
  const bd = buildBankData(row)
  if (bd) {
    const blob = encryptBankData(bd, tenantId)
    data.bankDataEnc = blob.enc
    data.bankDataIv = blob.iv
    data.bankDataTag = blob.tag
  }
  return { data, hasBankData: bd !== null }
}

async function applyCreate(
  tx: TxClient,
  item: Extract<ApplyItem, { kind: 'create' }>,
  ctx: ApplyContext,
): Promise<{ employeeId: string }> {
  const cpfDigits = parseCpfNoMask(item.row.cpf)
  if (!cpfDigits) {
    throw new Error('CPF ausente em row passada para applyCreate (validator deveria ter filtrado)')
  }
  const { data, hasBankData } = patchWithBankData(item.row, item.patch, ctx.tenantId)

  const employee = await tx.employee.create({
    data: {
      ...(data as Prisma.EmployeeUncheckedCreateInput),
      tenantId: ctx.tenantId,
      cpf: cpfDigits,
      hireDate: (item.patch.hireDate as Date) ?? new Date(),
      name: (item.patch.name as string) ?? cpfDigits,
    },
  })

  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'EMPLOYEE_IMPORT_CREATE',
      resourceType: 'EMPLOYEE',
      resourceId: employee.id,
      newData: { ...redactForLog(item.patch), hasBankData } as never,
    },
  })

  return { employeeId: employee.id }
}

async function applyUpdate(
  tx: TxClient,
  item: Extract<ApplyItem, { kind: 'update' }>,
  ctx: ApplyContext,
): Promise<void> {
  const { data, hasBankData } = patchWithBankData(item.row, item.patch, ctx.tenantId)
  // Atualiza apenas campos do diff + bank fields (se houver)
  const diffOnlyData: Record<string, unknown> = {}
  for (const k of Object.keys(item.diff)) {
    if (k in (data as object)) {
      diffOnlyData[k] = (data as Record<string, unknown>)[k]
    }
  }
  if (hasBankData) {
    diffOnlyData.bankDataEnc = (data as Record<string, unknown>).bankDataEnc
    diffOnlyData.bankDataIv = (data as Record<string, unknown>).bankDataIv
    diffOnlyData.bankDataTag = (data as Record<string, unknown>).bankDataTag
  }

  await tx.employee.update({
    where: { id: item.employee.id },
    data: diffOnlyData as Prisma.EmployeeUncheckedUpdateInput,
  })

  const previousData: Record<string, unknown> = {}
  const newData: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(item.diff)) {
    previousData[k] = v.from
    newData[k] = v.to
  }

  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'EMPLOYEE_IMPORT_UPDATE',
      resourceType: 'EMPLOYEE',
      resourceId: item.employee.id,
      previousData: previousData as never,
      newData: { ...newData, hasBankData } as never,
    },
  })
}

async function applyReactivation(
  tx: TxClient,
  item: Extract<ApplyItem, { kind: 'reactivation' }>,
  ctx: ApplyContext,
): Promise<void> {
  if (!ctx.options.reactivateAll) return

  const { data, hasBankData } = patchWithBankData(item.row, item.patch, ctx.tenantId)
  const updateData: Record<string, unknown> = {
    ...data,
    status: 'ATIVO',
    terminationDate: { set: null as unknown as Date },
  }

  await tx.employee.update({
    where: { id: item.employee.id },
    data: updateData as Prisma.EmployeeUncheckedUpdateInput,
  })

  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'EMPLOYEE_IMPORT_REACTIVATE',
      resourceType: 'EMPLOYEE',
      resourceId: item.employee.id,
      newData: { ...redactForLog(item.patch), hasBankData } as never,
    },
  })
}

async function applyAbsent(
  tx: TxClient,
  item: Extract<ApplyItem, { kind: 'absent' }>,
  ctx: ApplyContext,
): Promise<void> {
  if (!ctx.options.markAbsentAsPending) return

  await tx.employee.update({
    where: { id: item.employee.id },
    data: { inactivePending: true },
  })

  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'EMPLOYEE_IMPORT_FLAG_INACTIVE_PENDING',
      resourceType: 'EMPLOYEE',
      resourceId: item.employee.id,
    },
  })
}

async function applyInvalid(
  tx: TxClient,
  item: Extract<ApplyItem, { kind: 'invalid' }>,
  ctx: ApplyContext,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'EMPLOYEE_IMPORT_INVALID',
      resourceType: 'IMPORT_JOB',
      resourceId: ctx.jobId,
      reason: item.errors[0] ?? 'unknown',
    },
  })
}

async function applyWorkplaceCreate(
  tx: TxClient,
  item: Extract<ApplyItem, { kind: 'workplace' }>,
  ctx: ApplyContext,
): Promise<void> {
  const wp = await tx.workplace.create({
    data: {
      name: item.name,
      tenantId: ctx.tenantId,
      minStaff: 1,
    },
  })

  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'WORKPLACE_CREATED_VIA_IMPORT',
      resourceType: 'WORKPLACE',
      resourceId: wp.id,
      newData: { name: item.name } as never,
    },
  })
}

export async function applyItem(
  tx: TxClient,
  item: ApplyItem,
  ctx: ApplyContext,
): Promise<{
  delta: keyof ApplyResult | null
}> {
  switch (item.kind) {
    case 'create':
      await applyCreate(tx, item, ctx)
      return { delta: 'created' }
    case 'update':
      await applyUpdate(tx, item, ctx)
      return { delta: 'updated' }
    case 'reactivation':
      await applyReactivation(tx, item, ctx)
      return { delta: ctx.options.reactivateAll ? 'reactivated' : null }
    case 'absent':
      await applyAbsent(tx, item, ctx)
      return { delta: ctx.options.markAbsentAsPending ? 'pendingMarked' : null }
    case 'invalid':
      await applyInvalid(tx, item, ctx)
      return { delta: 'invalidLogged' }
    case 'workplace':
      await applyWorkplaceCreate(tx, item, ctx)
      return { delta: 'workplacesCreated' }
  }
}
