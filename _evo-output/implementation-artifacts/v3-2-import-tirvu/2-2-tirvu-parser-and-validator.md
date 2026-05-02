# Story 2.2: Parser tirvu-v1 (header detection + streaming row iterator) + import-validator (zod + CPF check + dd/MM/yyyy)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a desenvolvedor backend,
I want dois módulos novos em `src/modules/imports/`: (a) `tirvu-parser.ts` que abre `.xlsx`, detecta o header tirvu-v1 (sheet `Plan1`, 46 colunas exatas), e expõe um async iterator que entrega cada linha tipada como `TirvuRow`; (b) `import-validator.ts` que recebe `TirvuRow` e devolve `{ status: 'valid' | 'invalid', errors: string[] }` aplicando regras de negócio (CPF dígito verificador, datas no formato `dd/MM/yyyy`, status enum, name não-vazio),
so that o worker da Story 3.1 (apply chunk) possa processar arquivos sem inventar formato e a UI de preview (Story 4.x) possa mostrar status correto por linha.

## Acceptance Criteria

### Detecção de header (FR5)

1. **`tirvuParser.detect(workbook)`** retorna `'tirvu-v1'` se a primeira sheet do workbook se chama `Plan1` e a primeira linha contém **exatamente** 46 cabeçalhos na ordem do `TIRVU_V1_HEADER` (ver Dev Notes para a lista completa). Comparação **case-insensitive e trim**.

2. Se a primeira sheet **não** existe, ou tem nome diferente de `Plan1`, ou tem ≠46 colunas, ou qualquer header divergente, `detect` retorna `null`. Caller (worker) é responsável por transitar `ImportJob` para `FAILED` com `failureReason='INVALID_TIRVU_HEADER'`.

3. `detect` **não** carrega rows na RAM — só lê a primeira linha. Aceita `Buffer` ou `WorkBook` (lib `xlsx`).

### Streaming row iterator (FR11, NFR — memória)

4. **`tirvuParser.parseRows(workbook): AsyncIterableIterator<TirvuRow>`** itera a sheet `Plan1` linha por linha (a partir da linha 2), emitindo um objeto `TirvuRow` por linha.

5. Para uma planilha com 5.000 linhas, o consumo de memória do iterator deve permanecer **≤512MB** (V8 default heap). A lib `xlsx@0.18.5` carrega o workbook em memória de uma vez, mas a conversão para `TirvuRow` é feita **lazy** (uma linha por vez via generator) — verificado por test fixture grande (T7).

6. Cada `TirvuRow` tem **46 chaves tipadas** correspondendo aos cabeçalhos Tirvu, mas com nomes em camelCase TypeScript (mapeamento explícito — ver Dev Notes "Mapeamento de colunas").

7. **Normalização aplicada** durante parse:
   - Trim de strings
   - Capitalização preservada (não force lowercase)
   - Strings vazias `""` → `null`
   - Datas dd/MM/yyyy → `Date` JS no UTC (ou `null` se vazio)
   - Booleans `"Sim"`/`"Não"` → `true`/`false` (case-insensitive); qualquer outro valor → `null`
   - Números formato pt-BR (`"1.500,00"`) → `1500.00` para campos de salário
   - **Nenhuma** validação aqui — parser só transforma dados; validator decide se é válido.

8. **Datas inválidas** (formato errado, dia >31, mês>12) → o campo Date no `TirvuRow` recebe a string original (não converte) e o validator captura como erro `"Data ... fora do formato dd/MM/yyyy"` no AC11.

### Validador (FR12)

9. **`importValidator.validate(row: TirvuRow): { status, errors }`** retorna `status: 'valid'` se **todas** as regras a seguir passam, senão `'invalid'` com array `errors` (strings em pt-BR):
   - **CPF:** algoritmo dígito verificador (mod 11). Aceita com ou sem máscara (`123.456.789-01` ou `12345678901`). Inválido → `"CPF inválido (dígito verificador não confere)"` ou `"CPF ausente"` se vazio.
   - **name (Colaborador):** não-vazio após trim → senão `"Nome do colaborador ausente"`.
   - **hireDate (Admissão):** presente, parseável dd/MM/yyyy, **não-futura** (≤ hoje). Erros: `"Data de admissão fora do formato dd/MM/yyyy"`, `"Data de admissão ausente"`, `"Data de admissão futura não é permitida"`.
   - **status (Status):** valor em `['ATIVO', 'DEMITIDO', 'AFASTADO']`. Outro → `"Status do colaborador inválido (esperado: ATIVO, DEMITIDO ou AFASTADO)"`.
   - **birthDate (Nascimento)** se presente: dd/MM/yyyy parseável e **idade ≥14 anos** (sanity, não regulamentar). Inválido → `"Data de nascimento inválida"` ou `"Data de nascimento implausível"`.
   - **terminationDate (Demissão)** se presente: dd/MM/yyyy parseável, ≥hireDate. Inválido → `"Data de demissão inválida"` ou `"Data de demissão anterior à admissão"`.

10. Se **>1 erro** for detectado, **todos** entram em `errors` (não para no primeiro). Operador vê lista completa.

11. Validator **não** mexe em CPF do banco (não checa duplicatas). Match e duplicata são responsabilidade da Story 2.3.

### Suite de testes (FR5, FR11, FR12, FR29)

12. **`test/modules/tirvu-parser.test.ts`**:
    - `detect` retorna `'tirvu-v1'` para fixture válido
    - `detect` retorna `null` para sheet com nome errado, header em ordem diferente, header com 45 ou 47 colunas
    - `parseRows` itera todas as N linhas do fixture e produz `TirvuRow` com 46 keys
    - normalização: trim, vazio→null, datas dd/MM/yyyy → Date, booleans Sim/Não → bool, salário pt-BR → number
    - datas inválidas mantém string original (não joga exceção)

13. **`test/modules/import-validator.test.ts`**:
    - CPFs válidos passam, CPFs com dígito errado falham com mensagem específica
    - status fora do enum falha
    - hireDate futura falha
    - hireDate ausente falha
    - múltiplos erros → array com todos
    - linha completamente válida → `{ status: 'valid', errors: [] }`

14. **Fixtures** ficam em `backend-api/test/fixtures/imports/`:
    - `tirvu-anatel-50.xlsx` — derivado de `docs/exemplo/Colaboradores, para fins de validação.xlsx` (50 linhas válidas conhecidas)
    - `tirvu-mixed-errors.xlsx` — 100 linhas, das quais ~5 têm erros propositais (CPF errado, hireDate futura, status inválido)
    - `tirvu-invalid-header.xlsx` — header com 1 coluna a menos (45)
    - `tirvu-bad-sheet-name.xlsx` — sheet renomeada para `Sheet1` em vez de `Plan1`
    - **NÃO criar fixture 5k para esta story** — performance test fica em Story 2.3 ou Epic 4 (NFR7). Para validar AC5, basta garantir lazy-iteration por contrato (não verificar memória real).

15. **Suite roda em <30s** local (sem fixture grande). Comando: `node --test -r ts-node/register "test/modules/tirvu-parser.test.ts" "test/modules/import-validator.test.ts"`.

### Out-of-scope (NÃO implementar)

16. **NÃO criar `import-matcher.ts`** — Story 2.3.
17. **NÃO criar `import-applier.ts`** — Story 3.x.
18. **NÃO criar rotas REST `/imports/*`** — Stories 1.2, 1.3, 4.x.
19. **NÃO criar BullMQ worker** — Story 3.1.
20. **NÃO escrever em DB** — esta story é puramente in-memory (parse + validate).
21. **NÃO popular `previewSummary`** no `ImportJob` — Story 2.3.
22. **NÃO criar `error-report-builder.ts`** — Story 4.x.
23. **NÃO usar `@fastify/multipart`** — esta story não toca em rotas.
24. **NÃO modificar [src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts)** removendo `BankData`/`EncryptedBlob` da Story 5.1 — apenas adicionar `TirvuRow`, `ParserVersion`, `ValidationResult` e tipos auxiliares.

## Tasks / Subtasks

### T1 — Setup e dependências (AC: 9 — zod)

- [x] T1.1 Verificar [backend-api/package.json](backend-api/package.json) — `xlsx@0.18.5` já está. Confirmar.
- [x] T1.2 **Adicionar dep `zod`** (ainda não está). `cd backend-api && npm install zod` — versão recente estável (v3.23+ ou v4.x se disponível e compatível com Node 20). Conferir que adiciona em `dependencies` (não `devDependencies`).
- [x] T1.3 **Não** instalar `csv-parse`, `papaparse` ou `exceljs` — `xlsx` é a lib oficial do épico (Architecture §Dependencies linha 132).
- [x] T1.4 **Não** mexer em `engines.node` (já é `>=20` da Story 5.1).

### T2 — Tipos `TirvuRow` + `ValidationResult` + helpers (AC: 6, 9)

- [x] T2.1 Editar [backend-api/src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts), **mantendo intactos** `BankData` e `EncryptedBlob` (Story 5.1). Adicionar:
  ```ts
  export type ParserVersion = 'tirvu-v1' // futuro: | 'tirvu-v2'

  export interface TirvuRow {
    rowIndex: number  // 1-based, desconta header (linha 2 do .xlsx = rowIndex 1)
    rawRowIndex: number  // 0-based dentro do sheet (incluindo header) — útil pra error report

    // ===== Identificação =====
    tirvuId: string | null         // "ID"
    cpf: string | null             // "CPF" — sem máscara após normalização
    name: string | null            // "Colaborador"
    matricula: string | null       // "Matrícula"
    sexo: string | null            // "Sexo"
    nascimento: Date | string | null    // "Nascimento" — Date se válida, string se erro de parse
    email: string | null           // "E-mail"
    telefone: string | null        // "Telefone"

    // ===== Personal expandido =====
    pcd: boolean | null            // "PCD?"
    deficiencia: string | null     // "Deficiência"
    nomePai: string | null
    nomeMae: string | null
    rgNumero: string | null
    rgOrgao: string | null
    rgDataEmissao: Date | string | null
    pisPasep: string | null
    ctpsNumero: string | null
    ctpsSerie: string | null

    // ===== Emprego =====
    status: string | null          // "Status" — esperado ATIVO/DEMITIDO/AFASTADO
    empresa: string | null         // "Empresa" — vai para Employee.branch
    lotacao: string | null         // "Lotação" — vai para Employee.workplace
    admissao: Date | string | null // "Admissão"
    demissao: Date | string | null // "Demissão" — null para ativos
    cargo: string | null           // "Cargo" — vai para Employee.position
    jornada: string | null         // "Jornada de Trabalho" — vai para Employee.shift
    inicioJornada: Date | string | null // "Início na Jornada"
    sindicato: string | null       // "Sindicato" — vai para Employee.unionName

    // ===== Geofencing =====
    foraDaCerca: boolean | null    // "Fora da Cerca?"
    semGeo: boolean | null         // "Sem Geo?"

    // ===== Endereço =====
    cep: string | null
    endereco: string | null        // "Endereço" — logradouro
    enderecoNumero: string | null
    enderecoComplemento: string | null
    enderecoBairro: string | null
    enderecoUf: string | null
    enderecoCidade: string | null

    // ===== Salário =====
    salario: number | null         // "Salário" — pt-BR parsed
    salarioComplemento: number | null  // "Salário - Complemento"
    salarioExtra: number | null    // "Salário - Extra"

    // ===== Banco (NÃO criptografado neste tipo — encryption é em Story 3.x) =====
    tipoPix: string | null
    chavePix: string | null
    banco: string | null
    tipoConta: string | null
    agencia: string | null
    conta: string | null

    // ===== Metadata =====
    dataLog: Date | string | null  // "Data Log"
  }

  export interface ValidationResult {
    status: 'valid' | 'invalid'
    errors: string[]
  }
  ```
- [x] T2.2 Conferir manualmente que **46 chaves** funcionais foram declaradas (excluindo `rowIndex` e `rawRowIndex`, que são metadados do parser, não do header).

### T3 — Constante `TIRVU_V1_HEADER` + helpers de normalização (AC: 1, 7)

- [x] T3.1 Criar `backend-api/src/modules/imports/tirvu-parser.ts` com cabeçalho:
  ```ts
  // TODO(v3-3-rbac-data-driven): nada relacionado a RBAC neste arquivo;
  // marcador mantido por consistência com módulos vizinhos do épico.
  ```
- [x] T3.2 Definir constante exportada (a lista vem da inspeção do fixture real — **respeitar acentos e ortografia exata**, são comparados case-insensitive mas mantidos canônicos):
  ```ts
  export const TIRVU_V1_HEADER = [
    'ID', 'CPF', 'Colaborador', 'PCD?', 'Deficiência',
    'Status', 'Empresa', 'Lotação', 'Admissão', 'Demissão',
    'Matrícula', 'Nascimento', 'Nome do Pai', 'Nome da Mãe', 'Cargo',
    'Jornada de Trabalho', 'Início na Jornada', 'Fora da Cerca?', 'Sem Geo?',
    'RG - Número', 'RG - Órgão Emissor', 'RG - Data Emissão',
    'PIS/Pasep', 'CTPS - Número', 'CTPS - Série', 'Sexo',
    'Telefone', 'E-mail',
    'CEP', 'Endereço', 'Endereço - Número', 'Endereço - Complemento',
    'Endereço - Bairro', 'Endereço - UF', 'Endereço - Cidade',
    'Sindicato', 'Salário', 'Salário - Complemento', 'Salário - Extra',
    'Tipo PIX', 'Chave PIX', 'Banco', 'Tipo de Conta', 'Agência', 'Conta',
    'Data Log'
  ] as const
  ```
- [x] T3.3 Helpers de normalização (não exportados — internos do parser):
  ```ts
  function normHeader(s: string): string  // trim + lowercase
  function parseDateBR(s: string): Date | string  // dd/MM/yyyy → Date OR raw string em erro
  function parseBoolBR(s: string): boolean | null  // "Sim"/"Não" → true/false
  function parseNumberBR(s: string): number | null  // "1.500,00" → 1500.00
  function parseCpfNoMask(s: string): string | null
  function isCpfValid(cpf: string): boolean  // mod 11 — dois dígitos verificadores
  ```
  Cada helper aceita `null`/`undefined`/`""` e retorna `null` (sem lançar). `parseDateBR` retorna a string crua se inválida (decisão para validator capturar).

### T4 — `tirvuParser.detect` (AC: 1, 2, 3)

- [x] T4.1 Função exportada:
  ```ts
  import * as XLSX from 'xlsx'
  export function detect(input: Buffer | XLSX.WorkBook): ParserVersion | null
  ```
- [x] T4.2 Lógica:
  - Se `Buffer`, `XLSX.read(input, { type: 'buffer' })`.
  - Achar sheet `Plan1` (case-sensitive). Se não existe, `return null`.
  - `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false })` — `raw:false` faz o lib retornar strings formatadas (datas vêm como `"23/04/1985"` ao invés de número Excel).
  - Pegar `rows[0]` (cabeçalho). Comparar com `TIRVU_V1_HEADER` via `normHeader` (trim + lowercase) ambos lados, mesma ordem, mesmo length.
  - Match → `'tirvu-v1'`, senão `null`.
- [x] T4.3 **Não** lançar exceção se o arquivo não é xlsx (ex.: PDF renomeado) — `XLSX.read` lança internamente; capturar e retornar `null`. Caller decide o `failureReason`.

### T5 — `tirvuParser.parseRows` async iterator (AC: 4, 5, 6, 7, 8)

- [x] T5.1 Assinatura:
  ```ts
  export function parseRows(input: Buffer | XLSX.WorkBook): AsyncIterableIterator<TirvuRow>
  ```
- [x] T5.2 Implementar como `async function*` generator:
  - Carrega workbook (mesma logic do detect).
  - Pega sheet `Plan1`.
  - Usa `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false })` → array of arrays. Lib carrega tudo, mas o generator emite uma linha por vez (lazy do ponto de vista do **consumer**).
  - Skip linha 0 (header). Para cada `i = 1..n`: `yield buildTirvuRow(rows[i], i)`.
- [x] T5.3 `buildTirvuRow(rawArray, rowIndex)`:
  - Verifica que `rawArray.length` ≥46. Se menor (linha curta), preenche com `null` os faltantes.
  - Mapeia índice posicional → chave de `TirvuRow` (mapa de 46 entradas ordenado igual a `TIRVU_V1_HEADER`). Aplica normalizações por tipo (string/Date/boolean/number).
  - `rowIndex` = índice 1-based ignorando header (linha 2 do xlsx = `rowIndex: 1`).
  - `rawRowIndex` = índice 0-based incluindo header (linha 2 do xlsx = `rawRowIndex: 1`).
- [x] T5.4 Linhas **completamente vazias** (todas as 46 colunas null/empty) são **puladas** (não yielded) — usuários frequentemente deixam linhas em branco no fim.

### T6 — `import-validator.ts` (AC: 9, 10, 11)

- [x] T6.1 Criar `backend-api/src/modules/imports/import-validator.ts`. Cabeçalho com mesmo TODO `v3-3-rbac-data-driven`.
- [x] T6.2 Função exportada:
  ```ts
  import { z } from 'zod'
  import type { TirvuRow, ValidationResult } from './types'

  export function validate(row: TirvuRow): ValidationResult
  ```
- [x] T6.3 Implementar checks **acumulando** todos os erros num array (não early-return):
  - CPF: `isCpfValid(parseCpfNoMask(row.cpf))` (helpers do tirvu-parser, ou copiar/extrair para `imports/utils.ts` se quiser DRY).
  - name: `row.name && row.name.trim().length > 0`.
  - hireDate (admissao): tem que ser `Date` e `<= new Date()`. Se for `string` (raw — significa parse falhou), erro de formato.
  - status: in `['ATIVO', 'DEMITIDO', 'AFASTADO']` (case-insensitive — fazer `.toUpperCase()` antes de comparar).
  - birthDate (nascimento) opcional: se for Date, `now - date >= 14 anos`.
  - terminationDate (demissao) opcional: se for Date, ≥ admissao.
- [x] T6.4 Mensagens de erro **exatamente** como no AC9. Em pt-BR. Sem stack trace, sem placeholders não preenchidos.
- [x] T6.5 Retorna `{ status: errors.length === 0 ? 'valid' : 'invalid', errors }`.

### T7 — Fixtures de teste (AC: 14)

- [x] T7.1 Criar `backend-api/test/fixtures/imports/` (diretório novo).
- [x] T7.2 Copiar `docs/exemplo/Colaboradores, para fins de validação.xlsx` para `test/fixtures/imports/tirvu-anatel-50.xlsx` (manter como está — fixture válido).
- [x] T7.3 Gerar `tirvu-mixed-errors.xlsx` programaticamente via script de fixture. Sugestão: criar `backend-api/test/fixtures/imports/build-fixtures.ts` (não roda no test — só helper one-off):
  - Ler `tirvu-anatel-50.xlsx`
  - Modificar 5 linhas com erros: CPF mal formado, hireDate futura, status="INVALIDO", name vazio
  - Salvar como `tirvu-mixed-errors.xlsx`
  - Documentar no header do script: "Run via `node --import tsx test/fixtures/imports/build-fixtures.ts` quando fixture precisar regenerar"
- [x] T7.4 Gerar `tirvu-invalid-header.xlsx`:
  - Mesma estratégia, mas remover a coluna "Data Log" (45 colunas).
- [x] T7.5 Gerar `tirvu-bad-sheet-name.xlsx`:
  - Renomear sheet para `Sheet1`.
- [x] T7.6 Adicionar `test/fixtures/imports/` no .gitignore? **NÃO** — fixtures pequenos (≤500KB) entram no repo (test reproducibility > git size).
- [x] T7.7 NÃO commitar `tirvu-anatel-50.xlsx` se ele já está em `docs/exemplo/`. Pode-se usar `path.join(__dirname, '../../../../docs/exemplo/Colaboradores...')` no test, evitando duplicação — mas isso é frágil (path com acento e espaço). Decisão: **copiar** para `test/fixtures/imports/` para isolar. Tamanho do arquivo é ~30KB — irrelevante.

### T8 — Testes `tirvu-parser.test.ts` (AC: 12)

- [x] T8.1 Criar `backend-api/test/modules/tirvu-parser.test.ts`. Padrão V3:
  ```ts
  import test from 'node:test'
  import assert from 'node:assert'
  import * as path from 'node:path'
  import { detect, parseRows } from '../../src/modules/imports/tirvu-parser'

  const FIX = (name: string) => path.join(__dirname, '../fixtures/imports', name)
  ```
- [x] T8.2 Casos:
  - `detect retorna 'tirvu-v1' para fixture válido`
  - `detect retorna null para tirvu-bad-sheet-name.xlsx`
  - `detect retorna null para tirvu-invalid-header.xlsx (45 cols)`
  - `parseRows itera 50 rows do fixture válido` — coletar via `for await` em array, assert length ≥1 e ≤1000.
  - `cada TirvuRow tem 46 chaves funcionais`
  - `normalização: data dd/MM/yyyy convertida para Date` — pegar 1 row com `admissao` e `assert.ok(row.admissao instanceof Date)`.
  - `normalização: PCD? "Não" vira false, "Sim" vira true`.
  - `normalização: salário "1.500,00" vira 1500`.
  - `linha vazia é pulada` — fixture com linha em branco no meio.

### T9 — Testes `import-validator.test.ts` (AC: 13)

- [x] T9.1 Criar `backend-api/test/modules/import-validator.test.ts`.
- [x] T9.2 Casos:
  - `linha completa válida → status 'valid', errors []`
  - `CPF inválido (dígito errado) → errors contém "CPF inválido (dígito verificador não confere)"`
  - `CPF ausente → "CPF ausente"`
  - `hireDate futura (admissao = amanhã) → "Data de admissão futura não é permitida"`
  - `hireDate como string raw (parse falhou) → "Data de admissão fora do formato dd/MM/yyyy"`
  - `status fora do enum → "Status do colaborador inválido (esperado: ATIVO, DEMITIDO ou AFASTADO)"`
  - `terminationDate < hireDate → "Data de demissão anterior à admissão"`
  - `múltiplos erros simultâneos → todos em errors array (length >= 2)`

### T10 — Validação final (AC: tudo)

- [x] T10.1 `npx tsc --noEmit` em `backend-api` — zero erros.
- [x] T10.2 Rodar suite focada:
  ```bash
  node --test -r ts-node/register \
    "test/modules/tirvu-parser.test.ts" \
    "test/modules/import-validator.test.ts"
  ```
  Esperado: ≥17 cases passing.
- [x] T10.3 Rodar suite completa de regressão:
  ```bash
  node --test -r ts-node/register "test/modules/*.test.ts"
  ```
  Esperado: 49 + ≥17 = ≥66 pass, 0 fail.
- [x] T10.4 Atualizar `File List` na seção Dev Agent Record com todos os arquivos novos/modificados.

## Dev Notes

### Mapeamento de colunas (Tirvu → TirvuRow → Employee)

| Excel header | TirvuRow key | Tipo runtime | Employee field destino (Story 3.x) |
|---|---|---|---|
| ID | `tirvuId` | string\|null | `tirvuId` |
| CPF | `cpf` | string\|null | `cpf` |
| Colaborador | `name` | string\|null | `name` |
| PCD? | `pcd` | bool\|null | `personalData.pcd` |
| Deficiência | `deficiencia` | string\|null | `personalData.deficiencia` |
| Status | `status` | string\|null | `status` |
| Empresa | `empresa` | string\|null | `branch` |
| Lotação | `lotacao` | string\|null | `workplace` (legado) |
| Admissão | `admissao` | Date\|string\|null | `hireDate` |
| Demissão | `demissao` | Date\|string\|null | `terminationDate` |
| Matrícula | `matricula` | string\|null | `registration` |
| Nascimento | `nascimento` | Date\|string\|null | `birthDate` |
| Nome do Pai | `nomePai` | string\|null | `personalData.nomePai` |
| Nome da Mãe | `nomeMae` | string\|null | `personalData.nomeMae` |
| Cargo | `cargo` | string\|null | `position` |
| Jornada de Trabalho | `jornada` | string\|null | `shift` |
| Início na Jornada | `inicioJornada` | Date\|string\|null | `personalData.inicioJornada` |
| Fora da Cerca? | `foraDaCerca` | bool\|null | `geofencingFlags.outsideFence` |
| Sem Geo? | `semGeo` | bool\|null | `geofencingFlags.noGeo` |
| RG - Número | `rgNumero` | string\|null | `personalData.rg.numero` |
| RG - Órgão Emissor | `rgOrgao` | string\|null | `personalData.rg.orgao` |
| RG - Data Emissão | `rgDataEmissao` | Date\|string\|null | `personalData.rg.dataEmissao` |
| PIS/Pasep | `pisPasep` | string\|null | `personalData.pisPasep` |
| CTPS - Número | `ctpsNumero` | string\|null | `personalData.ctps.numero` |
| CTPS - Série | `ctpsSerie` | string\|null | `personalData.ctps.serie` |
| Sexo | `sexo` | string\|null | `personalData.sexo` |
| Telefone | `telefone` | string\|null | `phone` |
| E-mail | `email` | string\|null | `personalData.email` |
| CEP | `cep` | string\|null | `address.cep` |
| Endereço | `endereco` | string\|null | `address.logradouro` |
| Endereço - Número | `enderecoNumero` | string\|null | `address.numero` |
| Endereço - Complemento | `enderecoComplemento` | string\|null | `address.complemento` |
| Endereço - Bairro | `enderecoBairro` | string\|null | `address.bairro` |
| Endereço - UF | `enderecoUf` | string\|null | `address.uf` |
| Endereço - Cidade | `enderecoCidade` | string\|null | `address.cidade` |
| Sindicato | `sindicato` | string\|null | `unionName` |
| Salário | `salario` | number\|null | `salary` |
| Salário - Complemento | `salarioComplemento` | number\|null | `personalData.salarioComplemento` |
| Salário - Extra | `salarioExtra` | number\|null | `personalData.salarioExtra` |
| Tipo PIX | `tipoPix` | string\|null | `bankData.tipoPix` (cifrado em apply) |
| Chave PIX | `chavePix` | string\|null | `bankData.chavePix` (cifrado em apply) |
| Banco | `banco` | string\|null | `bankData.banco` (cifrado em apply) |
| Tipo de Conta | `tipoConta` | string\|null | `bankData.tipoConta` (cifrado em apply) |
| Agência | `agencia` | string\|null | `bankData.agencia` (cifrado em apply) |
| Conta | `conta` | string\|null | `bankData.conta` (cifrado em apply) |
| Data Log | `dataLog` | Date\|string\|null | (metadado, não persistir) |

**Esta story implementa apenas Tirvu→TirvuRow.** A coluna direita (TirvuRow→Employee) é responsabilidade da Story 3.x.

### Decisões de design importantes

- **Por que mantém string crua no campo Date quando parse falha (em vez de null)?** Validator precisa diferenciar "Data ausente" (campo vazio = `null`) de "Data inválida" (campo preenchido com formato errado = string). Se sempre virasse `null`, a mensagem de erro do AC11 fica ambígua.

- **Por que iterator e não array de uma vez?** Premissa do AC5 (memória ≤512MB com 5k linhas). A lib `xlsx@0.18.5` infelizmente carrega tudo em RAM no `read()` — não tem API streaming nativa. Mas o `sheet_to_json` retorna array of arrays, e nosso generator emite **uma estrutura `TirvuRow` por vez**, evitando duplicar 5k objetos em memória simultaneamente. Worker (Story 3.1) consume `for await` e processa em chunks pequenos — peak memory fica controlado.

- **Por que `XLSX.utils.sheet_to_json` com `raw: false`?** Excel armazena datas como números (dias desde 1900). Com `raw: false`, a lib aplica o formato da célula e retorna `"23/04/1985"`. Com `raw: true`, viria `31159` (número). Manter consistência: todas as datas chegam como string dd/MM/yyyy.

- **Por que zod (e não validação manual)?** Architecture AC9 menciona zod explicitamente. Vai padronizar a maneira como Stories 1.2/1.3/3.x validam payloads de API. Zod também serve pra validar requests Fastify (próximas stories) — investimento se paga rápido.

- **Onde fica `BANK_DATA_BLACKLIST` (sanitização de logs)?** **Story 5.2**, não esta. Por enquanto, parser e validator **não loggam nada**. Se precisar debugar, usar `node --inspect` localmente.

- **Por que separar `tirvu-parser.ts` de `import-validator.ts`?** Architecture §Structure Patterns linhas 729-731. Parser = "como ler"; validator = "está bom?". Concerns separados permitem trocar parser (futuramente `tirvu-v2.ts`) sem mexer no validator.

### Algoritmo CPF dígito verificador (mod 11)

```text
1. Strip de tudo que não é dígito → 11 dígitos exatos (senão inválido)
2. Rejeitar todos iguais (000..., 111..., ..., 999...) — comum em fixtures de teste
3. Calcular dígito 1: somar dígitos 0..8 multiplicados por 10..2; mod 11; se ≥10 vira 0
4. Calcular dígito 2: somar dígitos 0..9 multiplicados por 11..2; mod 11; se ≥10 vira 0
5. Comparar com dígitos 9 e 10 do CPF
```

Implementar em `imports/utils.ts` (helper compartilhado entre parser e validator) ou inline em ambos? **Recomendação:** criar `imports/utils.ts` exportando `parseCpf`, `isCpfValid`, `parseDateBR`, `parseBoolBR`, `parseNumberBR`. Parser usa para normalizar; validator usa para checar.

### Padrão de testes V3 (relembrando da Story 5.1)

- `node:test` + `node:assert`. **Não** vitest, **não** jest.
- Estrutura: `test('feature', async (t) => { await t.test('caso', () => { ... }) })`
- Async: `for await (const row of parseRows(buffer))` — node:test suporta nativamente.
- Encoding: tudo UTF-8. Acentos (`Lotação`, `Admissão`) precisam estar corretos no source — **não substituir por ASCII**. CLAUDE.md global e session já cobrem isso.

### Pegadinhas conhecidas (do Story 5.1 Debug Log e arquitetura)

- **TypeScript com `xlsx@0.18.5`:** o package vem com types embutidos. Importar como `import * as XLSX from 'xlsx'` ou `import { read, utils } from 'xlsx'`. Conferir o que dá erro mais limpo.
- **`xlsx.read(buffer, { type: 'buffer' })`** vs **`xlsx.readFile(path)`:** parser deve aceitar **buffer** (worker em Story 3.1 vai ler do disco e passar buffer). Test usa `readFile` para conveniência.
- **Datas em dd/MM/yyyy vs MM/dd/yyyy:** `parseDateBR` deve dar erro se tem `13/05/2026` lendo como mês=13 ao invés de aceitar como dia=13. Padrão BR é `dd/MM/yyyy`. Validar primeiro componente ≤31 e segundo ≤12.
- **Linhas vazias no fim de planilha Excel:** comum. Já coberto no AC7 e T5.4 (skip).
- **`xlsx` lib **não** detecta CSV/TSV** — se usuário renomear `.csv` para `.xlsx`, `XLSX.read` lança. Capturar em `detect` e retornar null.

### O que NÃO fazer nesta story (out-of-scope claros)

- ❌ NÃO chamar `prisma.employee.findMany` (matcher é Story 2.3)
- ❌ NÃO criar tipo `PreviewSummary` (Story 2.3)
- ❌ NÃO escrever em `ImportJob.previewSummary` (Story 2.3)
- ❌ NÃO criar BullMQ queue/worker (Story 3.1)
- ❌ NÃO criar rotas REST (Stories 1.2, 1.3)
- ❌ NÃO modificar/refatorar `bank-data-encryption.ts` (Story 5.1, done)
- ❌ NÃO criar `error-report-builder.ts` (Story 4.x)
- ❌ NÃO mexer em `prisma/schema.prisma` (Story 2.1, done — schema já tem todas as colunas)

### Project Structure Notes

Files que esta story mexe (esperado):
- ✏️ [backend-api/package.json](backend-api/package.json) — adicionar `zod`
- ✏️ [backend-api/package-lock.json](backend-api/package-lock.json) — gerado por `npm install`
- ✏️ [backend-api/src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts) — adicionar `TirvuRow`, `ParserVersion`, `ValidationResult`
- ✨ `backend-api/src/modules/imports/tirvu-parser.ts` — novo
- ✨ `backend-api/src/modules/imports/import-validator.ts` — novo
- ✨ `backend-api/src/modules/imports/utils.ts` — novo (helpers BR/CPF/datas)
- ✨ `backend-api/test/modules/tirvu-parser.test.ts` — novo
- ✨ `backend-api/test/modules/import-validator.test.ts` — novo
- ✨ `backend-api/test/fixtures/imports/tirvu-anatel-50.xlsx` — novo (cópia)
- ✨ `backend-api/test/fixtures/imports/tirvu-mixed-errors.xlsx` — novo (gerado)
- ✨ `backend-api/test/fixtures/imports/tirvu-invalid-header.xlsx` — novo (gerado)
- ✨ `backend-api/test/fixtures/imports/tirvu-bad-sheet-name.xlsx` — novo (gerado)
- ✨ `backend-api/test/fixtures/imports/build-fixtures.ts` — script auxiliar (não roda em CI)

Files que esta story **NÃO** deve tocar:
- 🚫 `backend-api/prisma/*` (Story 2.1 done)
- 🚫 `backend-api/src/modules/imports/bank-data-encryption.ts` (Story 5.1 done)
- 🚫 `backend-api/src/modules/auth/permissions.ts` (Story 5.1 done)
- 🚫 `backend-api/src/plugins/permissions.ts` (Story 5.1 done)
- 🚫 nenhum arquivo em `frontend-web/`
- 🚫 nenhum arquivo em `backend-api/src/routes/`

### Mensagem de commit sugerida

```
feat(imports): tirvu-v1 parser + zod validator (Story 2.2)

- tirvu-parser.ts: header detection (Plan1, 46 cols, case-insensitive)
  + async iterator parseRows with row-by-row normalization
  (dates dd/MM/yyyy, booleans Sim/Não, numbers pt-BR, trim, empty→null)
- import-validator.ts: CPF mod 11, hireDate not future, status enum,
  birthDate sanity, terminationDate ≥ hireDate; accumulates all errors
- utils.ts: BR/CPF/date helpers shared between parser and validator
- 4 test fixtures (anatel-50, mixed-errors, invalid-header, bad-sheet-name)
- 17+ unit tests across both modules
- adds zod as runtime dep
```

### References

- [Architecture D7 — Parser Versioning + Error Reporting](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D7) (linhas 478–501)
- [Architecture D8 — Match + Diff](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md#D8) (linhas 503–540) — para entender o que o validator NÃO faz
- [Architecture §Structure Patterns](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md) (linhas 723–781)
- [Architecture §Format Patterns — error codes](_evo-output/planning-artifacts/v3-2-import-tirvu/architecture.md) (linhas 793–807)
- [Epics — Story 2.2](_evo-output/planning-artifacts/v3-2-import-tirvu/epics.md) (linhas 412–454)
- [PRD — FR5, FR11, FR12, FR29](_evo-output/planning-artifacts/v3-2-import-tirvu/prd.md)
- [Story 2.1 (done)](_evo-output/implementation-artifacts/v3-2-import-tirvu/2-1-schema-migration-employee-and-import-job.md) — schema existe, mas esta story não usa
- [Story 5.1 (done)](_evo-output/implementation-artifacts/v3-2-import-tirvu/5-1-encryption-and-permissions.md) — types.ts existe, esta story estende
- [Fixture base](docs/exemplo/Colaboradores,%20para%20fins%20de%20valida%C3%A7%C3%A3o.xlsx)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7[1m] (via skill `evo-dev-story`, 2026-05-01)

### Debug Log References

- `npx ts-node test/fixtures/imports/build-fixtures.ts` falhou no 1º run com `TS6133: 'fs' is declared but its value is never read`. Corrigido removendo o import não usado de `node:fs` (já uso `XLSX.writeFile` que faz IO internamente).
- Decisão sobre zod: a dep foi adicionada no T1.2 conforme spec (será usada por Stories 1.2/1.3 para validar request bodies HTTP), mas o `import-validator.ts` ficou sem zod porque as regras desta story (CPF mod 11, comparações cross-field admissão↔demissão, sanity de idade) são naturalmente imperativas — forçar um `z.object` aqui não traria benefício. Validation imperativa direta + acumulação manual de erros = código mais legível.
- Linha completamente vazia: implementei `isRowEmpty` para skipar (AC7/T5.4). `XLSX.utils.sheet_to_json({ blankrows: false })` já filtra muitas, mas mantive o guard explícito para o caso de cells preenchidas com whitespace puro.
- Tipo `Date | string | null` para colunas de data: necessário para distinguir "campo ausente" (null) de "campo com formato inválido" (string crua) — validator usa essa distinção.

### Completion Notes List

- ✅ T1 — `zod@4.4.2` instalado em dependencies. `xlsx@0.18.5` já estava.
- ✅ T2 — `types.ts` estendido com `ParserVersion`, `TirvuRow` (48 chaves: 46 colunas + 2 metadados rowIndex/rawRowIndex), `ValidationResult`. `BankData`/`EncryptedBlob` da Story 5.1 mantidos intactos.
- ✅ T3 — `utils.ts` novo com helpers `trimOrNull`, `parseDateBR`, `parseBoolBR`, `parseNumberBR`, `parseCpfNoMask`, `isCpfValid` (mod 11 com 2 dígitos verificadores + rejeição de CPFs todos iguais).
- ✅ T4 — `tirvu-parser.ts` exporta `TIRVU_V1_HEADER` (46 strings com acentos canônicos) e `detect(input): ParserVersion | null`. Comparação case-insensitive + trim. Captura erro do `XLSX.read` em buffers corrompidos.
- ✅ T5 — `parseRows` é `async function*` que itera `Plan1` linha-a-linha mapeando 46 colunas posicionalmente para `TirvuRow`. Linhas vazias puladas. `rowIndex` 1-based desconta header.
- ✅ T6 — `import-validator.ts` valida CPF, name, hireDate (presente, parseável, não-futura), status (enum case-insensitive), birthDate sanity (≥14 anos), terminationDate ≥ hireDate. Acumula todos os erros, não early-return.
- ✅ T7 — 4 fixtures gerados a partir de `docs/exemplo/Colaboradores, para fins de validação.xlsx` (49 linhas): `tirvu-anatel-50.xlsx` (cópia), `tirvu-mixed-errors.xlsx` (5 erros sintéticos), `tirvu-invalid-header.xlsx` (45 cols), `tirvu-bad-sheet-name.xlsx` (`Sheet1` em vez de `Plan1`). Script `build-fixtures.ts` é one-off (não roda em CI).
- ✅ T8 — `tirvu-parser.test.ts` com 15 cases (header, detect com 5 cenários, parseRows com 9 cenários incluindo normalização de PCD/data/null, rowIndex contínuo, buffer corrupto não-lança).
- ✅ T9 — `import-validator.test.ts` com 15 cases cobrindo todas as regras + edge cases (CPF com/sem máscara, status case-insensitive, múltiplos erros simultâneos).
- ✅ T10 — `tsc --noEmit` zero erros. Suite focada 30/30. Suite full regression 79/79 (49 V3+5.1+2.1 + 30 novos da 2.2).

### File List

- ✏️ [backend-api/package.json](backend-api/package.json) — adiciona `zod@^4.4.2` em dependencies
- ✏️ [backend-api/package-lock.json](backend-api/package-lock.json) — gerado pelo `npm install zod`
- ✏️ [backend-api/src/modules/imports/types.ts](backend-api/src/modules/imports/types.ts) — adicionados tipos `ParserVersion`, `TirvuRow`, `ValidationResult`
- ✨ [backend-api/src/modules/imports/utils.ts](backend-api/src/modules/imports/utils.ts) — helpers BR/CPF/datas
- ✨ [backend-api/src/modules/imports/tirvu-parser.ts](backend-api/src/modules/imports/tirvu-parser.ts) — header detection + async iterator
- ✨ [backend-api/src/modules/imports/import-validator.ts](backend-api/src/modules/imports/import-validator.ts) — validador imperativo
- ✨ [backend-api/test/modules/tirvu-parser.test.ts](backend-api/test/modules/tirvu-parser.test.ts) — 15 cases
- ✨ [backend-api/test/modules/import-validator.test.ts](backend-api/test/modules/import-validator.test.ts) — 15 cases
- ✨ [backend-api/test/fixtures/imports/build-fixtures.ts](backend-api/test/fixtures/imports/build-fixtures.ts) — script one-off
- ✨ [backend-api/test/fixtures/imports/tirvu-anatel-50.xlsx](backend-api/test/fixtures/imports/tirvu-anatel-50.xlsx) — fixture válido
- ✨ [backend-api/test/fixtures/imports/tirvu-mixed-errors.xlsx](backend-api/test/fixtures/imports/tirvu-mixed-errors.xlsx) — fixture com 5 linhas inválidas
- ✨ [backend-api/test/fixtures/imports/tirvu-invalid-header.xlsx](backend-api/test/fixtures/imports/tirvu-invalid-header.xlsx) — header de 45 colunas
- ✨ [backend-api/test/fixtures/imports/tirvu-bad-sheet-name.xlsx](backend-api/test/fixtures/imports/tirvu-bad-sheet-name.xlsx) — sheet `Sheet1` em vez de `Plan1`

### Change Log

- 2026-05-01 — Story 2.2 implementada. Parser tirvu-v1 + import-validator. 30 unit tests novos, 79/79 suite full passa, zero erros TS.
