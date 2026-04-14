import test from 'node:test'
import assert from 'node:assert'
import { CoverageEngine } from '../../src/modules/coverage-engine/coverage-engine'

test('CoverageEngine', async (t) => {
  await t.test('should have getOptions method', () => {
    assert.strictEqual(typeof CoverageEngine.getOptions, 'function')
  })
  await t.test('should have getTimeline method', () => {
    assert.strictEqual(typeof CoverageEngine.getTimeline, 'function')
  })
  await t.test('should have detectChaining method', () => {
    assert.strictEqual(typeof CoverageEngine.detectChaining, 'function')
  })
})
