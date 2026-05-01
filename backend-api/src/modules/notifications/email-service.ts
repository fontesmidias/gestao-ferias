import nodemailer from 'nodemailer'
import { PrismaClient } from '@prisma/client'
import { resolveEmailCredential } from '../credentials/credential-resolver'

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
   * Envia email usando o SMTP global.
   * Resolução: 1) pool de credenciais (V3.1) → 2) SystemConfig (legado).
   * Usado para emails do sistema (reset, verificacao, etc.)
   */
  static async sendGlobalMail(
    to: string,
    subject: string,
    html: string,
    prisma: PrismaClient,
    tenantId?: string
  ): Promise<boolean> {
    let host: string | null = null
    let port: number | null = null
    let user: string | null = null
    let pass: string | null = null
    let from: string | null = null

    // 1) Tenta pool de credenciais (precisa tenantId para resolver SPECIFIC; sem tenantId só pega ALL)
    if (tenantId) {
      const cred = await resolveEmailCredential(prisma, tenantId)
      if (cred) {
        host = cred.smtpHost; port = cred.smtpPort; user = cred.smtpUser; pass = cred.smtpPass; from = cred.smtpFrom
      }
    } else {
      const allCred = await prisma.emailCredential.findFirst({ where: { isActive: true, scope: 'ALL' } })
      if (allCred) {
        host = allCred.smtpHost; port = allCred.smtpPort; user = allCred.smtpUser; pass = allCred.smtpPass; from = allCred.smtpFrom
      }
    }

    // 2) Fallback: SystemConfig (legado)
    if (!host || !port || !user || !pass) {
      const config = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } })
      if (config?.smtpHost && config?.smtpPort && config?.smtpUser && config?.smtpPass) {
        host = config.smtpHost; port = config.smtpPort; user = config.smtpUser; pass = config.smtpPass; from = config.smtpFrom
      }
    }

    if (!host || !port || !user || !pass) {
      console.warn('[EMAIL] Nenhuma credencial SMTP disponível. Configure em Painel Admin > Credenciais.')
      return false
    }

    const transporter = nodemailer.createTransport({
      host, port,
      secure: port === 465,
      auth: { user, pass },
    })

    try {
      await transporter.sendMail({ from: from || user, to, subject, html })
      console.log(`[EMAIL] Enviado para ${to}: ${subject}`)
      return true
    } catch (error) {
      console.error(`[EMAIL] Falha ao enviar para ${to}:`, error)
      return false
    }
  }

  /**
   * Envia email usando SMTP global (V3.1: tenant não tem mais SMTP próprio).
   * Mantém assinatura `(tenantId, ...)` por compat — tenantId é apenas usado para logging.
   */
  static async sendMail(
    tenantId: string,
    to: string,
    subject: string,
    html: string,
    prisma: PrismaClient
  ): Promise<boolean> {
    return await EmailService.sendGlobalMail(to, subject, html, prisma, tenantId)
  }

  /**
   * Envia email de teste com config SMTP arbitrária (não persiste).
   * Usado pelo botão "Testar Conexão" no painel Super Admin.
   */
  static async sendTestEmail(
    to: string,
    config: { smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string; smtpFrom?: string }
  ): Promise<{ ok: boolean; message: string; durationMs: number }> {
    const start = Date.now()
    if (!config.smtpHost || !config.smtpPort || !config.smtpUser || !config.smtpPass) {
      return { ok: false, message: 'Configuração SMTP incompleta.', durationMs: Date.now() - start }
    }
    try {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: { user: config.smtpUser, pass: config.smtpPass }
      })
      await transporter.sendMail({
        from: config.smtpFrom || config.smtpUser,
        to,
        subject: 'Teste SMTP — GestãoFérias',
        html: `<div style="font-family:Arial,sans-serif"><h3>Teste de SMTP</h3><p>Se você recebeu este e-mail, sua configuração SMTP está funcionando.</p><p style="color:#888;font-size:12px">Enviado em ${new Date().toISOString()} via ${config.smtpHost}:${config.smtpPort}</p></div>`
      })
      return { ok: true, message: `E-mail entregue para ${to}.`, durationMs: Date.now() - start }
    } catch (error: any) {
      return { ok: false, message: error.message || 'Erro desconhecido.', durationMs: Date.now() - start }
    }
  }
}
