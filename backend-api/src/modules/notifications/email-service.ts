import nodemailer from 'nodemailer'
import { PrismaClient } from '@prisma/client'

export class EmailService {
  /**
   * Envia email de reset de senha usando SMTP global.
   */
  static async sendPasswordReset(
    to: string,
    code: string,
    prisma: PrismaClient
  ): Promise<boolean> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
        <h2 style="color:#3b82f6;margin-bottom:16px">Recuperacao de Senha</h2>
        <p>Voce solicitou a recuperacao de senha. Use o codigo abaixo:</p>
        <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;margin:24px 0">
          <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#22c55e">${code}</span>
        </div>
        <p style="color:#94a3b8;font-size:13px">Este codigo expira em 30 minutos. Se voce nao solicitou esta recuperacao, ignore este email.</p>
        <hr style="border:none;border-top:1px solid #334155;margin:24px 0">
        <p style="color:#475569;font-size:11px">GestaoFerias - Sistema de Gestao de Ferias</p>
      </div>
    `
    return await EmailService.sendGlobalMail(to, 'Recuperacao de Senha - GestaoFerias', html, prisma)
  }

  /**
   * Envia email de verificacao de email usando SMTP global.
   */
  static async sendEmailVerification(
    to: string,
    code: string,
    prisma: PrismaClient
  ): Promise<boolean> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
        <h2 style="color:#3b82f6;margin-bottom:16px">Verificacao de Email</h2>
        <p>Seu codigo de verificacao:</p>
        <div style="background:#1e293b;padding:16px;border-radius:8px;text-align:center;margin:24px 0">
          <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#22c55e">${code}</span>
        </div>
        <p style="color:#94a3b8;font-size:13px">Insira este codigo no sistema para confirmar seu email.</p>
        <hr style="border:none;border-top:1px solid #334155;margin:24px 0">
        <p style="color:#475569;font-size:11px">GestaoFerias - Sistema de Gestao de Ferias</p>
      </div>
    `
    return await EmailService.sendGlobalMail(to, 'Verifique seu Email - GestaoFerias', html, prisma)
  }

  /**
   * Envia email usando o SMTP global (SystemConfig).
   * Usado para emails do sistema (reset, verificacao, etc.)
   */
  static async sendGlobalMail(
    to: string,
    subject: string,
    html: string,
    prisma: PrismaClient
  ): Promise<boolean> {
    const config = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } })

    if (!config?.smtpHost || !config?.smtpPort || !config?.smtpUser || !config?.smtpPass) {
      console.warn('[EMAIL] SMTP global nao configurado. Configure em Painel Admin > SMTP.')
      return false
    }

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    })

    try {
      await transporter.sendMail({
        from: config.smtpFrom || config.smtpUser,
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

  /**
   * Envia email usando SMTP do tenant (para notificacoes especificas do tenant).
   * Fallback: usa SMTP global se tenant nao tiver SMTP configurado.
   */
  static async sendMail(
    tenantId: string,
    to: string,
    subject: string,
    html: string,
    prisma: PrismaClient
  ): Promise<boolean> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })

    // Se tenant tem SMTP proprio, usar
    if (tenant?.smtpHost && tenant?.smtpPort && tenant?.smtpUser && tenant?.smtpPass) {
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
        console.error(`[EMAIL] Falha SMTP do tenant. Tentando SMTP global...`)
        // Fallback para SMTP global
      }
    }

    // Fallback: usar SMTP global
    return await EmailService.sendGlobalMail(to, subject, html, prisma)
  }
}
