import { PrismaClient } from '@prisma/client'

const ZAPSIGN_API_URL = 'https://api.zapsign.com.br/api/v1'

interface ZapSignSigner {
  name: string
  email?: string
  phone_country?: string
  phone_number?: string
}

interface ZapSignSignerResult {
  token: string
  signUrl: string
}

interface ZapSignCreateResult {
  docToken: string
  signers: ZapSignSignerResult[]
}

export class ZapSignService {
  /**
   * Verifica se o tenant possui token ZapSign configurado.
   */
  static async isConfigured(tenantId: string, prisma: PrismaClient): Promise<boolean> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { zapSignToken: true },
    })
    return !!(tenant?.zapSignToken)
  }

  /**
   * Busca o token ZapSign do tenant.
   */
  private static async getToken(tenantId: string, prisma: PrismaClient): Promise<string> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { zapSignToken: true },
    })
    if (!tenant?.zapSignToken) {
      throw new Error('Token ZapSign não configurado para este tenant.')
    }
    return tenant.zapSignToken
  }

  /**
   * Cria um documento para assinatura na ZapSign.
   */
  static async createDocument(
    tenantId: string,
    pdfBase64: string,
    docName: string,
    signers: ZapSignSigner[],
    externalId: string,
    prisma: PrismaClient
  ): Promise<ZapSignCreateResult> {
    const token = await this.getToken(tenantId, prisma)

    const body = {
      name: docName,
      base64_pdf: pdfBase64,
      lang: 'pt-br',
      signers: signers.map((s) => ({
        name: s.name,
        email: s.email || '',
        phone_country: s.phone_country || '55',
        phone_number: s.phone_number || '',
        auth_mode: 'assinaturaTela',
        send_automatic_email: !!s.email,
        lock_name: true,
        lock_email: true,
      })),
      external_id: externalId,
    }

    const response = await fetch(`${ZAPSIGN_API_URL}/docs/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`ZapSign API erro ${response.status}: ${errorText}`)
    }

    const data = (await response.json()) as any

    return {
      docToken: data.token,
      signers: (data.signers || []).map((s: any) => ({
        token: s.token,
        signUrl: s.sign_url,
      })),
    }
  }

  /**
   * Consulta o status de um documento na ZapSign.
   */
  static async getDocumentStatus(
    tenantId: string,
    docToken: string,
    prisma: PrismaClient
  ): Promise<any> {
    const token = await this.getToken(tenantId, prisma)

    const response = await fetch(`${ZAPSIGN_API_URL}/docs/${docToken}/`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`ZapSign API erro ${response.status}: ${errorText}`)
    }

    return await response.json()
  }
}
