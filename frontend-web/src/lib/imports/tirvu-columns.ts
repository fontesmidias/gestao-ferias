// Espelha backend-api/src/modules/imports/tirvu-parser.ts → TIRVU_V1_HEADER.
// Usado no modal "Ver formato esperado". Manter sincronizado manualmente.

export const TIRVU_V1_COLUMNS: readonly string[] = [
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
  'Data Log',
] as const
