import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting seed...')

  // 1. Reclame um Tenant (Empresa A)
  const tenantA = await prisma.tenant.upsert({
    where: { cnpj: '11.222.333/0001-44' },
    update: {},
    create: {
      name: 'Indústrias Stark',
      cnpj: '11.222.333/0001-44',
    }
  })

  // 2. Reclame um Tenant (Empresa B)
  const tenantB = await prisma.tenant.upsert({
    where: { cnpj: '55.666.777/0001-88' },
    update: {},
    create: {
      name: 'Oscorp',
      cnpj: '55.666.777/0001-88',
    }
  })

  // 3. Usuário Admin Empresa A
  await prisma.user.upsert({
    where: { email: 'tony@stark.com' },
    update: {},
    create: {
      email: 'tony@stark.com',
      name: 'Tony Stark',
      role: 'ADMIN',
      tenantId: tenantA.id
    }
  })

  // 4. Usuário Admin Empresa B
  await prisma.user.upsert({
    where: { email: 'norman@oscorp.com' },
    update: {},
    create: {
      email: 'norman@oscorp.com',
      name: 'Norman Osborn',
      role: 'ADMIN',
      tenantId: tenantB.id
    }
  })

  // 5. Colaborador Empresa A
  await prisma.employee.upsert({
    where: { cpf: '123.456.789-00' },
    update: {},
    create: {
      name: 'Peter Parker',
      cpf: '123.456.789-00',
      position: 'Fotógrafo',
      hireDate: new Date('2023-01-10'),
      tenantId: tenantA.id
    }
  })

  console.log('Seed finished successfully.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
