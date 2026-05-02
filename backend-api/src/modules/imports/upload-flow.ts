// TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
// marcador mantido por consistência com módulos vizinhos do épico.

import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import type { Queue } from 'bullmq'
import { persist as storagePersist } from './import-storage'

export interface ProcessUploadInput {
  tenantId: string
  operatorUserId: string
  buffer: Buffer
  filename: string
  ipAddress: string | null
  userAgent: string | null
}

export interface ProcessUploadResult {
  jobId: string
  status: 'PENDING'
}

export async function processUploadedImport(
  prisma: PrismaClient,
  queue: Pick<Queue, 'add'>,
  input: ProcessUploadInput,
): Promise<ProcessUploadResult> {
  const fileHash = createHash('sha256').update(input.buffer).digest('hex')

  const job = await prisma.importJob.create({
    data: {
      tenantId: input.tenantId,
      operatorUserId: input.operatorUserId,
      status: 'PENDING',
      parserVersion: 'tirvu-v1',
      filename: input.filename,
      fileSize: input.buffer.length,
      fileHash,
      storagePath: '',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  })

  const persisted = await storagePersist({
    tenantId: input.tenantId,
    jobId: job.id,
    buffer: input.buffer,
    filename: input.filename,
  })

  await prisma.importJob.update({
    where: { id: job.id },
    data: { storagePath: persisted.storagePath },
  })

  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.operatorUserId,
      action: 'EMPLOYEE_IMPORT_JOB_CREATED',
      resourceType: 'IMPORT_JOB',
      resourceId: job.id,
      ip: input.ipAddress,
      userAgent: input.userAgent,
    },
  })

  await queue.add('process', { jobId: job.id })

  return { jobId: job.id, status: 'PENDING' }
}
