/**
 * Enriquece colaboradores existentes com campos da planilha (Colaboradores).
 * NÃO cria duplicatas — matcheia por CPF normalizado.
 *
 * Uso:
 *   DATABASE_URL=... npx tsx scripts/enrich-employees-from-xlsx.ts \
 *     --tenant <tenantId> --file <path/to/.xlsx>
 *
 * Campos preenchidos:
 *   - hireDate, birthDate, terminationDate, registration (se vazio)
 *   - position, shift, branch, status (sempre, força sync)
 *   - phone, unionName, salary
 *   - address (JSON estruturado)
 *   - personalData (JSON com sexo, PCD, parents, RG, PIS, CTPS, email)
 *   - geofencingFlags (foraDaCerca, semGeo)
 *   - bankDataEnc/Iv/Tag (criptografado AES-256-GCM via bank-data-encryption)
 *   - workplaceId (lookup pelo nome em Lotação)
 */

process.env.BANK_DATA_ENCRYPTION_KEY ??= '0+5mYyV8DG7BUSmJ6ugef35NARVs5HJ+TbogSnOD0D4='

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { encryptBankData } from '../src/modules/imports/bank-data-encryption'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx')

interface Args { tenantId: string; file: string }

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

// "01/08/2025" → Date (DD/MM/YYYY).
function parseBrDate(raw: string | null): Date | null {
  if (!raw) return null
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
  return Number.isNaN(d.getTime()) ? null : d
}

function normalizeCpf(cpf: string | null): string | null {
  if (!cpf) return null
  return cpf.replace(/\D/g, '')
}

function parseDecimal(raw: string | null): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isNaN(n) ? null : n
}

async function main() {
  const args = parseArgs()
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

  const tenant = await prisma.tenant.findUnique({ where: { id: args.tenantId } })
  if (!tenant) {
    console.error(`Tenant ${args.tenantId} não encontrado.`)
    process.exit(3)
  }
  console.log(`Tenant alvo: ${tenant.name}`)

  // Mapa de workplaces por nome (uppercase) para lookup de Lotação.
  const workplaces = await prisma.workplace.findMany({
    where: { tenantId: args.tenantId },
    select: { id: true, name: true },
  })
  const workplaceMap = new Map<string, string>()
  for (const wp of workplaces) {
    workplaceMap.set(wp.name.trim().toUpperCase(), wp.id)
  }

  const wb = XLSX.readFile(args.file)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const dataRows = rows.slice(1)
  console.log(`Linhas a processar: ${dataRows.length}`)

  let matched = 0
  let unmatched = 0
  let updated = 0
  let workplaceLinked = 0
  const noMatch: string[] = []

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const cpfRaw = pick(row, 1)
    const cpfNorm = normalizeCpf(cpfRaw)
    if (!cpfNorm) continue

    // Match por CPF (DB armazena sem máscara).
    const employee = await prisma.employee.findFirst({
      where: { tenantId: args.tenantId, cpf: cpfNorm },
    })

    if (!employee) {
      unmatched++
      noMatch.push(`${cpfRaw} - ${pick(row, 2)}`)
      continue
    }
    matched++

    const lotacao = pick(row, 7)
    const workplaceId = lotacao ? workplaceMap.get(lotacao.toUpperCase()) ?? null : null
    if (workplaceId && !employee.workplaceId) workplaceLinked++

    const personalData: Record<string, unknown> = {
      ...((employee.personalData as Record<string, unknown>) ?? {}),
      gender: pick(row, 25),
      pcd: pick(row, 3),
      disability: pick(row, 4),
      parents: { father: pick(row, 12), mother: pick(row, 13) },
      shiftStartDate: pick(row, 16),
      documents: {
        rgNumber: pick(row, 19),
        rgIssuer: pick(row, 20),
        rgIssuedAt: pick(row, 21),
        pisPasep: pick(row, 22),
        ctpsNumber: pick(row, 23),
        ctpsSerie: pick(row, 24),
      },
      email: pick(row, 27),
      salaryComplement: parseDecimal(pick(row, 37)),
      salaryExtra: parseDecimal(pick(row, 38)),
      jornada: pick(row, 15),
      lotacaoExternal: lotacao,
    }

    const address: Record<string, unknown> = {
      cep: pick(row, 28),
      street: pick(row, 29),
      number: pick(row, 30),
      complement: pick(row, 31),
      neighborhood: pick(row, 32),
      state: pick(row, 33),
      city: pick(row, 34),
    }

    const geofencingFlags = {
      foraDaCerca: pick(row, 17),
      semGeo: pick(row, 18),
    }

    // Bank data → criptografar se houver pelo menos chavePix.
    let bankPatch: { bankDataEnc?: Buffer; bankDataIv?: Buffer; bankDataTag?: Buffer } = {}
    const tipoPix = pick(row, 39)
    const chavePix = pick(row, 40)
    if (tipoPix && chavePix) {
      try {
        const blob = encryptBankData(
          {
            tipoPix, chavePix,
            banco: pick(row, 41) ?? '',
            tipoConta: pick(row, 42) ?? '',
            agencia: pick(row, 43) ?? '',
            conta: pick(row, 44) ?? '',
          },
          args.tenantId,
        )
        bankPatch = { bankDataEnc: blob.enc, bankDataIv: blob.iv, bankDataTag: blob.tag }
      } catch (err: any) {
        console.warn(`  CPF ${cpfNorm}: falha ao cifrar bankData — ${err.message}`)
      }
    }

    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        // Sobrescreve: planilha é fonte da verdade para esses campos.
        name: pick(row, 2) ?? employee.name,
        status: (pick(row, 5) ?? employee.status).toUpperCase(),
        branch: pick(row, 6) ?? employee.branch,
        position: pick(row, 14) ?? employee.position,
        shift: pick(row, 15) ?? employee.shift,
        phone: pick(row, 26) ?? employee.phone,
        unionName: pick(row, 35) ?? employee.unionName,
        salary: parseDecimal(pick(row, 36)) ?? employee.salary,
        // Datas — só seta se presente na planilha.
        birthDate: parseBrDate(pick(row, 11)) ?? employee.birthDate,
        hireDate: parseBrDate(pick(row, 8)) ?? employee.hireDate,
        terminationDate: parseBrDate(pick(row, 9)) ?? employee.terminationDate,
        // Matrícula — só preenche se vazio (evita sobrescrever ID Tirvu).
        registration: employee.registration ?? pick(row, 10),
        // Workplace FK — só liga se ainda não tiver.
        workplaceId: employee.workplaceId ?? workplaceId,
        workplace: lotacao ?? employee.workplace,
        // JSON enriquecidos.
        personalData: personalData as never,
        address: address as never,
        geofencingFlags: geofencingFlags as never,
        ...bankPatch,
      },
    })
    updated++
  }

  console.log('---')
  console.log(`Matched (por CPF): ${matched}`)
  console.log(`Não encontrados:   ${unmatched}`)
  console.log(`Atualizados:        ${updated}`)
  console.log(`Workplace vinculados (novos): ${workplaceLinked}`)
  if (noMatch.length > 0) {
    console.log('--- Não encontrados:')
    for (const n of noMatch.slice(0, 10)) console.log('  ', n)
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
