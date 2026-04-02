import { parse, isValid } from 'date-fns'

export class SanitizationService {
  /**
   * Limpa e formata o nome para Title Case.
   * "BRUNO sANTOS" -> "Bruno Santos"
   */
  static sanitizeName(name: string): string {
    if (!name) return ''
    return name
      .trim()
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  /**
   * Remove qualquer pontuação do CPF (mantém apenas números).
   */
  static sanitizeCPF(cpf: string): string {
    if (!cpf) return ''
    return cpf.replace(/\D/g, '')
  }

  /**
   * Tenta interpretar a data em múltiplos formatos comuns e retorna um objeto Date.
   * Lança erro se a data for inválida.
   */
  static sanitizeDate(dateStr: string): Date {
    if (!dateStr) throw new Error('Data de admissão ausente.')

    const formats = ['dd/MM/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy', 'dd-MM-yyyy']
    
    // Tenta parsing direto (ISO ou Excel format)
    let parsedDate = new Date(dateStr)
    if (isValid(parsedDate)) return parsedDate

    // Tenta formatos específicos
    for (const fmt of formats) {
      parsedDate = parse(dateStr, fmt, new Date())
      if (isValid(parsedDate)) return parsedDate
    }

    throw new Error(`Formato de data inválido: ${dateStr}`)
  }
}
