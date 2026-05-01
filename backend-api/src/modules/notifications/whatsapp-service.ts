import { PrismaClient } from '@prisma/client'
import { resolveWhatsappCredential } from '../credentials/credential-resolver'

export class WhatsAppService {
  /**
   * Formata número de telefone para o padrão internacional brasileiro.
   * Remove caracteres não numéricos e garante prefixo 55.
   */
  static formatPhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '')
    if (!cleaned.startsWith('55')) {
      cleaned = '55' + cleaned
    }
    return cleaned
  }

  /**
   * Envia mensagem WhatsApp via Evolution API GLOBAL (Super Admin).
   * V3.1: tenant não tem mais credenciais Evolution próprias.
   *
   * @param prisma PrismaClient
   * @param phone número destino (formato BR aceito; será normalizado para 55XXXXXXXXXXX)
   * @param text texto da mensagem
   * @param tenantId opcional — apenas para logging/auditoria
   */
  static async sendMessage(
    prisma: PrismaClient,
    phone: string,
    text: string,
    tenantId?: string
  ): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      // 1) Pool multi-credencial (V3.1)
      let evoApiUrl: string | null = null
      let evoApiKey: string | null = null
      let evoInstanceName: string | null = null
      if (tenantId) {
        const cred = await resolveWhatsappCredential(prisma, tenantId)
        if (cred) {
          evoApiUrl = cred.evoApiUrl; evoApiKey = cred.evoApiKey; evoInstanceName = cred.evoInstanceName
        }
      } else {
        const allCred = await prisma.whatsappCredential.findFirst({ where: { isActive: true, scope: 'ALL' } })
        if (allCred) {
          evoApiUrl = allCred.evoApiUrl; evoApiKey = allCred.evoApiKey; evoInstanceName = allCred.evoInstanceName
        }
      }

      // 2) Fallback: SystemConfig
      if (!evoApiUrl || !evoApiKey || !evoInstanceName) {
        const config = await prisma.systemConfig.findUnique({
          where: { id: 'singleton' },
          select: { evoApiUrl: true, evoApiKey: true, evoInstanceName: true }
        })
        if (config?.evoApiUrl && config?.evoApiKey && config?.evoInstanceName) {
          evoApiUrl = config.evoApiUrl; evoApiKey = config.evoApiKey; evoInstanceName = config.evoInstanceName
        }
      }

      if (!evoApiUrl || !evoApiKey || !evoInstanceName) {
        const msg = 'Nenhuma credencial Evolution disponível. Super Admin deve configurar em /admin > Credenciais.'
        console.warn(`[WhatsApp] ${msg}`)
        return { ok: false, error: msg }
      }

      const formattedPhone = this.formatPhone(phone)
      const url = `${evoApiUrl.replace(/\/+$/, '')}/message/sendText/${evoInstanceName}`

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evoApiKey },
        body: JSON.stringify({ number: formattedPhone, text })
      })

      if (!response.ok) {
        const errorBody = await response.text()
        console.error(`[WhatsApp] Erro: ${response.status} - ${errorBody}`)
        return { ok: false, status: response.status, error: errorBody }
      }

      console.log(`[WhatsApp] Mensagem enviada para ${formattedPhone}${tenantId ? ` (tenant ${tenantId})` : ''}.`)
      return { ok: true, status: response.status }
    } catch (error: any) {
      console.error(`[WhatsApp] Exceção: ${error.message}`)
      return { ok: false, error: error.message }
    }
  }

  /**
   * Compat wrapper — para call sites antigos que usavam (tenantId, phone, text, prisma).
   * @deprecated Use sendMessage(prisma, phone, text, tenantId) — será removido após migração.
   */
  static async sendMessageLegacy(
    tenantId: string,
    phone: string,
    text: string,
    prisma: PrismaClient
  ): Promise<boolean> {
    const result = await this.sendMessage(prisma, phone, text, tenantId)
    return result.ok
  }

  /**
   * Verifica o estado da conexão da instância Evolution API GLOBAL.
   * V3.1: configuração agora é única, gerenciada pelo Super Admin.
   */
  static async checkConnection(
    prisma: PrismaClient,
    tenantId?: string
  ): Promise<{ connected: boolean; state?: string; error?: string }> {
    try {
      let evoApiUrl: string | null = null
      let evoApiKey: string | null = null
      let evoInstanceName: string | null = null

      if (tenantId) {
        const cred = await resolveWhatsappCredential(prisma, tenantId)
        if (cred) {
          evoApiUrl = cred.evoApiUrl; evoApiKey = cred.evoApiKey; evoInstanceName = cred.evoInstanceName
        }
      } else {
        const allCred = await prisma.whatsappCredential.findFirst({ where: { isActive: true, scope: 'ALL' } })
        if (allCred) {
          evoApiUrl = allCred.evoApiUrl; evoApiKey = allCred.evoApiKey; evoInstanceName = allCred.evoInstanceName
        }
      }

      if (!evoApiUrl || !evoApiKey || !evoInstanceName) {
        const config = await prisma.systemConfig.findUnique({
          where: { id: 'singleton' },
          select: { evoApiUrl: true, evoApiKey: true, evoInstanceName: true }
        })
        if (config?.evoApiUrl && config?.evoApiKey && config?.evoInstanceName) {
          evoApiUrl = config.evoApiUrl; evoApiKey = config.evoApiKey; evoInstanceName = config.evoInstanceName
        }
      }

      if (!evoApiUrl || !evoApiKey || !evoInstanceName) {
        return { connected: false, error: 'Nenhuma credencial Evolution disponível.' }
      }

      const url = `${evoApiUrl.replace(/\/+$/, '')}/instance/connectionState/${evoInstanceName}`
      const response = await fetch(url, { method: 'GET', headers: { apikey: evoApiKey } })

      if (!response.ok) {
        const errorBody = await response.text()
        return { connected: false, error: `Erro HTTP ${response.status}: ${errorBody}` }
      }

      const data = await response.json() as any
      const state = data?.instance?.state || data?.state || 'unknown'
      return { connected: state === 'open', state }
    } catch (error: any) {
      return { connected: false, error: error.message }
    }
  }

  /**
   * Envia o código 2FA para assinatura via WhatsApp (usando config global).
   */
  static async sendOTP(
    tenantId: string,
    phone: string,
    code: string,
    prisma: PrismaClient
  ): Promise<boolean> {
    const message = `Seu código de assinatura de férias é: ${code}. Ele expira em 5 minutos.`
    const result = await this.sendMessage(prisma, phone, message, tenantId)
    return result.ok
  }
}
