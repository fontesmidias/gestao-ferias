/**
 * Script de recuperacao de acesso do SuperAdmin.
 * Uso: npx tsx scripts/reset-superadmin.ts --password NovaSenha123!
 * Ou via Docker: docker exec -it <container> npx tsx scripts/reset-superadmin.ts --password NovaSenha123!
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import * as bcrypt from 'bcryptjs'
import 'dotenv/config'

async function main() {
  const args = process.argv.slice(2)
  const passwordIdx = args.indexOf('--password')

  if (passwordIdx === -1 || !args[passwordIdx + 1]) {
    console.error('Uso: npx tsx scripts/reset-superadmin.ts --password <nova_senha>')
    console.error('A senha deve ter no minimo 6 caracteres.')
    process.exit(1)
  }

  const newPassword = args[passwordIdx + 1]

  if (newPassword.length < 6) {
    console.error('Erro: A senha deve ter no minimo 6 caracteres.')
    process.exit(1)
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  try {
    const superadmin = await prisma.user.findFirst({
      where: { role: 'SUPERADMIN' },
      select: { id: true, email: true, name: true }
    })

    if (!superadmin) {
      console.error('Erro: Nenhum SUPERADMIN encontrado no banco de dados.')
      console.error('Use a rota POST /api/v1/setup para criar o primeiro SUPERADMIN.')
      process.exit(1)
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)

    await prisma.user.update({
      where: { id: superadmin.id },
      data: { passwordHash }
    })

    console.log('=== SUPERADMIN RESET COM SUCESSO ===')
    console.log(`Email: ${superadmin.email}`)
    console.log(`Nome:  ${superadmin.name || '(sem nome)'}`)
    console.log(`ID:    ${superadmin.id}`)
    console.log('Senha atualizada. Faca login com a nova senha.')
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err.message)
  process.exit(1)
})
