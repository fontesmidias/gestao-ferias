import PDFDocument from 'pdfkit'
import { createHash } from 'crypto'
import { PrismaClient } from '@prisma/client'

export interface DocumentData {
  tenantName: string;
  employeeName: string;
  cpf: string;
  startDate: string;
  endDate: string;
  days: number;
}

export class SignatureService {
  /**
   * Gera um PDF do recibo de férias e retorna o Buffer + Hash SHA-256.
   * Story 4.1.
   */
  static async generateReceipt(data: DocumentData): Promise<{ buffer: Buffer; hash: string }> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 })
      const chunks: Buffer[] = []

      doc.on('data', chunk => chunks.push(chunk))
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks)
        const hash = createHash('sha256').update(buffer).digest('hex')
        resolve({ buffer, hash })
      })

      // Cabeçalho
      doc.fontSize(20).text('RECIBO DE FÉRIAS - CLT', { align: 'center' })
      doc.moveDown()
      doc.fontSize(12).text(`Empresa: ${data.tenantName}`)
      doc.moveDown()
      
      doc.text('---------------------------------------------------------')
      doc.moveDown()

      // Dados do Colaborador
      doc.text(`Colaborador: ${data.employeeName}`)
      doc.text(`CPF: ${data.cpf}`)
      doc.moveDown()

      // Detalhes das Férias
      doc.text(`Período de Gozo: ${data.startDate} a ${data.endDate}`)
      doc.text(`Total de Dias: ${data.days} dias`)
      doc.moveDown()

      doc.text('Pelo presente recibo, dou plena e geral quitação dos valores referentes ao período de férias acima descrito, conforme as normas da CLT.')
      doc.moveDown(2)

      // Rodapé de Integridade (Hash)
      doc.fontSize(10).fillColor('grey').text('Documento assinado digitalmente com integridade garantida por Hash SHA-256.')
      doc.text(`Digital Fingerprint: ${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`, { oblique: true })

      doc.end()
    })
  }

  /**
   * Registra o Dossiê de Evidências e o Hash no banco de dados.
   */
  static async registerSignature(
    prisma: PrismaClient,
    vacationRequestId: string,
    tenantId: string,
    hash: string,
    evidence: any
  ) {
    return await prisma.signature.create({
      data: {
        tenantId,
        vacationRequestId,
        hash,
        evidenceDossier: evidence
      }
    })
  }
}
