import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import * as bcrypt from 'bcryptjs'
import 'dotenv/config'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Starting seed...')

  // ─── Tenants ───────────────────────────────────────────
  const tenantA = await prisma.tenant.upsert({
    where: { cnpj: '11222333000144' },
    update: {},
    create: { name: 'Green House Terceirização', cnpj: '11222333000144' }
  })

  console.log(`Tenant A: ${tenantA.name} (${tenantA.id})`)

  // ─── Admin User ────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Senha@123', 10)

  const admin = await prisma.user.upsert({
    where: { email_tenantId: { email: 'admin@greenhouse.com', tenantId: tenantA.id } },
    update: {},
    create: {
      email: 'admin@greenhouse.com',
      name: 'Admin RH',
      passwordHash,
      role: 'ADMIN',
      tenantId: tenantA.id
    }
  })
  console.log(`Admin: ${admin.email}`)

  // ─── Workplaces (3 postos) ─────────────────────────────
  const wp1 = await prisma.workplace.create({
    data: { name: 'INEP - Sede', address: 'SIG Quadra 6, Brasília-DF', client: 'INEP/MEC', minStaff: 4, tenantId: tenantA.id }
  })
  const wp2 = await prisma.workplace.create({
    data: { name: 'Tribunal Regional Federal', address: 'SGAS 600, Brasília-DF', client: 'TRF 1ª Região', minStaff: 6, tenantId: tenantA.id }
  })
  const wp3 = await prisma.workplace.create({
    data: { name: 'Hospital de Base', address: 'SMHS Área Especial, Brasília-DF', client: 'SES-DF', minStaff: 8, tenantId: tenantA.id }
  })
  console.log('3 Workplaces criados')

  // ─── Positions ─────────────────────────────────────────
  const pos1a = await prisma.workplacePosition.create({
    data: { workplaceId: wp1.id, role: 'Agente de Portaria', shiftPattern: '12x36', requiredCount: 2, tenantId: tenantA.id }
  })
  const pos1b = await prisma.workplacePosition.create({
    data: { workplaceId: wp1.id, role: 'Recepcionista', shiftPattern: '8h', requiredCount: 2, tenantId: tenantA.id }
  })
  const pos2a = await prisma.workplacePosition.create({
    data: { workplaceId: wp2.id, role: 'Vigilante', shiftPattern: '12x36', requiredCount: 4, tenantId: tenantA.id }
  })
  const pos2b = await prisma.workplacePosition.create({
    data: { workplaceId: wp2.id, role: 'Controlador de Acesso', shiftPattern: '8h', requiredCount: 2, tenantId: tenantA.id }
  })
  const pos3a = await prisma.workplacePosition.create({
    data: { workplaceId: wp3.id, role: 'Maqueiro', shiftPattern: '12x36', requiredCount: 4, tenantId: tenantA.id }
  })
  const pos3b = await prisma.workplacePosition.create({
    data: { workplaceId: wp3.id, role: 'Auxiliar de Limpeza', shiftPattern: '8h', requiredCount: 4, tenantId: tenantA.id }
  })
  console.log('6 Positions criadas')

  // ─── Employees (10 efetivos + 2 feristas) ──────────────
  const employeesData = [
    { name: 'Carlos Silva', cpf: '11111111101', position: 'Agente de Portaria', employeeType: 'EFETIVO', hireDate: '2022-03-15', salary: 2200, positionRef: pos1a },
    { name: 'Ana Santos', cpf: '22222222202', position: 'Agente de Portaria', employeeType: 'EFETIVO', hireDate: '2021-07-01', salary: 2200, positionRef: pos1a },
    { name: 'Maria Oliveira', cpf: '33333333303', position: 'Recepcionista', employeeType: 'EFETIVO', hireDate: '2023-01-10', salary: 1800, positionRef: pos1b },
    { name: 'João Pereira', cpf: '44444444404', position: 'Recepcionista', employeeType: 'EFETIVO', hireDate: '2022-11-20', salary: 1800, positionRef: pos1b },
    { name: 'Pedro Costa', cpf: '55555555505', position: 'Vigilante', employeeType: 'EFETIVO', hireDate: '2020-05-12', salary: 2500, positionRef: pos2a },
    { name: 'Lucas Ferreira', cpf: '66666666606', position: 'Vigilante', employeeType: 'EFETIVO', hireDate: '2021-02-28', salary: 2500, positionRef: pos2a },
    { name: 'Fernanda Lima', cpf: '77777777707', position: 'Controlador de Acesso', employeeType: 'EFETIVO', hireDate: '2023-06-15', salary: 2000, positionRef: pos2b },
    { name: 'Ricardo Souza', cpf: '88888888808', position: 'Maqueiro', employeeType: 'EFETIVO', hireDate: '2022-09-01', salary: 1900, positionRef: pos3a },
    { name: 'Camila Rodrigues', cpf: '99999999909', position: 'Maqueiro', employeeType: 'EFETIVO', hireDate: '2021-12-10', salary: 1900, positionRef: pos3a },
    { name: 'Bruno Almeida', cpf: '10101010110', position: 'Auxiliar de Limpeza', employeeType: 'EFETIVO', hireDate: '2023-03-20', salary: 1600, positionRef: pos3b },
    // Feristas
    { name: 'Roberto Dias (Ferista)', cpf: '20202020220', position: 'Ferista Geral', employeeType: 'FERISTA', hireDate: '2024-01-15', salary: 2200, positionRef: null },
    { name: 'Sandra Mendes (Ferista)', cpf: '30303030330', position: 'Ferista Geral', employeeType: 'FERISTA', hireDate: '2024-03-01', salary: 2000, positionRef: null },
  ]

  const createdEmployees = []
  for (const emp of employeesData) {
    const created = await prisma.employee.create({
      data: {
        name: emp.name,
        cpf: emp.cpf,
        position: emp.position,
        employeeType: emp.employeeType,
        hireDate: new Date(emp.hireDate),
        salary: emp.salary,
        workplaceId: emp.positionRef ? (await prisma.workplacePosition.findUnique({ where: { id: emp.positionRef.id } }))?.workplaceId : undefined,
        tenantId: tenantA.id
      }
    })
    createdEmployees.push({ ...created, positionRef: emp.positionRef })
  }
  console.log(`${createdEmployees.length} Employees criados`)

  // ─── Allocations (efetivos alocados em seus postos) ────
  for (const emp of createdEmployees) {
    if (emp.positionRef) {
      await prisma.workplaceAllocation.create({
        data: {
          employeeId: emp.id,
          workplacePositionId: emp.positionRef.id,
          startDate: new Date(emp.hireDate),
          status: 'ACTIVE',
          tenantId: tenantA.id
        }
      })
    }
  }
  console.log('Alocações criadas para efetivos')

  console.log('\n✓ Seed finalizado com sucesso!')
  console.log('  Login: admin@greenhouse.com / Senha@123')
  console.log(`  Tenant: ${tenantA.name}`)
  console.log('  3 postos, 6 posições, 12 colaboradores (10 efetivos + 2 feristas)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
