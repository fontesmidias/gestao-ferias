import test from 'node:test'
import assert from 'node:assert'
import { build } from '../helper'

test('Tenants API Integration', async (t) => {
  const app = await build(t)

  await t.test('Should create a new tenant successfully', async () => {
    // Usando timestamp para garantir unicidade no teste real
    const timestamp = Date.now().toString().slice(-6)
    const mockCnpj = `00.111.222/0001-${timestamp.slice(0, 2)}`

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: {
        name: `Tenant Test ${timestamp}`,
        cnpj: mockCnpj
      }
    })

    assert.strictEqual(res.statusCode, 201)
    const json = JSON.parse(res.payload)
    
    assert.strictEqual(json.status, 'created')
    assert.ok(json.id)
  })

  await t.test('Should reject invalid CNPJ format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: {
        name: 'Invalid Tenant',
        cnpj: '123' // Falha no JSON Schema da rota
      }
    })

    assert.strictEqual(res.statusCode, 400)
    const json = JSON.parse(res.payload)
    assert.strictEqual(json.error, 'Bad Request')
  })

  await t.test('Should return 409 Conflict for duplicate CNPJ', async () => {
    const timestamp = Date.now().toString().slice(-6)
    const mockCnpj = `99.888.777/0001-${timestamp.slice(0, 2)}`

    // Create first time
    await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: 'Tenant A', cnpj: mockCnpj }
    })

    // Try to create again with same CNPJ
    const resConflict = await app.inject({
      method: 'POST',
      url: '/api/v1/tenants',
      payload: { name: 'Tenant B', cnpj: mockCnpj }
    })

    assert.strictEqual(resConflict.statusCode, 409)
    const json = JSON.parse(resConflict.payload)
    assert.strictEqual(json.error, 'Conflict')
    assert.ok(json.message.includes('já cadastrados'))
  })
})
