import { PrismaClient } from '@prisma/client'

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
   * Envia uma mensagem de texto via Evolution API.
   * Busca as configurações do tenant no banco de dados.
   */
  static async sendMessage(
    tenantId: string,
    phone: string,
    text: string,
    prisma: PrismaClient
  ): Promise<boolean> {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          whatsappEnabled: true,
          evoApiUrl: true,
          evoApiKey: true,
          evoInstanceName: true,
        },
      })

      if (!tenant) {
        console.warn(`[WhatsApp] Tenant ${tenantId} não encontrado.`)
        return false
      }

      if (!tenant.whatsappEnabled) {
        console.warn(`[WhatsApp] WhatsApp desabilitado para o tenant ${tenantId}.`)
        return false
      }

      if (!tenant.evoApiUrl || !tenant.evoApiKey || !tenant.evoInstanceName) {
        console.warn(`[WhatsApp] Configuração da Evolution API incompleta para o tenant ${tenantId}.`)
        return false
      }

      const formattedPhone = this.formatPhone(phone)
      const url = `${tenant.evoApiUrl.replace(/\/+$/, '')}/message/sendText/${tenant.evoInstanceName}`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: tenant.evoApiKey,
        },
        body: JSON.stringify({
          number: formattedPhone,
          text,
        }),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        console.error(`[WhatsApp] Erro ao enviar mensagem: ${response.status} - ${errorBody}`)
        return false
      }

      console.log(`[WhatsApp] Mensagem enviada para ${formattedPhone} (tenant ${tenantId}).`)
      return true
    } catch (error: any) {
      console.error(`[WhatsApp] Exceção ao enviar mensagem: ${error.message}`)
      return false
    }
  }

  /**
   * Verifica o estado da conexão da instância na Evolution API.
   */
  static async checkConnection(
    tenantId: string,
    prisma: PrismaClient
  ): Promise<{ connected: boolean; state?: string; error?: string }> {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          evoApiUrl: true,
          evoApiKey: true,
          evoInstanceName: true,
          whatsappEnabled: true,
        },
      })

      if (!tenant || !tenant.evoApiUrl || !tenant.evoApiKey || !tenant.evoInstanceName) {
        return { connected: false, error: 'Configuração da Evolution API incompleta.' }
      }

      const url = `${tenant.evoApiUrl.replace(/\/+$/, '')}/instance/connectionState/${tenant.evoInstanceName}`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          apikey: tenant.evoApiKey,
        },
      })

      if (!response.ok) {
        const errorBody = await response.text()
        return { connected: false, error: `Erro HTTP ${response.status}: ${errorBody}` }
      }

      const data = await response.json() as any
      const state = data?.instance?.state || data?.state || 'unknown'
      const connected = state === 'open'

      return { connected, state }
    } catch (error: any) {
      return { connected: false, error: error.message }
    }
  }

  /**
   * Envia o código 2FA para assinatura via WhatsApp.
   */
  static async sendOTP(
    tenantId: string,
    phone: string,
    code: string,
    prisma: PrismaClient
  ): Promise<boolean> {
    const message = `Seu código de assinatura de férias é: ${code}. Ele expira em 5 minutos.`
    return await this.sendMessage(tenantId, phone, message, prisma)
  }
}
