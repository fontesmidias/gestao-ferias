// Story 4.4 / M3 — unit tests para o filtro de escopo do Oráculo.
import test from 'node:test'
import assert from 'node:assert'

import {
  isInScope,
  buildOutOfScopeAnswer,
  SUPPORTED_TOPICS,
} from '../../src/modules/predict/scope-filter'

test('scope-filter — perguntas in-scope', async (t) => {
  const inScopeQuestions = [
    'Quantos intermitentes preciso em setembro?',
    'Quem está com férias vencidas?',
    'Qual o custo estimado de cobertura para o mês?',
    'Tem gap em algum posto agora?',
    'Algum colaborador em risco de dobra CLT?',
    'Quais feristas estão disponíveis?',
    'Saldo de férias do João?',
    'CLT Art. 134 permite começar quinta?',
    'Forecast de demanda de intermitentes',
    'Quanto vai gastar com substituição em junho?',
  ]
  for (const q of inScopeQuestions) {
    await t.test(`in-scope: ${q}`, () => {
      const r = isInScope(q)
      assert.equal(r.inScope, true, `Esperava in-scope, got ${JSON.stringify(r)}`)
      assert.ok(r.matchedKeyword, 'matchedKeyword presente')
    })
  }
})

test('scope-filter — perguntas out-of-scope', async (t) => {
  const outOfScopeQuestions = [
    'Qual a previsão do tempo amanhã?',
    'Quem ganhou a Champions?',
    'Receita de bolo de chocolate',
    'Quanto é 2 + 2?',
    'Capital da França',
    'Qual o melhor restaurante da cidade?',
  ]
  for (const q of outOfScopeQuestions) {
    await t.test(`out-of-scope: ${q}`, () => {
      const r = isInScope(q)
      assert.equal(r.inScope, false, `Esperava out-of-scope, got ${JSON.stringify(r)}`)
      assert.equal(r.reason, 'out_of_scope')
    })
  }
})

test('scope-filter — cumprimentos identificados separadamente', async (t) => {
  const greetings = ['olá', 'oi', 'Bom dia', 'BOA TARDE', 'hello']
  for (const q of greetings) {
    await t.test(`greeting: ${q}`, () => {
      const r = isInScope(q)
      assert.equal(r.inScope, false)
      assert.equal(r.reason, 'greeting')
    })
  }
})

test('scope-filter — caixa alta/acentos não derruba match', () => {
  assert.equal(isInScope('FÉRIAS DO JOSÉ').inScope, true)
  assert.equal(isInScope('intermitentes').inScope, true)
  assert.equal(isInScope('Cobertura?').inScope, true)
})

test('scope-filter — buildOutOfScopeAnswer inclui supported topics', () => {
  const ans = buildOutOfScopeAnswer('out_of_scope')
  for (const topic of SUPPORTED_TOPICS) {
    assert.ok(ans.includes(topic), `resposta deve mencionar tópico: ${topic}`)
  }
  assert.match(ans, /fora do escopo/i)
})

test('scope-filter — buildOutOfScopeAnswer greeting é simpática', () => {
  const ans = buildOutOfScopeAnswer('greeting')
  assert.match(ans, /Olá/)
  assert.match(ans, /Oráculo/i)
})

test('scope-filter — string vazia trata como out_of_scope', () => {
  const r = isInScope('')
  assert.equal(r.inScope, false)
  assert.equal(r.reason, 'out_of_scope')
})
