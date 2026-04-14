import * as Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface RawEmployee {
  name: string;
  cpf: string;
  hireDate: string;
  phone?: string;
  position?: string;
  employeeType?: string;
  branch?: string;
  department?: string;
  workplace?: string;
  shift?: string;
  salary?: string;
  registration?: string;
}

export interface RawWorkplace {
  name: string;
  client?: string;
  address?: string;
  city?: string;
  minStaff?: string;
  positionRole?: string;
  positionShift?: string;
  positionCount?: string;
}

const EMPLOYEE_FIELD_MAP: Record<string, keyof RawEmployee> = {
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

const WORKPLACE_FIELD_MAP: Record<string, keyof RawWorkplace> = {
  'name': 'name', 'nome': 'name', 'Nome': 'name', 'Nome do Posto': 'name', 'Posto': 'name',
  'client': 'client', 'cliente': 'client', 'Cliente': 'client', 'Contratante': 'client',
  'address': 'address', 'endereco': 'address', 'Endereco': 'address',
  'city': 'city', 'cidade': 'city', 'Cidade': 'city',
  'minStaff': 'minStaff', 'equipe_minima': 'minStaff', 'Equipe Minima': 'minStaff',
  'positionRole': 'positionRole', 'funcao': 'positionRole', 'Funcao': 'positionRole', 'Cargo no Posto': 'positionRole',
  'positionShift': 'positionShift', 'escala': 'positionShift', 'Escala': 'positionShift',
  'positionCount': 'positionCount', 'quantidade': 'positionCount', 'Quantidade': 'positionCount', 'Vagas': 'positionCount',
}

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

export class ImportService {
  static async parseEmployees(buffer: Buffer, ext: string): Promise<RawEmployee[]> {
    return parseBuffer<RawEmployee>(buffer, ext, EMPLOYEE_FIELD_MAP)
  }

  static async parseWorkplaces(buffer: Buffer, ext: string): Promise<RawWorkplace[]> {
    return parseBuffer<RawWorkplace>(buffer, ext, WORKPLACE_FIELD_MAP)
  }

  // Alias mantido para compatibilidade
  static async parseFile(buffer: Buffer, ext: string): Promise<RawEmployee[]> {
    return this.parseEmployees(buffer, ext)
  }

  static generateEmployeeTemplate(): Buffer {
    const wb = XLSX.utils.book_new()
    const data = [
      ['Nome Completo', 'CPF', 'Data Admissao', 'Telefone', 'Cargo', 'Tipo Colaborador', 'Empresa', 'Departamento', 'Posto', 'Escala', 'Salario', 'Matricula'],
      ['Carlos Silva', '111.222.333-44', '15/03/2022', '(61) 99999-9999', 'Agente de Portaria', 'EFETIVO', 'Green House', 'Operacional', 'INEP - Sede', '12x36', '2200', 'GH-001'],
      ['Ana Santos', '555.666.777-88', '01/07/2021', '(61) 98888-8888', 'Recepcionista', 'EFETIVO', 'Green House', 'Administrativo', 'TRF', '8h', '1800', 'GH-002'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = data[0].map(() => ({ wch: 20 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores')
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  }

  static generateWorkplaceTemplate(): Buffer {
    const wb = XLSX.utils.book_new()
    const data = [
      ['Nome do Posto', 'Cliente', 'Endereco', 'Cidade', 'Equipe Minima', 'Funcao', 'Escala', 'Vagas'],
      ['INEP - Sede', 'INEP/MEC', 'SIG Quadra 6, Brasilia-DF', 'Brasilia', '4', 'Agente de Portaria', '12x36', '2'],
      ['INEP - Sede', 'INEP/MEC', 'SIG Quadra 6, Brasilia-DF', 'Brasilia', '4', 'Recepcionista', '8h', '2'],
      ['TRF 1a Regiao', 'TRF', 'SGAS 600, Brasilia-DF', 'Brasilia', '6', 'Vigilante', '12x36', '4'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = data[0].map(() => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Postos')
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  }
}
