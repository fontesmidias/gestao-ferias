// One-off helper: regenera fixtures Tirvu a partir do exemplo base.
// Rodar manualmente quando o exemplo base mudar:
//   cd backend-api && npx tsx test/fixtures/imports/build-fixtures.ts
//
// Não é parte de nenhuma suite automatizada.

import * as XLSX from 'xlsx'
import * as path from 'node:path'

const BASE = path.resolve(__dirname, '../../../../docs/exemplo/Colaboradores, para fins de validação.xlsx')
const OUT_DIR = __dirname

function readBase(): XLSX.WorkBook {
  return XLSX.readFile(BASE, { cellDates: false, raw: false })
}

function writeWb(wb: XLSX.WorkBook, name: string) {
  XLSX.writeFile(wb, path.join(OUT_DIR, name))
  console.log(`✔ ${name}`)
}

function cloneWorkbook(wb: XLSX.WorkBook): XLSX.WorkBook {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return XLSX.read(buf, { type: 'buffer', cellDates: false, raw: false })
}

// ---------- 1. tirvu-anatel-50.xlsx (cópia exata do base) ----------
{
  const wb = readBase()
  writeWb(wb, 'tirvu-anatel-50.xlsx')
}

// ---------- 2. tirvu-mixed-errors.xlsx (5 linhas com erros) ----------
{
  const wb = readBase()
  const sheet = wb.Sheets['Plan1']
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  })

  // data[0] = header. data[1..N] = linhas. Modificar 5 linhas.
  if (data.length >= 6) {
    // linha 1: CPF inválido (dígito errado)
    data[1] = [...(data[1] as unknown[])]
    ;(data[1] as unknown[])[1] = '11111111111'

    // linha 2: hireDate futura
    data[2] = [...(data[2] as unknown[])]
    ;(data[2] as unknown[])[8] = '01/01/2099'

    // linha 3: status inválido
    data[3] = [...(data[3] as unknown[])]
    ;(data[3] as unknown[])[5] = 'INVALIDO'

    // linha 4: name vazio
    data[4] = [...(data[4] as unknown[])]
    ;(data[4] as unknown[])[2] = ''

    // linha 5: hireDate fora do formato
    data[5] = [...(data[5] as unknown[])]
    ;(data[5] as unknown[])[8] = '2024-01-15'
  }

  const newSheet = XLSX.utils.aoa_to_sheet(data as unknown[][])
  const newWb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(newWb, newSheet, 'Plan1')
  writeWb(newWb, 'tirvu-mixed-errors.xlsx')
}

// ---------- 3. tirvu-invalid-header.xlsx (45 cols — falta 1) ----------
{
  const wb = readBase()
  const sheet = wb.Sheets['Plan1']
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  })

  // remove última coluna (Data Log) de todas as linhas
  const trimmed = data.map((row) => (row as unknown[]).slice(0, 45))
  const newSheet = XLSX.utils.aoa_to_sheet(trimmed as unknown[][])
  const newWb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(newWb, newSheet, 'Plan1')
  writeWb(newWb, 'tirvu-invalid-header.xlsx')
}

// ---------- 4. tirvu-bad-sheet-name.xlsx (sheet renomeada) ----------
{
  const wb = cloneWorkbook(readBase())
  const sheet = wb.Sheets['Plan1']
  delete wb.Sheets['Plan1']
  wb.SheetNames = wb.SheetNames.filter((n) => n !== 'Plan1')
  wb.Sheets['Sheet1'] = sheet
  wb.SheetNames.push('Sheet1')
  writeWb(wb, 'tirvu-bad-sheet-name.xlsx')
}

console.log('Done.')
