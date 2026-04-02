export class WhatsAppService {
  /**
   * Envia uma mensagem via WhatsApp usando a Evo API.
   * Mock para Story 4.2.
   */
  static async sendMessage(to: string, message: string): Promise<boolean> {
    const cleanNumber = to.replace(/\D/g, '')
    
    // Simulação de chamada externa (Evo API)
    console.log(`\n==== WHATSAPP SENT (MOCK) ====\nTo: ${cleanNumber}\nMessage: ${message}\n==============================\n`)
    
    return true
  }

  /**
   * Envia o código 2FA para assinatura.
   */
  static async sendOTP(to: string, code: string): Promise<boolean> {
    const message = `Seu código de assinatura de férias é: ${code}. Ele expira em 5 minutos.`
    return await this.sendMessage(to, message)
  }
}
