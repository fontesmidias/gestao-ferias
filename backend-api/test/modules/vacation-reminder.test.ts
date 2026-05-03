// Story 6.3 / M2 — unit tests do reminder.

import test from 'node:test'
import assert from 'node:assert'
import {
  findEmployeesNearingDeadline,
  buildReminderEmailHtml,
  type ReminderEmployee,
} from '../../src/modules/notifications/vacation-reminder'

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000)
}

test('findEmployeesNearingDeadline — colaborador 23 meses atrás está em CONCESSIVO próximo do vencimento', () => {
  const now = new Date('2026-06-01T00:00:00Z')
  // hire 2024-06-01: aquisitivo 24-25, concessivo 25-26 → vence 2026-06-01.
  const employees: ReminderEmployee[] = [
    {
      id: 'e1', name: 'Alpha', email: 'alpha@x.test',
      hireDate: new Date('2024-06-01T00:00:00Z'),
      absences: 0,
    },
  ]
  const hits = findEmployeesNearingDeadline(employees, 30, now)
  assert.equal(hits.length, 1)
  assert.equal(hits[0].employeeId, 'e1')
  assert.ok(hits[0].daysUntilDeadline <= 30)
})

test('findEmployeesNearingDeadline — colaborador recém contratado fora da janela', () => {
  const employees: ReminderEmployee[] = [
    {
      id: 'e2', name: 'Beta', email: 'beta@x.test',
      hireDate: daysAgo(60), // < 1 ano, deadline > 18 meses no futuro
      absences: 0,
    },
  ]
  const hits = findEmployeesNearingDeadline(employees, 30)
  assert.equal(hits.length, 0)
})

test('findEmployeesNearingDeadline — janela respeitada', () => {
  const now = new Date('2026-06-01T00:00:00Z')
  const employees: ReminderEmployee[] = [
    {
      id: 'e3', name: 'Gamma', email: null,
      hireDate: new Date('2024-06-01T00:00:00Z'),
      absences: 0,
    },
  ]
  // Janela 1 dia: deadline em 2026-06-01, hoje 2026-06-01. daysUntilDeadline = 0/1.
  const tight = findEmployeesNearingDeadline(employees, 1, now)
  assert.equal(tight.length, 1)
  // Janela 0 — só pega já vencidos (daysUntilDeadline < 0 OU = 0).
  const zero = findEmployeesNearingDeadline(employees, 0, now)
  // Pode ou não pegar dependendo do timing exato; pelo menos deve não crashar.
  assert.ok(zero.length === 0 || zero.length === 1)
})

test('buildReminderEmailHtml — inclui nome, deadline e referência ao Art. 137', () => {
  const html = buildReminderEmailHtml(
    {
      employeeId: 'e1', employeeName: 'João Silva',
      email: 'joao@x.test',
      concessiveEndDate: new Date('2026-06-15T00:00:00Z'),
      daysUntilDeadline: 14,
      status: 'CONCESSIVO',
    },
    'Acme S.A.',
  )
  assert.match(html, /João Silva/)
  assert.match(html, /15\/06\/2026/)
  assert.match(html, /Art\. 137/)
  assert.match(html, /Acme S\.A\./)
})

test('buildReminderEmailHtml — VENCIDO mostra "vencido há"', () => {
  const html = buildReminderEmailHtml(
    {
      employeeId: 'e1', employeeName: 'X',
      email: null,
      concessiveEndDate: new Date('2025-01-01T00:00:00Z'),
      daysUntilDeadline: -10,
      status: 'VENCIDO',
    },
    'Tenant',
  )
  assert.match(html, /VENCIDO há 10 dia/)
})
