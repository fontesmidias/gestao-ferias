/**
 * Importa postos da planilha externa para um tenant.
 *
 * Uso:
 *   DATABASE_URL=... npx tsx scripts/seed-workplaces-from-xlsx.ts \
 *     --tenant <tenantId> --file <path/to/.xlsx>
 *
 * Idempotente: usa (tenantId, externalId) como chave de upsert.
 * Colunas mapeadas (Postos de Serviço.xlsx):
 *   A=ID  B=Nome/Apelido  C=Razão Social  D=CNPJ
 *   E=Responsável  F=Telefone  G=E-mail
 *   H=CEP  I=Logradouro  J=Número  K=Complemento
 *   L=Bairro  M=Cidade  N=UF
 *   R=Status Contrato (col 17)
 *   AD=Usuário (col 29)  AE=Data Atualização (col 30)
 * Ignoradas por instrução do owner (cols O–Q e S–AC).
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx')

interface Args {
  tenantId: string
  file: string
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const out: Partial<Args> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tenant') out.tenantId = argv[++i]
    else if (argv[i] === '--file') out.file = argv[++i]
  }
  if (!out.tenantId || !out.file) {
    console.error('Uso: --tenant <id> --file <path.xlsx>')
    process.exit(2)
  }
  return out as Args
}

function pick(row: any[], idx: number): string | null {
  const v = row[idx]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length === 0 ? null : s
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null
  // "11/18/2025 15:47:56" — formato MM/DD/YYYY HH:mm:ss
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/)
  if (m) {
    const [, mm, dd, yyyy, h, mi, s] = m
    const d = new Date(Date.UTC(
      Number(yyyy), Number(mm) - 1, Number(dd),
      Number(h), Number(mi), Number(s),
    ))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const fallback = new Date(raw)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

async function main() {
  const args = parseArgs()
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  const tenant = await prisma.tenant.findUnique({ where: { id: args.tenantId } })
  if (!tenant) {
    console.error(`Tenant ${args.tenantId} não encontrado.`)
    process.exit(3)
  }
  console.log(`Tenant alvo: ${tenant.name} (${tenant.id})`)

  const wb = XLSX.readFile(args.file)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const dataRows = rows.slice(1)
  console.log(`Linhas a processar: ${dataRows.length}`)

  let created = 0
  let updated = 0
  let skipped = 0
  const errors: { row: number; reason: string }[] = []

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const rowNum = i + 2 // human-friendly (header é row 1)
    const externalId = pick(row, 0)
    const name = pick(row, 1)

    if (!name) {
      skipped++
      continue
    }

    const payload = {
      tenantId: args.tenantId,
      name,
      legalName: pick(row, 2),
      cnpj: pick(row, 3),
      externalId,
      responsible: pick(row, 4),
      phone: pick(row, 5),
      email: pick(row, 6),
      cep: pick(row, 7),
      street: pick(row, 8),
      number: pick(row, 9),
      complement: pick(row, 10),
      neighborhood: pick(row, 11),
      city: pick(row, 12),
      state: pick(row, 13),
      contractStatus: pick(row, 17),
      importedBy: pick(row, 29),
      importedAt: parseDate(pick(row, 30)),
    }

    try {
      // Upsert manual: se a planilha trouxer externalId, esse é a chave única
      // (evita colisão por nomes duplicados como "GENERAL C/INTRA" / "MINISTÉRIO DA A").
      // Sem externalId, fallback por nome.
      let existing = null
      if (externalId) {
        existing = await prisma.workplace.findFirst({
          where: { tenantId: args.tenantId, externalId },
        })
      } else {
        existing = await prisma.workplace.findFirst({
          where: { tenantId: args.tenantId, name, externalId: null },
        })
      }

      if (existing) {
        await prisma.workplace.update({
          where: { id: existing.id },
          data: payload,
        })
        updated++
      } else {
        await prisma.workplace.create({ data: payload })
        created++
      }
    } catch (err: any) {
      errors.push({ row: rowNum, reason: err?.message ?? String(err) })
    }
  }

  console.log('---')
  console.log(`Criados: ${created}`)
  console.log(`Atualizados: ${updated}`)
  console.log(`Pulados (sem nome): ${skipped}`)
  console.log(`Erros: ${errors.length}`)
  for (const e of errors.slice(0, 10)) {
    console.log(`  row ${e.row}: ${e.reason}`)
  }
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
