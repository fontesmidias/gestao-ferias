import nodemailer from 'nodemailer'
import { PrismaClient } from '@prisma/client'

export class EmailService {
  /**
   * Envia um e-mail usando a configuração SMTP do tenant.
   */
  static async sendMail(
    tenantId: string,
    to: string,
    subject: string,
    html: string,
    prisma: PrismaClient
  ): Promise<boolean> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })

    if (!tenant?.smtpHost || !tenant?.smtpPort || !tenant?.smtpUser || !tenant?.smtpPass) {
      console.warn(`[EMAIL] SMTP não configurado para tenant ${tenantId}. E-mail não enviado.`)
      return false
    }

    const transporter = nodemailer.createTransport({
      host: tenant.smtpHost,
      port: tenant.smtpPort,
      secure: tenant.smtpPort === 465,
      auth: {
        user: tenant.smtpUser,
        pass: tenant.smtpPass,
      },
    })

    try {
      await transporter.sendMail({
        from: tenant.smtpFrom || tenant.smtpUser,
        to,
        subject,
        html,
      })
      console.log(`[EMAIL] Enviado para ${to}: ${subject}`)
      return true
    } catch (error) {
      console.error(`[EMAIL] Falha ao enviar para ${to}:`, error)
      return false
    }
  }
}
