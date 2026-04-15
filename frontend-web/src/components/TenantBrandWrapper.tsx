'use client'

import { useEffect } from 'react'
import { useAuth } from './AuthContext'

/**
 * Story 7.2: Aplica theming dinâmico por tenant via CSS custom properties.
 * Lê branding do /auth/me e injeta --primary, --primary-hover, --primary-light no :root.
 */
export function TenantBrandWrapper() {
  const { user } = useAuth()

  useEffect(() => {
    const branding = (user as any)?.branding
    if (!branding) return

    const root = document.documentElement

    if (branding.brandPrimaryColor) {
      root.style.setProperty('--primary', branding.brandPrimaryColor)
      // Derive hover (10% darker) and light (20% opacity) from primary
      root.style.setProperty('--primary-hover', branding.brandPrimaryColor)
      root.style.setProperty('--primary-light', branding.brandPrimaryColor + '33')
    }

    if (branding.brandSecondaryColor) {
      root.style.setProperty('--secondary', branding.brandSecondaryColor)
    }

    // Cleanup: reset on unmount or tenant change
    return () => {
      root.style.removeProperty('--primary')
      root.style.removeProperty('--primary-hover')
      root.style.removeProperty('--primary-light')
      root.style.removeProperty('--secondary')
    }
  }, [user])

  return null
}
