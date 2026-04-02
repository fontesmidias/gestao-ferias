import crypto from 'crypto'

export interface WebhookPayload {
  event: string;
  timestamp: string;
  tenantId: string;
  data: any;
}

export class WebhookService {
  /**
   * Calcula a assinatura HMAC-SHA256 para garantir a autenticidade do Webhook.
   * Story 6.1.
   */
  static generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
  }

  /**
   * Dispara o webhook para a URL de destino com o cabeçalho de segurança.
   * Story 6.1.
   */
  static async trigger(url: string, secret: string, payload: WebhookPayload): Promise<boolean> {
    const body = JSON.stringify(payload)
    const signature = this.generateSignature(body, secret)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SaaS-Signature': signature,
          'X-SaaS-Event': payload.event,
        },
        body
      })

      return response.ok
    } catch (error) {
      console.error(`[WEBHOOK-ERROR] Falha ao disparar para ${url}:`, error)
      return false
    }
  }
}
