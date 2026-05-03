// Story 5.2 — Validação do Pino redact configurado em app.ts.
// Estratégia: instanciar Pino com a MESMA config (paths + censor) e capturar
// stream para inspeção. Não precisa subir Fastify completo — testa a função
// pura de sanitização.

import test from 'node:test'
import assert from 'node:assert'
import pino from 'pino'

const redact = require('../../src/lib/log-redact') as typeof import('../../src/lib/log-redact')

interface CapturedLog {
  raw: string
  parsed: Record<string, unknown>
}

function makeLogger(): { logger: pino.Logger; captured: CapturedLog[] } {
  const captured: CapturedLog[] = []
  const stream = {
    write(chunk: string) {
      const trimmed = chunk.trim()
      if (!trimmed) return
      let parsed: Record<string, unknown> = {}
      try { parsed = JSON.parse(trimmed) as Record<string, unknown> } catch { /* not json */ }
      captured.push({ raw: trimmed, parsed })
    },
  }
  const logger = pino(
    {
      level: 'debug',
      redact: {
        paths: redact.LOG_REDACT_PATHS,
        censor: redact.logRedactCensor as never,
      },
    },
    stream as unknown as pino.DestinationStream,
  )
  return { logger, captured }
}

test('CPF top-level mascarado para ***.***.XXX-XX', () => {
  const { logger, captured } = makeLogger()
  logger.info({ cpf: '12345678900' }, 'test')
  const buf = captured.map((c) => c.raw).join('\n')
  assert.match(buf, /\*\*\*\.\*\*\*\.789-XX/)
  assert.ok(!buf.includes('12345678900'), 'CPF cleartext não deve aparecer')
})

test('bankData nested → REDACTED, chavePix nunca aparece', () => {
  const { logger, captured } = makeLogger()
  logger.info(
    { employee: { cpf: '99988877766', bankData: { chavePix: 'foo@bar.com', agencia: '1234', conta: '5678-9' } } },
    'test',
  )
  const buf = captured.map((c) => c.raw).join('\n')
  assert.ok(!buf.includes('foo@bar.com'), 'chavePix vazou')
  assert.ok(!buf.includes('1234'), 'agencia vazou')
  assert.ok(!buf.includes('5678-9'), 'conta vazou')
  assert.ok(buf.includes('[REDACTED]'), 'censor não aplicado')
  assert.match(buf, /\*\*\*\.\*\*\*\.777-XX/)
})

test('personalData (rg + pisPasep) nunca aparecem em log — top-level + nested', () => {
  const { logger, captured } = makeLogger()
  // Top-level
  logger.warn(
    { personalData: { rg: '999999', pisPasep: '12012012012' } },
    't1',
  )
  // 1 nível de nesting
  logger.warn(
    { employee: { personalData: { rg: '888888', pisPasep: '21121121121' } } },
    't2',
  )
  // 2 níveis
  logger.warn(
    { ctx: { employee: { personalData: { rg: '777777', pisPasep: '31231231231' } } } },
    't3',
  )
  const buf = captured.map((c) => c.raw).join('\n')
  for (const leak of ['999999', '12012012012', '888888', '21121121121', '777777', '31231231231']) {
    assert.ok(!buf.includes(leak), `personalData leak: ${leak}`)
  }
})

test('arrays — cpf e bankData dentro de array de rows são redactados (H1 fix)', () => {
  const { logger, captured } = makeLogger()
  logger.info(
    { rows: [{ cpf: '55544433322', bankData: { chavePix: 'leak@example.com' } }] },
    'array top-level',
  )
  logger.info(
    { ctx: { rows: [{ cpf: '11122233344', bankData: { agencia: '9999' } }] } },
    'array nested',
  )
  logger.info(
    { ctx: { result: { rows: [{ employee: { cpf: '99988877766' } }] } } },
    'array deep',
  )
  const buf = captured.map((c) => c.raw).join('\n')
  for (const leak of ['55544433322', 'leak@example.com', '11122233344', '9999', '99988877766']) {
    assert.ok(!buf.includes(leak), `Array leak: ${leak}`)
  }
})

test('grep regex CPF formato BR + raw retorna 0 matches em todos níveis', () => {
  const { logger, captured } = makeLogger()
  logger.info({ cpf: '11122233344', employee: { cpf: '99988877766' } }, 'test')
  logger.info({ data: { rows: [{ cpf: '55544433322' }] } }, 'test')
  const buf = captured.map((c) => c.raw).join('\n')
  // Regex BR: ddd.ddd.ddd-dd em qualquer posição
  const brMatches = buf.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g) ?? []
  assert.equal(brMatches.length, 0, `CPF formato BR encontrado: ${brMatches.join(', ')}`)
  // Raw: 11 dígitos consecutivos NUNCA devem aparecer
  for (const cpf of ['11122233344', '99988877766', '55544433322']) {
    assert.ok(!buf.includes(cpf), `CPF raw vazou: ${cpf}`)
  }
})

test('top-level chavePix/agencia/conta/banco/tipoPix → REDACTED', () => {
  const { logger, captured } = makeLogger()
  logger.info(
    { chavePix: 'pix@chave.com', agencia: '0001', conta: '12345-6', banco: 'Banco do Brasil', tipoPix: 'EMAIL' },
    'test',
  )
  const buf = captured.map((c) => c.raw).join('\n')
  assert.ok(!buf.includes('pix@chave.com'), 'chavePix vazou')
  assert.ok(!buf.includes('0001'), 'agencia vazou')
  assert.ok(!buf.includes('12345-6'), 'conta vazou')
  assert.ok(!buf.includes('Banco do Brasil'), 'banco vazou')
  assert.ok(!buf.includes('EMAIL'), 'tipoPix vazou')
})

test('CPF inválido (não 11 dígitos) ainda é REDACTED, não vaza', () => {
  const { logger, captured } = makeLogger()
  logger.info({ cpf: 'invalid-cpf-format' }, 'test')
  const buf = captured.map((c) => c.raw).join('\n')
  assert.ok(buf.includes('[REDACTED]'), 'CPF inválido deveria virar [REDACTED]')
  assert.ok(!buf.includes('invalid-cpf-format'))
})
