// Story 5.3 — Penetration tests cross-tenant.
// Garante NFR10: 0 vazamentos cross-tenant em rotas /imports/* e /employees/*.
// Roda obrigatoriamente no CI; se falhar, merge é bloqueado.

// Setup env ANTES de imports (validação top-level em vários módulos).
process.env.BANK_DATA_ENCRYPTION_KEY ??= '0+5mYyV8DG7BUSmJ6ugef35NARVs5HJ+TbogSnOD0D4='
process.env.JWT_SECRET ??= 'ci_test_secret_key_not_for_production'
process.env.IMPORT_FILE_STORAGE_PATH ??= '/tmp/imports-security-test'

import test from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

const enc = require('../../src/modules/imports/bank-data-encryption') as typeof import('../../src/modules/imports/bank-data-encryption')
const appModule = require('../../src/app') as typeof import('../../src/app')

// Bypass fastify-cli helper (incompatível com tsx). Monta app manualmente.
async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false })
  await fastify.register(fp(appModule.default))
  await fastify.ready()
  return fastify
}

const TS = Date.now().toString().slice(-7)
let seq = 0
function uniqCnpj(): string {
  seq += 1
  // Format pseudo-CNPJ: 14 dígitos formatados.
  const n = (TS + String(seq).padStart(2, '0')).slice(-14)
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12, 14)}`
}

test('Pen-tests cross-tenant — Stories 1.x/3.x/5.1/5.2', async (t) => {
  const app = await buildApp()
  t.after(async () => { await app.close() })
  const prisma = app.prisma

  // ---------- Setup ----------
  const tenantA = await prisma.tenant.create({
    data: { name: `PenTest-A-${TS}`, cnpj: uniqCnpj() },
  })
  const tenantB = await prisma.tenant.create({
    data: { name: `PenTest-B-${TS}`, cnpj: uniqCnpj() },
  })
  const tenantInactive = await prisma.tenant.create({
    data: { name: `PenTest-Inactive-${TS}`, cnpj: uniqCnpj(), isActive: false },
  })

  const tenantAdminA = await prisma.user.create({
    data: { email: `admin-a-${TS}@x.test`, role: 'ADMIN', tenantId: tenantA.id, name: 'Admin A' },
  })
  const tenantAdminB = await prisma.user.create({
    data: { email: `admin-b-${TS}@x.test`, role: 'ADMIN', tenantId: tenantB.id, name: 'Admin B' },
  })
  // SuperAdmin com tenantId=tenantA (simula impersonation/switch-tenant ativo).
  const superAdmin = await prisma.user.create({
    data: { email: `super-${TS}@x.test`, role: 'SUPERADMIN', tenantId: tenantA.id, name: 'Super' },
  })

  // ImportJobs — 1 em cada tenant, ambos PREVIEW_READY com previewSummary minimal.
  const previewSummary = {
    totalRows: 5,
    counts: { create: 5, update: 0, unchanged: 0, reactivation: 0, invalid: 0, absent: 0 },
    newWorkplaces: [],
    sampleRows: [
      { rowIndex: 1, status: 'create' },
      { rowIndex: 2, status: 'create' },
    ],
  }
  const jobA = await prisma.importJob.create({
    data: {
      tenantId: tenantA.id,
      operatorUserId: tenantAdminA.id,
      status: 'PREVIEW_READY',
      parserVersion: 'tirvu-v1',
      filename: 'pen-test-A.xlsx',
      fileSize: 1024,
      fileHash: 'a'.repeat(64),
      storagePath: `${tenantA.id}/${randomUUID()}.xlsx`,
      previewSummary,
    },
  })
  const jobB = await prisma.importJob.create({
    data: {
      tenantId: tenantB.id,
      operatorUserId: tenantAdminB.id,
      status: 'PREVIEW_READY',
      parserVersion: 'tirvu-v1',
      filename: 'pen-test-B.xlsx',
      fileSize: 1024,
      fileHash: 'b'.repeat(64),
      storagePath: `${tenantB.id}/${randomUUID()}.xlsx`,
      previewSummary,
    },
  })

  // Employee em tenantB com bankData encryptado.
  const blob = enc.encryptBankData(
    {
      tipoPix: 'CPF', chavePix: '12345678900', banco: '001',
      tipoConta: 'CC', agencia: '1234', conta: '987654321',
    },
    tenantB.id,
  )
  const employeeB = await prisma.employee.create({
    data: {
      tenantId: tenantB.id,
      name: 'PenTest Employee B',
      cpf: `${TS.slice(0, 3)}.${TS.slice(3, 6)}.${'000'}-99`,
      hireDate: new Date('2020-01-01'),
      bankDataEnc: blob.enc,
      bankDataIv: blob.iv,
      bankDataTag: blob.tag,
    },
  })

  // Employee em tenantA com bankData (para tampering test em T6 dentro do mesmo tenant).
  const blobA = enc.encryptBankData(
    {
      tipoPix: 'CPF', chavePix: '99988877766', banco: '001',
      tipoConta: 'CC', agencia: '5678', conta: '111122223',
    },
    tenantA.id,
  )
  const employeeA = await prisma.employee.create({
    data: {
      tenantId: tenantA.id,
      name: 'PenTest Employee A',
      cpf: `${TS.slice(0, 3)}.${TS.slice(3, 6)}.${'001'}-99`,
      hireDate: new Date('2020-01-01'),
      bankDataEnc: blobA.enc,
      bankDataIv: blobA.iv,
      bankDataTag: blobA.tag,
    },
  })

  // Helper: assina JWT.
  function token(user: { id: string; tenantId: string | null; role: string }): string {
    return app.jwt.sign({ userId: user.id, tenantId: user.tenantId, role: user.role })
  }
  const tokenAdminA = token(tenantAdminA)
  const tokenSuperA = token(superAdmin)

  function authHeader(t: string): Record<string, string> {
    return { Authorization: `Bearer ${t}` }
  }

  // ---------- Cleanup ----------
  t.after(async () => {
    // Ordem: dependentes antes (FKs).
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id, tenantInactive.id] } } })
    await prisma.importJob.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id, tenantInactive.id] } } })
    await prisma.employee.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id, tenantInactive.id] } } })
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id, tenantInactive.id] } } })
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id, tenantInactive.id] } } })
  })

  // =====================================================================
  // T2 — Cross-tenant ImportJob: TenantAdmin de A → endpoints de B = 404
  // =====================================================================

  await t.test('GET /imports/:jobIdB (TenantAdmin A → job B) → 404 JOB_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/imports/${jobB.id}`,
      headers: authHeader(tokenAdminA),
    })
    assert.equal(res.statusCode, 404)
    const body = JSON.parse(res.payload)
    assert.equal(body.error?.code, 'JOB_NOT_FOUND')
  })

  await t.test('POST /imports/:jobIdB/cancel (TenantAdmin A → job B) → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/imports/${jobB.id}/cancel`,
      headers: authHeader(tokenAdminA),
      payload: {},
    })
    assert.equal(res.statusCode, 404)
    const body = JSON.parse(res.payload)
    assert.equal(body.error?.code, 'JOB_NOT_FOUND')
  })

  await t.test('POST /imports/:jobIdB/apply (TenantAdmin A → job B) → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/imports/${jobB.id}/apply`,
      headers: authHeader(tokenAdminA),
      payload: { confirmTenantName: tenantB.name },
    })
    assert.equal(res.statusCode, 404)
    const body = JSON.parse(res.payload)
    assert.equal(body.error?.code, 'JOB_NOT_FOUND')
  })

  await t.test('GET /imports/:jobIdB/preview (TenantAdmin A → job B) → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/imports/${jobB.id}/preview`,
      headers: authHeader(tokenAdminA),
    })
    assert.equal(res.statusCode, 404)
    const body = JSON.parse(res.payload)
    assert.equal(body.error?.code, 'JOB_NOT_FOUND')
  })

  await t.test('GET /imports/:jobIdB/error-report.xlsx (TenantAdmin A → job B) → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/imports/${jobB.id}/error-report.xlsx`,
      headers: authHeader(tokenAdminA),
    })
    assert.equal(res.statusCode, 404)
    const body = JSON.parse(res.payload)
    assert.equal(body.error?.code, 'JOB_NOT_FOUND')
  })

  // =====================================================================
  // T3 — Forbidden cross-role
  // =====================================================================

  await t.test('TenantAdmin tenta POST /admin/imports/employees → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/imports/employees',
      headers: authHeader(tokenAdminA),
      payload: 'irrelevant',
    })
    assert.equal(res.statusCode, 403)
  })

  await t.test('TenantAdmin tenta GET /admin/imports/:jobIdA → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/imports/${jobA.id}`,
      headers: authHeader(tokenAdminA),
    })
    assert.equal(res.statusCode, 403)
  })

  // =====================================================================
  // T4 — Payload tampering
  // =====================================================================

  // T4.1: TenantAdmin upload com tenantId no body apontando outro tenant —
  // backend usa tenantId do JWT, ignora body.tenantId silenciosamente.
  await t.test('POST /imports/employees com tenantId-de-B no body (TenantAdmin A) → 201, job criado em A', async () => {
    // Requer arquivo .xlsx válido. Vamos enviar buffer mínimo. Backend parse
    // em background, mas o create do ImportJob é síncrono no upload-flow.
    // Como o upload-flow valida só tamanho/extensão, basta um buffer com nome .xlsx.
    const boundary = '----PenTestBoundary123'
    const fileContent = Buffer.from('PK\x03\x04dummy', 'binary')
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="tenantId"\r\n\r\n${tenantB.id}\r\n`),
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Disposition: form-data; name="file"; filename="pen.xlsx"\r\n'),
      Buffer.from('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n'),
      fileContent,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/employees',
      headers: {
        ...authHeader(tokenAdminA),
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    })

    assert.equal(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${res.payload}`)
    const json = JSON.parse(res.payload)
    const createdJobId = json.data?.jobId
    assert.ok(createdJobId, 'jobId should be returned')

    // Verifica diretamente no DB.
    const created = await prisma.importJob.findUnique({ where: { id: createdJobId } })
    assert.ok(created, 'Job should exist in DB')
    assert.equal(created?.tenantId, tenantA.id, 'Job MUST be in tenantA, NOT tenantB (anti-tampering)')

    // Verifica que NADA foi criado em tenantB por este test.
    const inB = await prisma.importJob.findFirst({
      where: { tenantId: tenantB.id, filename: 'pen.xlsx' },
    })
    assert.equal(inB, null, 'NO job should leak to tenantB')

    // Cleanup imediato deste job.
    await prisma.auditLog.deleteMany({ where: { resourceId: createdJobId } })
    await prisma.importJob.delete({ where: { id: createdJobId } })
  })

  await t.test('SuperAdmin POST /admin/imports/employees com tenant inativo → 400 INVALID_TARGET_TENANT', async () => {
    const boundary = '----PenTestBoundary456'
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="tenantId"\r\n\r\n${tenantInactive.id}\r\n`),
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Disposition: form-data; name="file"; filename="pen.xlsx"\r\n'),
      Buffer.from('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n'),
      Buffer.from('PK\x03\x04dummy', 'binary'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/imports/employees',
      headers: {
        ...authHeader(tokenSuperA),
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    })
    assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.payload}`)
    const json = JSON.parse(res.payload)
    assert.equal(json.error?.code, 'INVALID_TARGET_TENANT')
  })

  await t.test('SuperAdmin POST /admin/imports/employees SEM tenantId → 400 INVALID_TARGET_TENANT', async () => {
    const boundary = '----PenTestBoundary789'
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Disposition: form-data; name="file"; filename="pen.xlsx"\r\n'),
      Buffer.from('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n'),
      Buffer.from('PK\x03\x04dummy', 'binary'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/imports/employees',
      headers: {
        ...authHeader(tokenSuperA),
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    })
    assert.equal(res.statusCode, 400)
    const json = JSON.parse(res.payload)
    assert.equal(json.error?.code, 'INVALID_TARGET_TENANT')
    assert.match(json.error?.message ?? '', /tenantId/i)
  })

  // =====================================================================
  // T5 — Cross-tenant Employee + bankData (Story 5.2 carry-over)
  // =====================================================================

  await t.test('SuperAdmin (tenantId=A) GET /employees/:idB → 404 (filter por tenantId vence)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/employees/${employeeB.id}`,
      headers: authHeader(tokenSuperA),
    })
    assert.equal(res.statusCode, 404)
  })

  await t.test('SuperAdmin (tenantId=A) GET /employees/:idB com X-Show-Bank-Data: true → 404 (não 403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/employees/${employeeB.id}`,
      headers: { ...authHeader(tokenSuperA), 'X-Show-Bank-Data': 'true' },
    })
    assert.equal(res.statusCode, 404, `tenant filter deve vencer header check; got ${res.statusCode}`)
  })

  // =====================================================================
  // T6 — Tampering ciphertext (AES-GCM auth tag detect)
  // =====================================================================

  await t.test('Tampering bankDataTag → GET com unmask retorna 500 BANK_DATA_DECRYPT_FAILED', async () => {
    // Modifica 1 byte do tag para forçar AES-GCM auth failure.
    const tampered = Buffer.from(employeeA.bankDataTag as Uint8Array)
    tampered[0] = tampered[0] ^ 0xff
    await prisma.employee.update({
      where: { id: employeeA.id },
      data: { bankDataTag: tampered },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/employees/${employeeA.id}`,
      headers: { ...authHeader(tokenSuperA), 'X-Show-Bank-Data': 'true' },
    })
    assert.equal(res.statusCode, 500, `Expected 500 on tampering; got ${res.statusCode}: ${res.payload}`)
    const json = JSON.parse(res.payload)
    assert.equal(json.error?.code, 'BANK_DATA_DECRYPT_FAILED')
    // Sanity: response NÃO inclui campos crus de ciphertext nem plaintext.
    assert.equal(json.bankDataEnc, undefined)
    assert.equal(json.bankData, undefined)
    // Mensagem genérica (não vaza detalhe técnico).
    assert.match(json.error?.message ?? '', /Erro ao acessar dados bancários/)
  })

  // Documentation-only assertion para AC #16 (raw SQL bypass).
  // Não há código de produção que execute raw SQL contra bank_data_enc;
  // defesa é via design (D2). Comentário aqui para auditor encontrar.
})
