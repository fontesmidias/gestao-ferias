import test from 'node:test'
import assert from 'node:assert'
import { WebhookService } from '../../src/modules/integrations/webhook-service'

test('WebhookService - generateSignature', async (t) => {
  await t.test('should return a string', () => {
    const signature = WebhookService.generateSignature('payload', 'secret')
    assert.strictEqual(typeof signature, 'string')
  })

  await t.test('should be deterministic (same input = same output)', () => {
    const sig1 = WebhookService.generateSignature('test-payload', 'my-secret')
    const sig2 = WebhookService.generateSignature('test-payload', 'my-secret')
    assert.strictEqual(sig1, sig2)
  })

  await t.test('should produce different outputs for different secrets', () => {
    const sig1 = WebhookService.generateSignature('same-payload', 'secret-a')
    const sig2 = WebhookService.generateSignature('same-payload', 'secret-b')
    assert.notStrictEqual(sig1, sig2)
  })

  await t.test('should produce different outputs for different payloads', () => {
    const sig1 = WebhookService.generateSignature('payload-a', 'same-secret')
    const sig2 = WebhookService.generateSignature('payload-b', 'same-secret')
    assert.notStrictEqual(sig1, sig2)
  })

  await t.test('should return a valid hex string', () => {
    const signature = WebhookService.generateSignature('data', 'key')
    assert.match(signature, /^[0-9a-f]{64}$/)
  })
})
