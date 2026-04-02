'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

export function useSocket(tenantId: string = 'default') {
  const ws = useRef<WebSocket | null>(null)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = 'localhost:3000' // Alinhado com o Backend Fastify
    
    ws.current = new WebSocket(`${protocol}//${host}/ws?tenantId=${tenantId}`)

    ws.current.onopen = () => {
      console.log('[WS] Conectado ao servidor de notificações')
    }

    ws.current.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data)
      
      switch (type) {
        case 'IMPORT_STARTED':
          toast.info(`Iniciando importação de ${data.total} colaboradores...`)
          break
        case 'IMPORT_COMPLETED':
          toast.success(`Importação concluída! ${data.successCount} sucessos.`)
          break
        case 'NOTIFICATION_SENT':
          toast.success(`WhatsApp enviado para ${data.phone}`)
          break
        case 'NOTIFICATION_FAILED':
          toast.error(`Falha ao enviar WhatsApp para ${data.phone}`)
          break
        default:
          console.log('[WS] Evento desconhecido:', type)
      }
    }

    ws.current.onerror = (err) => {
      console.error('[WS] Erro na conexão:', err)
    }

    return () => {
      ws.current?.close()
    }
  }, [tenantId])

  return ws.current
}
