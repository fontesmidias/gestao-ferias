import test from 'node:test'
import assert from 'node:assert'
import { EmailService } from '../../src/modules/notifications/email-service'

test('EmailService', async (t) => {
  await t.test('should have sendMail method', () => {
    assert.strictEqual(typeof EmailService.sendMail, 'function')
  })

  await t.test('sendMail should be an async function', () => {
    // AsyncFunction constructor name check
    assert.strictEqual(EmailService.sendMail.constructor.name, 'AsyncFunction')
  })
})
