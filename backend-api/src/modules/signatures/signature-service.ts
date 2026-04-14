import PDFDocument from 'pdfkit'
import { createHash } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { ROIEngine } from '../finance/roi-engine'

export interface DocumentData {
  tenantName: string;
  tenantCnpj: string;
  employeeName: string;
  cpf: string;
  position: string;
  hireDate: string;
  startDate: string;
  endDate: string;
  days: number;
  salary: number;
  acquisitivePeriod?: string;
}

export class SignatureService {
  static async generateReceipt(data: DocumentData): Promise<{ buffer: Buffer; hash: string }> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' })
      const chunks: Buffer[] = []

      doc.on('data', chunk => chunks.push(chunk))
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks)
        const hash = createHash('sha256').update(buffer).digest('hex')
        resolve({ buffer, hash })
      })
      doc.on('error', reject)

      const financial = data.salary > 0
        ? ROIEngine.calculateImpact(data.salary, data.days)
        : null

      // Cabecalho
      doc.fontSize(16).font('Helvetica-Bold').text('AVISO E RECIBO DE FERIAS', { align: 'center' })
      doc.fontSize(10).font('Helvetica').text('(Art. 145 da CLT - Consolidacao das Leis do Trabalho)', { align: 'center' })
      doc.moveDown(1.5)

      // Dados da Empresa
      doc.fontSize(11).font('Helvetica-Bold').text('EMPREGADOR')
      doc.font('Helvetica').fontSize(10)
      doc.text(`Razao Social: ${data.tenantName}`)
      doc.text(`CNPJ: ${data.tenantCnpj}`)
      doc.moveDown()

      // Dados do Colaborador
      doc.font('Helvetica-Bold').fontSize(11).text('EMPREGADO')
      doc.font('Helvetica').fontSize(10)
      doc.text(`Nome: ${data.employeeName}`)
      doc.text(`CPF: ${data.cpf}`)
      doc.text(`Cargo/Funcao: ${data.position}`)
      doc.text(`Data de Admissao: ${data.hireDate}`)
      doc.moveDown()

      // Periodo de Ferias
      doc.font('Helvetica-Bold').fontSize(11).text('PERIODO DE FERIAS')
      doc.font('Helvetica').fontSize(10)
      if (data.acquisitivePeriod) {
        doc.text(`Periodo Aquisitivo: ${data.acquisitivePeriod}`)
      }
      doc.text(`Periodo de Gozo: ${data.startDate} a ${data.endDate}`)
      doc.text(`Total de Dias: ${data.days} dias corridos`)
      doc.moveDown()

      // Valores (se salario disponivel)
      if (financial) {
        doc.font('Helvetica-Bold').fontSize(11).text('DEMONSTRATIVO DE VALORES')
        doc.font('Helvetica').fontSize(10)
        doc.text(`Remuneracao de Ferias: R$ ${financial.baseAmount.toFixed(2)}`)
        doc.text(`Adicional de 1/3 Constitucional: R$ ${financial.bonusOneThird.toFixed(2)}`)
        doc.text(`FGTS sobre Ferias: R$ ${financial.fgts.toFixed(2)}`)
        doc.font('Helvetica-Bold')
        doc.text(`TOTAL BRUTO: R$ ${(financial.baseAmount + financial.bonusOneThird).toFixed(2)}`)
        doc.font('Helvetica')
        doc.moveDown()
      }

      // Declaracao
      doc.moveDown()
      doc.fontSize(10).text(
        'Pelo presente, declaro que fui comunicado(a) sobre o periodo de ferias acima descrito, ' +
        'conforme as disposicoes dos Arts. 129 a 145 da CLT. Confirmo o recebimento dos valores ' +
        'correspondentes e dou plena e geral quitacao.',
        { align: 'justify' }
      )
      doc.moveDown(2)

      // Campos de assinatura
      const y = doc.y
      doc.text('_________________________________', 72, y)
      doc.text('Empregador', 72, y + 15)
      doc.text('_________________________________', 350, y)
      doc.text('Empregado(a)', 350, y + 15)
      doc.moveDown(3)

      // Local e data
      const hoje = new Date()
      const dataEmissao = `${hoje.getDate().toString().padStart(2, '0')}/${(hoje.getMonth() + 1).toString().padStart(2, '0')}/${hoje.getFullYear()}`
      doc.text(`Emitido em: ${dataEmissao}`, { align: 'center' })
      doc.moveDown(2)

      // Rodape de integridade
      const docHash = createHash('sha256').update(JSON.stringify(data)).digest('hex')
      doc.fontSize(7).fillColor('grey')
      doc.text('Documento gerado eletronicamente pelo sistema GestaoFerias.', { align: 'center' })
      doc.text(`Codigo de verificacao: ${docHash}`, { align: 'center' })

      doc.end()
    })
  }

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
