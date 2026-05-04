import * as Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ─── Types ───────────────────────────────────────────

export interface RawEmployee {
  name: string; cpf: string; hireDate: string;
  phone?: string; position?: string; employeeType?: string;
  branch?: string; department?: string; workplace?: string;
  shift?: string; salary?: string; registration?: string;
}

export interface RawWorkplace {
  name: string; client?: string; address?: string; city?: string;
  minStaff?: string; positionRole?: string; positionShift?: string; positionCount?: string;
  // Schema expandido (importação completa de Postos de Serviço — 2026-05-04)
  externalId?: string;
  legalName?: string; cnpj?: string;
  responsible?: string; phone?: string; email?: string;
  cep?: string; street?: string; number?: string; complement?: string;
  neighborhood?: string; state?: string;
  contractStatus?: string;
  importedBy?: string; importedAt?: string;
}

export interface RawAllocation {
  employeeCpf: string; workplaceName: string; positionRole: string; startDate: string;
}

export interface RawVacationSchedule {
  employeeCpf: string; startDate: string; endDate: string; days?: string;
}

// ─── Field Maps ──────────────────────────────────────

const EMPLOYEE_MAP: Record<string, keyof RawEmployee> = {
  'name': 'name', 'nome': 'name', 'Nome': 'name', 'Nome Completo': 'name',
  'cpf': 'cpf', 'CPF': 'cpf',
  'hireDate': 'hireDate', 'hire_date': 'hireDate', 'Data de Admissao': 'hireDate', 'Admissao': 'hireDate', 'Data Admissao': 'hireDate',
  'phone': 'phone', 'telefone': 'phone', 'Telefone': 'phone', 'WhatsApp': 'phone',
  'position': 'position', 'cargo': 'position', 'Cargo': 'position', 'Funcao': 'position',
  'employeeType': 'employeeType', 'tipo': 'employeeType', 'Tipo': 'employeeType', 'Tipo Colaborador': 'employeeType',
  'branch': 'branch', 'empresa': 'branch', 'Empresa': 'branch', 'Filial': 'branch',
  'department': 'department', 'departamento': 'department', 'Departamento': 'department', 'CC': 'department',
  'workplace': 'workplace', 'posto': 'workplace', 'Posto': 'workplace', 'Lotacao': 'workplace',
  'shift': 'shift', 'escala': 'shift', 'Escala': 'shift', 'Jornada': 'shift',
  'salary': 'salary', 'salario': 'salary', 'Salario': 'salary',
  'registration': 'registration', 'matricula': 'registration', 'Matricula': 'registration',
}

const WORKPLACE_MAP: Record<string, keyof RawWorkplace> = {
  // Identificação
  'ID': 'externalId', 'externalId': 'externalId',
  'name': 'name', 'nome': 'name', 'Nome': 'name', 'Nome do Posto': 'name', 'Posto': 'name',
  'Nome / Apelido': 'name', 'Nome/Apelido': 'name',
  'Razão Social': 'legalName', 'Razao Social': 'legalName', 'legalName': 'legalName',
  'CNPJ': 'cnpj', 'cnpj': 'cnpj',
  'client': 'client', 'cliente': 'client', 'Cliente': 'client', 'Contratante': 'client',
  // Contato
  'Responsável': 'responsible', 'Responsavel': 'responsible', 'responsible': 'responsible',
  'Telefone': 'phone', 'phone': 'phone',
  'E-mail': 'email', 'Email': 'email', 'email': 'email',
  // Endereço estruturado (planilha Postos de Serviço)
  'CEP': 'cep', 'cep': 'cep',
  'Logradouro': 'street', 'street': 'street',
  'Número': 'number', 'Numero': 'number', 'number': 'number',
  'Complemento': 'complement', 'complement': 'complement',
  'Bairro': 'neighborhood', 'neighborhood': 'neighborhood',
  'UF': 'state', 'state': 'state',
  'Cidade': 'city', 'city': 'city', 'cidade': 'city',
  // Endereço único (legado)
  'address': 'address', 'endereco': 'address', 'Endereco': 'address',
  // Operação
  'minStaff': 'minStaff', 'equipe_minima': 'minStaff', 'Equipe Minima': 'minStaff', 'Equipe Mínima': 'minStaff',
  'Status Contrato': 'contractStatus', 'contractStatus': 'contractStatus',
  // Auditoria
  'Usuário': 'importedBy', 'Usuario': 'importedBy', 'importedBy': 'importedBy',
  'Data Atualização': 'importedAt', 'Data Atualizacao': 'importedAt', 'importedAt': 'importedAt',
  // Posições filhas (1 linha por posição, agrupadas pelo Nome)
  'positionRole': 'positionRole', 'funcao': 'positionRole', 'Funcao': 'positionRole', 'Cargo no Posto': 'positionRole', 'Função': 'positionRole',
  'positionShift': 'positionShift', 'escala': 'positionShift', 'Escala': 'positionShift',
  'positionCount': 'positionCount', 'quantidade': 'positionCount', 'Quantidade': 'positionCount', 'Vagas': 'positionCount',
}

const ALLOCATION_MAP: Record<string, keyof RawAllocation> = {
  'CPF Colaborador': 'employeeCpf', 'CPF': 'employeeCpf', 'cpf': 'employeeCpf',
  'Posto': 'workplaceName', 'Nome do Posto': 'workplaceName', 'posto': 'workplaceName',
  'Funcao': 'positionRole', 'Cargo': 'positionRole', 'funcao': 'positionRole',
  'Data Inicio': 'startDate', 'Inicio': 'startDate', 'startDate': 'startDate',
}

const VACATION_MAP: Record<string, keyof RawVacationSchedule> = {
  'CPF Colaborador': 'employeeCpf', 'CPF': 'employeeCpf', 'cpf': 'employeeCpf',
  'Data Inicio': 'startDate', 'Inicio': 'startDate', 'startDate': 'startDate',
  'Data Fim': 'endDate', 'Fim': 'endDate', 'endDate': 'endDate',
  'Dias': 'days', 'dias': 'days', 'Total Dias': 'days',
}

// ─── Helpers ─────────────────────────────────────────

function mapRow<T>(row: any, fieldMap: Record<string, keyof T>): Partial<T> {
  const result: any = {}
  for (const [key, value] of Object.entries(row)) {
    const mapped = fieldMap[key.trim()]
    if (mapped && value !== undefined && value !== null && String(value).trim() !== '') {
      result[mapped] = String(value).trim()
    }
  }
  return result
}

function parseBuffer<T>(buffer: Buffer, ext: string, fieldMap: Record<string, keyof T>): T[] {
  if (ext === 'csv') {
    const csvString = buffer.toString('utf-8')
    const result = Papa.parse(csvString, { header: true, skipEmptyLines: true })
    return result.data.map((row: any) => mapRow<T>(row, fieldMap) as T)
  }
  if (['xlsx', 'xls'].includes(ext)) {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet)
    return rows.map((row: any) => mapRow<T>(row, fieldMap) as T)
  }
  throw new Error('Formato nao suportado (apenas .csv, .xlsx, .xls)')
}

function addInstructionSheet(wb: XLSX.WorkBook, instructions: string[][]) {
  const ws = XLSX.utils.aoa_to_sheet(instructions)
  ws['!cols'] = [{ wch: 25 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Instrucoes')
}

// ─── Import Service ──────────────────────────────────

export class ImportService {
  // Parsers
  static async parseEmployees(buffer: Buffer, ext: string) { return parseBuffer<RawEmployee>(buffer, ext, EMPLOYEE_MAP) }
  static async parseWorkplaces(buffer: Buffer, ext: string) { return parseBuffer<RawWorkplace>(buffer, ext, WORKPLACE_MAP) }
  static async parseAllocations(buffer: Buffer, ext: string) { return parseBuffer<RawAllocation>(buffer, ext, ALLOCATION_MAP) }
  static async parseVacations(buffer: Buffer, ext: string) { return parseBuffer<RawVacationSchedule>(buffer, ext, VACATION_MAP) }
  static async parseFile(buffer: Buffer, ext: string) { return this.parseEmployees(buffer, ext) }

  // ─── Templates ────────────────────────────────────

  static generateEmployeeTemplate(): Buffer {
    const wb = XLSX.utils.book_new()
    const data = [
      ['Nome Completo', 'CPF', 'Data Admissao', 'Telefone', 'Cargo', 'Tipo Colaborador', 'Empresa', 'Departamento', 'Posto', 'Escala', 'Salario', 'Matricula'],
      ['Carlos Silva', '111.222.333-44', '15/03/2022', '(61) 99999-9999', 'Agente de Portaria', 'EFETIVO', 'Green House', 'Operacional', 'INEP - Sede', '12x36', '2200', 'GH-001'],
      ['Ana Santos', '555.666.777-88', '01/07/2021', '(61) 98888-8888', 'Recepcionista', 'EFETIVO', 'Green House', 'Administrativo', 'TRF', '8h', '1800', 'GH-002'],
      ['Roberto Dias', '999.888.777-66', '15/01/2024', '(61) 97777-7777', 'Ferista Geral', 'EFETIVO', 'Green House', 'Operacional', '', '', '2200', 'GH-003'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = data[0].map(() => ({ wch: 20 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores')
    addInstructionSheet(wb, [
      ['Campo', 'Descricao'],
      ['Nome Completo', 'Nome completo do colaborador (obrigatorio)'],
      ['CPF', 'CPF com ou sem pontuacao (obrigatorio)'],
      ['Data Admissao', 'Formato DD/MM/AAAA (obrigatorio)'],
      ['Telefone', 'Telefone com DDD para WhatsApp (opcional)'],
      ['Cargo', 'Funcao exercida (opcional, padrao: Colaborador)'],
      ['Tipo Colaborador', 'EFETIVO ou INTERMITENTE (padrao: EFETIVO). Para marcar como ferista, use o painel.'],
      ['Empresa', 'Nome da empresa/filial (opcional)'],
      ['Departamento', 'Centro de custo ou contrato (opcional)'],
      ['Posto', 'Nome do posto de servico (opcional)'],
      ['Escala', 'Jornada: 8h, 12x36, 6x1, etc (opcional)'],
      ['Salario', 'Valor numerico sem R$ (opcional, ex: 2200)'],
      ['Matricula', 'Numero de registro interno (opcional)'],
      ['', ''],
      ['REGRAS', ''],
      ['CPF duplicado', 'Se o CPF ja existir, os dados serao atualizados (nao duplica)'],
      ['Campos vazios', 'Campos vazios sao ignorados na atualizacao'],
    ])
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  }

  static generateWorkplaceTemplate(): Buffer {
    const wb = XLSX.utils.book_new()
    // Colunas alinhadas com a planilha "Postos de Serviço.xlsx" exportada do
    // sistema externo. Apenas as colunas que persistimos (Lat/Lng/Cerca km e
    // os flags operacionais ficam de fora — vide auditoria 2026-05-04).
    const headers = [
      'ID', 'Nome / Apelido', 'Razão Social', 'CNPJ',
      'Responsável', 'Telefone', 'E-mail',
      'CEP', 'Logradouro', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF',
      'Status Contrato', 'Equipe Minima', 'Cliente',
      'Função', 'Escala', 'Vagas',
    ]
    const data = [
      headers,
      ['', 'INEP - Sede', 'INEP - Sede LTDA', '12.345.678/0001-99',
        'João Silva', '(61) 99999-9999', 'joao@inep.gov.br',
        '70073-000', 'SIG Quadra 6', '100', 'Bloco A', 'Asa Sul', 'Brasília', 'DF',
        'Ativo', '4', 'INEP/MEC',
        'Agente de Portaria', '12x36', '2'],
      ['', 'INEP - Sede', 'INEP - Sede LTDA', '12.345.678/0001-99',
        'João Silva', '(61) 99999-9999', 'joao@inep.gov.br',
        '70073-000', 'SIG Quadra 6', '100', 'Bloco A', 'Asa Sul', 'Brasília', 'DF',
        'Ativo', '4', 'INEP/MEC',
        'Recepcionista', '8h', '2'],
      ['', 'TRF 1ª Região', 'Tribunal Regional Federal', '00.000.000/0001-00',
        '', '', '',
        '70297-400', 'SGAS 600', '', '', 'Asa Sul', 'Brasília', 'DF',
        'Ativo', '6', 'TRF',
        'Vigilante', '12x36', '4'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = headers.map(() => ({ wch: 18 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Postos')
    addInstructionSheet(wb, [
      ['Campo', 'Descricao'],
      ['ID', 'Identificador externo (opcional). Útil para idempotência em re-imports.'],
      ['Nome / Apelido', 'Nome curto de identificação do posto (obrigatório)'],
      ['Razão Social', 'Nome jurídico oficial da contratante (opcional)'],
      ['CNPJ', 'CNPJ formatado ou numérico (opcional)'],
      ['Responsável', 'Pessoa de contato no posto (opcional)'],
      ['Telefone', 'Telefone de contato (opcional)'],
      ['E-mail', 'E-mail de contato (opcional)'],
      ['CEP', 'CEP do posto (opcional)'],
      ['Logradouro', 'Rua / Avenida (opcional)'],
      ['Número', 'Número do logradouro (opcional)'],
      ['Complemento', 'Bloco, sala, etc (opcional)'],
      ['Bairro', 'Bairro (opcional)'],
      ['Cidade', 'Cidade (opcional)'],
      ['UF', 'Sigla do estado, 2 letras (opcional)'],
      ['Status Contrato', 'Ativo / Inativo / Suspenso (padrão: Ativo)'],
      ['Equipe Minima', 'Minimo de colaboradores necessários no posto (padrão: 1)'],
      ['Cliente', 'Empresa/órgão contratante (opcional, alternativo à Razão Social)'],
      ['Função', 'Cargo neste posto (Vigilante, Recepcionista, etc) - opcional'],
      ['Escala', 'Padrão de jornada (8h, 12x36, 6x1, etc) - opcional'],
      ['Vagas', 'Quantidade de vagas para esta função (padrão: 1)'],
      ['', ''],
      ['REGRAS', ''],
      ['Mesmo posto', 'Várias linhas com o mesmo Nome criam funções diferentes no mesmo posto'],
      ['Posto existente', 'Se o ID externo ou Nome já existir, atualiza dados; cria apenas novas funções'],
      ['Idempotência', 'Re-importar a mesma planilha NÃO duplica registros'],
    ])
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  }

  static generateAllocationTemplate(): Buffer {
    const wb = XLSX.utils.book_new()
    const data = [
      ['CPF Colaborador', 'Posto', 'Funcao', 'Data Inicio'],
      ['111.222.333-44', 'INEP - Sede', 'Agente de Portaria', '01/04/2026'],
      ['555.666.777-88', 'TRF 1a Regiao', 'Recepcionista', '01/04/2026'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = data[0].map(() => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Alocacoes')
    addInstructionSheet(wb, [
      ['Campo', 'Descricao'],
      ['CPF Colaborador', 'CPF do colaborador a ser alocado (obrigatorio)'],
      ['Posto', 'Nome exato do posto de trabalho (obrigatorio, deve existir no sistema)'],
      ['Funcao', 'Nome exato da funcao/cargo no posto (obrigatorio, deve existir no posto)'],
      ['Data Inicio', 'Data de inicio da alocacao, formato DD/MM/AAAA (obrigatorio)'],
      ['', ''],
      ['REGRAS', ''],
      ['Colaborador ja alocado', 'Se o colaborador ja tiver alocacao ativa, sera encerrada antes de criar a nova'],
      ['Posto/Funcao', 'Devem existir previamente no sistema. Importe postos antes de alocacoes'],
    ])
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  }

  static generateVacationTemplate(): Buffer {
    const wb = XLSX.utils.book_new()
    const data = [
      ['CPF Colaborador', 'Data Inicio', 'Data Fim', 'Dias'],
      ['111.222.333-44', '01/07/2026', '30/07/2026', '30'],
      ['555.666.777-88', '15/08/2026', '29/08/2026', '15'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = data[0].map(() => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Ferias')
    addInstructionSheet(wb, [
      ['Campo', 'Descricao'],
      ['CPF Colaborador', 'CPF do colaborador (obrigatorio, deve existir no sistema)'],
      ['Data Inicio', 'Primeiro dia das ferias, formato DD/MM/AAAA (obrigatorio)'],
      ['Data Fim', 'Ultimo dia das ferias, formato DD/MM/AAAA (obrigatorio)'],
      ['Dias', 'Total de dias (opcional, calculado automaticamente se vazio)'],
      ['', ''],
      ['REGRAS', ''],
      ['Validacao CLT', 'Minimo 5 dias, nao pode iniciar em quinta/sexta (Art. 134)'],
      ['Saldo', 'O sistema verifica se o colaborador tem saldo disponivel'],
      ['Status', 'Ferias importadas entram como PENDING (aguardando aprovacao do RH)'],
    ])
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  }
}
