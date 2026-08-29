// Gera as fixtures de importação Tirvu com dados SINTÉTICOS.
//
//   cd backend-api && npx tsx test/fixtures/imports/build-fixtures.ts
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE ESTE ARQUIVO FOI REESCRITO — incidente de 2026-08-29
//
// A versão anterior gerava as fixtures a partir de
// `docs/exemplo/Colaboradores, para fins de validação.xlsx`, um arquivo REAL,
// e o comentário original dizia textualmente "cópia exata do base".
//
// O resultado é que quatro planilhas com nome completo, CPF, RG, endereço,
// telefone, PIS, salário, chave PIX e filiação de 49 pessoas reais ficaram
// versionadas e públicas no GitHub por cerca de quatro meses.
//
// O `.gitignore` protegia o arquivo original, mas não as cópias derivadas,
// gravadas em outro caminho.
//
// REGRA QUE FICA: dado de teste nunca deriva de dado real. O que se copia de
// um arquivo de produção é a ESTRUTURA (nomes e ordem das colunas, nome da
// aba), nunca o conteúdo. As linhas são geradas aqui, por código, e qualquer
// semelhança com pessoa real é falha a corrigir.
// ─────────────────────────────────────────────────────────────────────────────

import * as XLSX from 'xlsx'
import * as path from 'node:path'

const OUT_DIR = __dirname
const SHEET = 'Plan1'
const LINHAS = 49

/** Cabeçalho na ordem exata que o parser do Tirvu espera. */
const HEADER = [
  'ID', 'CPF', 'Colaborador', 'PCD?', 'Deficiência', 'Status', 'Empresa',
  'Lotação', 'Admissão', 'Demissão', 'Matrícula', 'Nascimento', 'Nome do Pai',
  'Nome da Mãe', 'Cargo', 'Jornada de Trabalho', 'Início na Jornada',
  'Fora da Cerca?', 'Sem Geo?', 'RG - Número', 'RG - Órgão Emissor',
  'RG - Data Emissão', 'PIS/Pasep', 'CTPS - Número', 'CTPS - Série', 'Sexo',
  'Telefone', 'E-mail', 'CEP', 'Endereço', 'Endereço - Número',
  'Endereço - Complemento', 'Endereço - Bairro', 'Endereço - UF',
  'Endereço - Cidade', 'Sindicato', 'Salário', 'Salário - Complemento',
  'Salário - Extra', 'Tipo PIX', 'Chave PIX', 'Banco', 'Tipo de Conta',
  'Agência', 'Conta', 'Data Log',
]

// Vocabulário sintético. Nomes deliberadamente genéricos e combinatórios,
// para que nenhuma linha coincida com pessoa real.
const PRENOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela',
  'Heitor', 'Isabel', 'João', 'Karina', 'Lucas', 'Mariana', 'Nelson', 'Olívia',
  'Paulo', 'Renata', 'Sérgio', 'Tatiana', 'Vitor']
const SOBRENOMES = ['Almeida', 'Barbosa', 'Cardoso', 'Dias', 'Esteves', 'Freitas',
  'Gomes', 'Henriques', 'Imbuzeiro', 'Jardim', 'Klein', 'Lopes', 'Moreira',
  'Nunes', 'Oliveira', 'Pinto', 'Queiroz', 'Ramos', 'Silveira', 'Teixeira']
const CARGOS = ['Vigilante', 'Porteiro', 'Recepcionista', 'Auxiliar de Limpeza',
  'Supervisor de Posto', 'Controlador de Acesso']
const LOTACOES = ['POSTO ALFA - SEDE', 'POSTO BRAVO - ANEXO I',
  'POSTO CHARLIE - GARAGEM', 'POSTO DELTA - PORTARIA']
const CIDADES = ['Brasília', 'Goiânia', 'Anápolis', 'Luziânia']

/** Dígitos verificadores corretos, para o CPF passar na validação do parser. */
function cpfSintetico(seq: number): string {
  const base = String(10000000000 + seq * 7919).slice(0, 9)
  const dv = (nums: string, peso: number) => {
    const soma = nums.split('').reduce((acc, d, i) => acc + Number(d) * (peso - i), 0)
    const r = (soma * 10) % 11
    return String(r === 10 ? 0 : r)
  }
  const d1 = dv(base, 10)
  const d2 = dv(base + d1, 11)
  return `${base}${d1}${d2}`
}

function linha(i: number): (string | number)[] {
  // Os deslocamentos evitam que nome, pai e mãe coincidam quando i = 0.
  const nome = `${PRENOMES[i % PRENOMES.length]} ${SOBRENOMES[(i * 3) % SOBRENOMES.length]}`
  const mae = `${PRENOMES[(i * 5 + 7) % PRENOMES.length]} ${SOBRENOMES[(i * 7 + 3) % SOBRENOMES.length]}`
  const pai = `${PRENOMES[(i * 11 + 13) % PRENOMES.length]} ${SOBRENOMES[(i * 13 + 9) % SOBRENOMES.length]}`
  const seq = String(i + 1).padStart(4, '0')

  return [
    1000 + i,                                   // ID
    cpfSintetico(i),                            // CPF
    nome,                                       // Colaborador
    'NÃO',                                      // PCD?
    '',                                         // Deficiência
    'ATIVO',                                    // Status
    'EMPRESA DEMONSTRACAO LTDA',                // Empresa
    LOTACOES[i % LOTACOES.length],              // Lotação
    '01/03/2024',                               // Admissão
    '',                                         // Demissão
    `9${seq}`,                                  // Matrícula
    '15/06/1990',                               // Nascimento
    pai,                                        // Nome do Pai
    mae,                                        // Nome da Mãe
    CARGOS[i % CARGOS.length],                  // Cargo
    '12X36 DIURNO',                             // Jornada de Trabalho
    '01/03/2024',                               // Início na Jornada
    'NÃO', 'NÃO',                               // Fora da Cerca?, Sem Geo?
    `900${seq}`,                                // RG - Número
    'SSP/DF',                                   // RG - Órgão Emissor
    '10/01/2010',                               // RG - Data Emissão
    `900${seq}0000`,                            // PIS/Pasep
    `700${seq}`, '0001',                        // CTPS Número, Série
    i % 2 === 0 ? 'MASCULINO' : 'FEMININO',     // Sexo
    `61 90000-${seq}`,                          // Telefone
    `colaborador${seq}@exemplo.invalid`,        // E-mail
    '70000-000',                                // CEP
    'RUA DE DEMONSTRACAO',                      // Endereço
    String(100 + i), '',                        // Número, Complemento
    'BAIRRO EXEMPLO',                           // Bairro
    'DF',                                       // UF
    CIDADES[i % CIDADES.length],                // Cidade
    'SINDICATO DEMONSTRACAO',                   // Sindicato
    '2000,00', '0,00', '0,00',                  // Salário, Complemento, Extra
    'CPF',                                      // Tipo PIX
    cpfSintetico(i),                            // Chave PIX
    '001', 'CORRENTE',                          // Banco, Tipo de Conta
    '0001', `${seq}-0`,                         // Agência, Conta
    '01/08/2026',                               // Data Log
  ]
}

function novaPlanilha(): (string | number)[][] {
  return [HEADER, ...Array.from({ length: LINHAS }, (_, i) => linha(i))]
}

function escrever(dados: (string | number)[][], nome: string, aba = SHEET) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), aba)
  XLSX.writeFile(wb, path.join(OUT_DIR, nome))
  console.log(`ok ${nome}`)
}

// 1. Base válida — 49 linhas sintéticas, todas corretas.
escrever(novaPlanilha(), 'tirvu-anatel-50-sintetico.xlsx')

// 2. Erros variados — 5 linhas defeituosas para exercitar o validador.
{
  const d = novaPlanilha()
  d[1][1] = '111.111.111-11'   // CPF com dígito verificador inválido
  d[2][2] = ''                 // nome obrigatório ausente
  d[3][11] = '31/02/1990'      // data inexistente
  d[4][7] = ''                 // lotação ausente
  d[5][1] = ''                 // CPF ausente
  escrever(d, 'tirvu-mixed-errors-sintetico.xlsx')
}

// 3. Nome de aba errado — o parser deve recusar antes de ler linha alguma.
escrever(novaPlanilha(), 'tirvu-bad-sheet-name-sintetico.xlsx', 'Planilha1')

// 4. Cabeçalho inválido — coluna renomeada.
{
  const d = novaPlanilha()
  d[0] = [...HEADER]
  d[0][2] = 'Nome do Funcionario'  // era 'Colaborador'
  escrever(d, 'tirvu-invalid-header-sintetico.xlsx')
}

console.log(`\n4 fixtures geradas com ${LINHAS} linhas sintéticas cada.`)
console.log('Nenhum dado real foi usado.')
