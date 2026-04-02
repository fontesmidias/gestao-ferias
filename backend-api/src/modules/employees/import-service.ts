import * as Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface RawEmployee {
  name: string;
  cpf: string;
  hireDate: string;
}

export class ImportService {
  /**
   * Converte um buffer de arquivo (CSV ou Excel) em uma lista de objetos RawEmployee.
   * Suporta formatos .csv, .xlsx, .xls
   */
  static async parseFile(buffer: Buffer, fileExtension: string): Promise<RawEmployee[]> {
    if (fileExtension === 'csv') {
      const csvString = buffer.toString('utf-8')
      const result = Papa.parse(csvString, { header: true, skipEmptyLines: true })
      
      return result.data.map((row: any) => ({
        name: row.name || row.Nome || '',
        cpf: row.cpf || row.CPF || '',
        hireDate: row.hireDate || row.hire_date || row['Data de Admissão'] || ''
      }))
    }

    if (['xlsx', 'xls'].includes(fileExtension)) {
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const rows = XLSX.utils.sheet_to_json(worksheet)

      return rows.map((row: any) => ({
        name: row.name || row.Nome || '',
        cpf: row.cpf || row.CPF || '',
        hireDate: row.hireDate || row.hire_date || row['Data de Admissão'] || ''
      }))
    }

    throw new Error('Formato de arquivo não suportado (apenas .csv, .xlsx, .xls)')
  }
}
