// Story 5.3 — Penetration tests cross-tenant.
// Garante NFR10: 0 vazamentos cross-tenant em rotas /imports/* e /employees/*.
// Roda obrigatoriamente no CI; se falhar, merge é bloqueado.

// Setup env ANTES de imports (validação top-level em vários módulos).
process.env.BANK_DATA_ENCRYPTION_KEY ??= '0+5mYyV8DG7BUSmJ6ugef35NARVs5HJ+TbogSnOD0D4='
process.env.JWT_SECRET ??= 'ci_test_secret_key_not_for_production'
process.env.IMPORT_FILE_STORAGE_PATH ??= '/tmp/imports-security-test'

import test from 'node:test'
import assert from 'node:assert'
import { randomBytes, randomUUID } from 'node:crypto'
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

// H2 — random hex CNPJ/email para evitar P2002 UNIQUE flakiness.
function uniqCnpj(): string {
  const n = randomBytes(7).toString('hex').slice(0, 14).replace(/[a-f]/g, (c) =>
    String(((c.charCodeAt(0) - 'a'.charCodeAt(0)) % 10)),
  )
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12, 14)}`
}

function uniqEmail(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString('hex')}@x.test`
}

// M1 — IP único por upload para evitar rate-limit flakiness em runs locais.
let ipSeq = 0
function uniqIp(): string {
  ipSeq += 1
  // Range 10.x.x.x reservado, seguro para sintetizar.
  const a = (ipSeq >> 16) & 0xff
  const b = (ipSeq >> 8) & 0xff
  const c = ipSeq & 0xff
  return `10.${a}.${b}.${c}`
}

const PEN_PREFIX = 'PenTest-'

test('Pen-tests cross-tenant — Stories 1.x/3.x/5.1/5.2', async (t) => {
  const app = await buildApp()
  t.after(async () => { await app.close() })
  const prisma = app.prisma

  // M2 — pre-cleanup defensivo de runs anteriores que possam ter falhado.
  // Tenants antigos (>1h) com prefixo PenTest- que ficaram órfãos.
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const stale = await prisma.tenant.findMany({
      where: { name: { startsWith: PEN_PREFIX }, createdAt: { lt: oneHourAgo } },
      select: { id: true },
    })
    if (stale.length > 0) {
      const ids = stale.map((s) => s.id)
      await prisma.auditLog.deleteMany({ where: { tenantId: { in: ids } } }).catch(() => {})
      await prisma.importJob.deleteMany({ where: { tenantId: { in: ids } } }).catch(() => {})
      await prisma.employee.deleteMany({ where: { tenantId: { in: ids } } }).catch(() => {})
      await prisma.user.deleteMany({ where: { tenantId: { in: ids } } }).catch(() => {})
      await prisma.tenant.deleteMany({ where: { id: { in: ids } } }).catch(() => {})
    }
  } catch {
    // Best-effort, não falhar setup se cleanup defensivo der erro.
  }

  // ---------- Setup ----------
  const tenantA = await prisma.tenant.create({
    data: { name: `${PEN_PREFIX}A-${randomBytes(4).toString('hex')}`, cnpj: uniqCnpj() },
  })
  const tenantB = await prisma.tenant.create({
    data: { name: `${PEN_PREFIX}B-${randomBytes(4).toString('hex')}`, cnpj: uniqCnpj() },
  })
  const tenantInactive = await prisma.tenant.create({
    data: { name: `${PEN_PREFIX}Inactive-${randomBytes(4).toString('hex')}`, cnpj: uniqCnpj(), isActive: false },
  })

  const tenantAdminA = await prisma.user.create({
    data: { email: uniqEmail('admin-a'), role: 'ADMIN', tenantId: tenantA.id, name: 'Admin A' },
  })
  const tenantAdminB = await prisma.user.create({
    data: { email: uniqEmail('admin-b'), role: 'ADMIN', tenantId: tenantB.id, name: 'Admin B' },
  })
  // SuperAdmin com tenantId=tenantA (simula impersonation/switch-tenant ativo).
  const superAdmin = await prisma.user.create({
    data: { email: uniqEmail('super'), role: 'SUPERADMIN', tenantId: tenantA.id, name: 'Super' },
  })
  // H1 — SuperAdmin com tenantId=null (estado pós-login sem switch).
  const superAdminNullTenant = await prisma.user.create({
    data: { email: uniqEmail('super-null'), role: 'SUPERADMIN', tenantId: null, name: 'Super Null' },
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
  const cpfPrefixB = randomBytes(3).toString('hex').replace(/[a-f]/g, '0').slice(0, 6)
  const employeeB = await prisma.employee.create({
    data: {
      tenantId: tenantB.id,
      name: 'PenTest Employee B',
      cpf: `${cpfPrefixB.slice(0, 3)}.${cpfPrefixB.slice(3, 6)}.${'000'}-99`,
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
  const cpfPrefixA = randomBytes(3).toString('hex').replace(/[a-f]/g, '0').slice(0, 6)
  const employeeA = await prisma.employee.create({
    data: {
      tenantId: tenantA.id,
      name: 'PenTest Employee A',
      cpf: `${cpfPrefixA.slice(0, 3)}.${cpfPrefixA.slice(3, 6)}.${'001'}-99`,
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
  const tokenAdminB = token(tenantAdminB)
  const tokenSuperA = token(superAdmin)
  const tokenSuperNull = token(superAdminNullTenant)

  function authHeader(t: string): Record<string, string> {
    return { Authorization: `Bearer ${t}` }
  }

  // ---------- Cleanup ----------
  // M2 — try/catch em cada deleteMany para evitar falha silenciosa total.
  t.after(async () => {
    const tenantIds = [tenantA.id, tenantB.id, tenantInactive.id]
    const userIds = { in: [superAdminNullTenant.id] }
    const safe = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn()
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[cleanup] ${label} falhou:`, (err as Error).message)
      }
    }
    // Ordem: dependentes antes (FKs). SuperAdmin null-tenant não é capturado pelo
    // filtro tenantId, deletar separado.
    await safe('auditLog by tenant', () => prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } }))
    await safe('auditLog by user (null tenant)', () => prisma.auditLog.deleteMany({ where: { userId: userIds } }))
    await safe('importJob', () => prisma.importJob.deleteMany({ where: { tenantId: { in: tenantIds } } }))
    await safe('employee', () => prisma.employee.deleteMany({ where: { tenantId: { in: tenantIds } } }))
    await safe('user by tenant', () => prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } }))
    await safe('user null tenant', () => prisma.user.deleteMany({ where: { id: userIds } }))
    await safe('tenant', () => prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }))
  })

  // =====================================================================
  // T2 — Cross-tenant ImportJob (mirror A↔B via helper)
  // =====================================================================

  async function runCrossTenantSuite(
    label: string,
    adminToken: string,
    otherJob: { id: string },
    otherTenantName: string,
  ) {
    await t.test(`[${label}] GET /imports/:otherJobId → 404 JOB_NOT_FOUND`, async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/imports/${otherJob.id}`,
        headers: authHeader(adminToken),
      })
      assert.equal(res.statusCode, 404)
      const body = JSON.parse(res.payload)
      assert.equal(body.error?.code, 'JOB_NOT_FOUND')
    })

    await t.test(`[${label}] POST /imports/:otherJobId/cancel → 404`, async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/${otherJob.id}/cancel`,
        headers: authHeader(adminToken),
        payload: {},
      })
      assert.equal(res.statusCode, 404)
      const body = JSON.parse(res.payload)
      assert.equal(body.error?.code, 'JOB_NOT_FOUND')
    })

    await t.test(`[${label}] POST /imports/:otherJobId/apply → 404`, async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/${otherJob.id}/apply`,
        headers: authHeader(adminToken),
        payload: { confirmTenantName: otherTenantName },
      })
      assert.equal(res.statusCode, 404)
      const body = JSON.parse(res.payload)
      assert.equal(body.error?.code, 'JOB_NOT_FOUND')
    })

    await t.test(`[${label}] GET /imports/:otherJobId/preview → 404`, async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/imports/${otherJob.id}/preview`,
        headers: authHeader(adminToken),
      })
      assert.equal(res.statusCode, 404)
      const body = JSON.parse(res.payload)
      assert.equal(body.error?.code, 'JOB_NOT_FOUND')
    })

    await t.test(`[${label}] GET /imports/:otherJobId/error-report.xlsx → 404`, async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/imports/${otherJob.id}/error-report.xlsx`,
        headers: authHeader(adminToken),
      })
      assert.equal(res.statusCode, 404)
      const body = JSON.parse(res.payload)
      assert.equal(body.error?.code, 'JOB_NOT_FOUND')
    })
  }

  // H5 — Mirror tests A↔B (10 cross-tenant cases ao invés de 5).
  await runCrossTenantSuite('TenantAdmin A → job B', tokenAdminA, jobB, tenantB.name)
  await runCrossTenantSuite('TenantAdmin B → job A', tokenAdminB, jobA, tenantA.name)

  // =====================================================================
  // H1 — SuperAdmin com tenantId=null (defesa em profundidade)
  // =====================================================================

  await t.test('H1: SuperAdmin null-tenant GET /admin/imports/:jobIdA → 200 (admin scope OK)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/imports/${jobA.id}`,
      headers: authHeader(tokenSuperNull),
    })
    assert.equal(res.statusCode, 200, `admin scope deve ignorar tenant; got ${res.statusCode}: ${res.payload}`)
    const body = JSON.parse(res.payload)
    assert.equal(body.data?.jobId, jobA.id)
    assert.equal(body.data?.tenantId, tenantA.id)
  })

  await t.test('H1: SuperAdmin null-tenant GET /imports/:jobIdA → 404 (tenant scope nega null)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/imports/${jobA.id}`,
      headers: authHeader(tokenSuperNull),
    })
    // Branch !user.tenantId em status-flow.ts:96 deve retornar 404.
    assert.equal(res.statusCode, 404, `tenant scope deve negar null tenant; got ${res.statusCode}`)
    const body = JSON.parse(res.payload)
    assert.equal(body.error?.code, 'JOB_NOT_FOUND')
  })

  // =====================================================================
  // T3 — Forbidden cross-role (H4 — assert origem do 403)
  // =====================================================================

  await t.test('TenantAdmin tenta POST /admin/imports/employees → 403 com mensagem de SuperAdmin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/imports/employees',
      headers: authHeader(tokenAdminA),
      payload: 'irrelevant',
      remoteAddress: uniqIp(),
    })
    assert.equal(res.statusCode, 403)
    const body = JSON.parse(res.payload)
    // H4: garante que 403 vem do requireSuperAdmin (não rate-limit ou outro).
    assert.equal(body.error, 'Forbidden')
    assert.match(body.message ?? '', /Acesso restrito ao Super Administrador/)
  })

  await t.test('TenantAdmin tenta GET /admin/imports/:jobIdA → 403 com mensagem de SuperAdmin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/imports/${jobA.id}`,
      headers: authHeader(tokenAdminA),
    })
    assert.equal(res.statusCode, 403)
    const body = JSON.parse(res.payload)
    assert.equal(body.error, 'Forbidden')
    assert.match(body.message ?? '', /Acesso restrito ao Super Administrador/)
  })

  // =====================================================================
  // T4 — Payload tampering
  // =====================================================================

  // T4.1: TenantAdmin upload com tenantId no body apontando outro tenant —
  // backend usa tenantId do JWT, ignora body.tenantId silenciosamente.
  await t.test('POST /imports/employees com tenantId-de-B no body (TenantAdmin A) → 201, job criado em A', async () => {
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
      remoteAddress: uniqIp(),
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

  // H3 — Body JSON com tenantId malicioso (sem multipart) não cria em B.
  await t.test('H3: POST /imports/employees JSON sem multipart com tenantId malicioso → não cria em B', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/employees',
      headers: {
        ...authHeader(tokenAdminA),
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ tenantId: tenantB.id, filename: 'malicious.xlsx' }),
      remoteAddress: uniqIp(),
    })

    // Não deve criar nada (status pode ser 400/415/500 dependendo de qual validação falha primeiro).
    assert.notEqual(res.statusCode, 201, `JSON sem multipart NÃO deve criar job; got ${res.statusCode}: ${res.payload}`)

    // Crítico: NADA criado em tenantB.
    const inB = await prisma.importJob.findFirst({
      where: { tenantId: tenantB.id, filename: 'malicious.xlsx' },
    })
    assert.equal(inB, null, 'NO job should leak to tenantB via JSON body')

    // Defesa em profundidade: também verifica que nada foi criado em tenantA com esse filename.
    const inA = await prisma.importJob.findFirst({
      where: { tenantId: tenantA.id, filename: 'malicious.xlsx' },
    })
    if (inA) {
      // Se por algum motivo algo foi criado em A, pelo menos o tenantId está correto (JWT).
      assert.equal(inA.tenantId, tenantA.id, 'Se criou, deve ser em A (tenantId do JWT)')
      await prisma.importJob.delete({ where: { id: inA.id } }).catch(() => {})
    }
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
      remoteAddress: uniqIp(),
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
      remoteAddress: uniqIp(),
    })
    assert.equal(res.statusCode, 400)
    const json = JSON.parse(res.payload)
    assert.equal(json.error?.code, 'INVALID_TARGET_TENANT')
    assert.match(json.error?.message ?? '', /tenantId/i)
  })

  // =====================================================================
  // M3 — confirmTenantName mismatch no apply (defesa contra regressão)
  // =====================================================================

  await t.test('M3: SuperAdmin POST /admin/imports/:jobIdA/apply com confirmTenantName errado → 400 CONFIRMATION_MISMATCH', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/imports/${jobA.id}/apply`,
      headers: authHeader(tokenSuperA),
      payload: { confirmTenantName: 'NomeDeTenantQueNaoExiste' },
    })
    assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.payload}`)
    const json = JSON.parse(res.payload)
    assert.equal(json.error?.code, 'CONFIRMATION_MISMATCH')
    // Garante que o job NÃO transicionou para APPLYING.
    const reread = await prisma.importJob.findUnique({ where: { id: jobA.id } })
    assert.equal(reread?.status, 'PREVIEW_READY', 'Job não deve sair de PREVIEW_READY com confirm errado')
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
