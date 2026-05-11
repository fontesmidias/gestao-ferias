/**
 * Service Worker — GestãoFérias PWA (Story 5.3)
 * - Cache de saldo e histórico do colaborador (network-first)
 * - Push notification handler + notificationclick (Story 5.3 / L1)
 *
 * NOTE infra: web push real exige VAPID keys + endpoint backend para
 * persistir subscription (PushSubscription model). Por ora, este SW está
 * pronto: quando o backend subscrever clientes via VAPID, eventos `push`
 * já serão consumidos aqui sem mudança no frontend.
 */

const CACHE_NAME = 'gestao-ferias-v3'
const STATIC_ASSETS = [
  '/employee/dashboard',
  '/manifest.json',
]

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event

  // V3.4 fix: nunca intercepta cross-origin (CORS preflight + backend api domain).
  // Antes o SW tentava cachear responses opacas e crashava com
  // "Failed to convert value to 'Response'".
  let url
  try { url = new URL(request.url) } catch { return }
  if (url.origin !== self.location.origin) return

  // Nao intercepta nada que nao seja GET (mutacoes nao devem ser cacheadas).
  if (request.method !== 'GET') return

  // API calls (mesma origem): network-first com cache fallback como Response valida.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {})
          }
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request)
          return cached || new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
        }),
    )
    return
  }

  // Static assets: cache-first com fallback
  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached
      try { return await fetch(request) } catch { return new Response('', { status: 504 }) }
    }),
  )
})

// Push notification handler — Story 5.3 AC linha 765, 770.
// Payload esperado do backend:
//   { title: string, body: string, url?: string, tag?: string }
self.addEventListener('push', (event) => {
  let payload = { title: 'GestãoFérias', body: 'Você tem uma nova notificação.' }
  if (event.data) {
    try { payload = { ...payload, ...event.data.json() } } catch {/* texto puro */}
  }
  const options = {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    tag: payload.tag || 'gestao-ferias',
    data: { url: payload.url || '/employee/dashboard' },
    requireInteraction: false,
  }
  event.waitUntil(self.registration.showNotification(payload.title, options))
})

// Click → abre PWA na URL do payload (default: dashboard).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/employee/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
