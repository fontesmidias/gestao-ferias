// Story 4.4 / M3 — Filtro de escopo do Oráculo AI.
// Roda ANTES da chamada LLM para:
//   (a) economizar custo/tempo em perguntas claramente fora do escopo
//   (b) evitar alucinações do modelo respondendo sobre clima, esportes, etc.
//   (c) atender AC linha 669-671 do epics.md: "redireciona educadamente para
//       perguntas suportadas (férias, postos, cobertura, custos)"

const SCOPE_KEYWORDS = [
  // Domínio de férias
  'féria', 'feria', 'vacation', 'descanso', 'aquisitiv', 'concessivo', 'vencid',
  'fracion', 'saldo', 'quinz', 'art. 134', 'art 134', 'art. 130', 'art 130', 'art. 137', 'art 137',
  'clt', 'dobra',
  // Estrutura operacional
  'posto', 'posiç', 'posic', 'cliente', 'turno', 'escala', 'aloca',
  // Cobertura
  'cobertura', 'gap', 'substitui', 'ferista', 'intermitent', 'efetivo', 'encadeam',
  // Pessoas
  'colaborador', 'colaboradora', 'funcion', 'employee', 'cpf', 'rh',
  // Financeiro
  'custo', 'salário', 'salario', 'orçament', 'orcament', 'multa', 'roi', 'forecast', 'demanda',
  // Operação geral
  'aprov', 'rejeit', 'pendênc', 'pendenc', 'tenant', 'empresa',
  'compliance', 'auditoria', 'audit',
] as const

const GREETING_PATTERN = /^(ol[áa]|oi|bom dia|boa tarde|boa noite|hey|hi|hello)[\s!?.,]*$/i

export interface ScopeCheckResult {
  inScope: boolean
  matchedKeyword?: string
  reason?: 'greeting' | 'out_of_scope'
}

export function isInScope(question: string): ScopeCheckResult {
  const q = (question ?? '').trim().toLowerCase()
  if (!q) return { inScope: false, reason: 'out_of_scope' }

  if (GREETING_PATTERN.test(q)) {
    return { inScope: false, reason: 'greeting' }
  }

  for (const kw of SCOPE_KEYWORDS) {
    if (q.includes(kw)) {
      return { inScope: true, matchedKeyword: kw }
    }
  }

  return { inScope: false, reason: 'out_of_scope' }
}

export const SUPPORTED_TOPICS = [
  'Férias (saldo, períodos aquisitivos, fracionamento, CLT)',
  'Postos de trabalho (alocações, posições, capacidade)',
  'Cobertura (gaps, sugestões de feristas, custo)',
  'Riscos de dobra CLT e multas estimadas',
  'Forecast de demanda de intermitentes',
  'Custos operacionais e ROI de cobertura',
] as const

export function buildOutOfScopeAnswer(reason: 'greeting' | 'out_of_scope' = 'out_of_scope'): string {
  if (reason === 'greeting') {
    return [
      'Olá! Sou o Oráculo do GestaoFerias. Posso ajudar com perguntas sobre:',
      '',
      ...SUPPORTED_TOPICS.map((t) => `• ${t}`),
      '',
      'Como posso te ajudar?',
    ].join('\n')
  }
  return [
    'Essa pergunta está fora do escopo do sistema. Posso ajudar com:',
    '',
    ...SUPPORTED_TOPICS.map((t) => `• ${t}`),
    '',
    'Reformule sua pergunta focando em um desses temas e tento responder.',
  ].join('\n')
}
