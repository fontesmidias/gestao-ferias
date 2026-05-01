'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CheckSquare, Users, Settings, BrainCircuit, LogOut, PanelLeftOpen, PanelLeftClose, Building2, Shield, Crown, CalendarDays, KeyRound } from 'lucide-react'
import { useAuth } from '@/components/AuthContext'
import { HttpClient } from '@/lib/api-client'
import { UserProfileModal } from '@/components/UserProfileModal'
import { useTranslation } from '@/lib/i18n'

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout, loading, isImpersonating } = useAuth()
  const { t } = useTranslation()
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [badges, setBadges] = useState<Record<string, number>>({})
  const [showProfileModal, setShowProfileModal] = useState(false)

  // Buscar contagens para badges (pendentes, gaps)
  const fetchBadges = useCallback(async () => {
    if (!user || user.role === 'SUPERADMIN') return
    try {
      const [vacations, gaps] = await Promise.all([
        HttpClient.get('/vacations').catch(() => []),
        HttpClient.get('/coverages/gaps?from=' + new Date().toISOString().split('T')[0] + '&to=' + new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]).catch(() => ({ totalGaps: 0 })),
      ])
      const pending = Array.isArray(vacations) ? vacations.filter((v: any) => v.status === 'PENDING').length : 0
      setBadges({
        '/approvals': pending,
        '/coverage': gaps?.totalGaps || 0,
      })
    } catch { /* non-critical */ }
  }, [user])

  useEffect(() => {
    fetchBadges()
    const interval = setInterval(fetchBadges, 60000) // refresh every minute
    return () => clearInterval(interval)
  }, [fetchBadges])

  // Se estiver na PWA (/employee — singular, não /employees) ou não estiver logado, não mostra sidebar
  if (pathname === '/employee' || pathname.startsWith('/employee/') || pathname.startsWith('/auth')) {
    return null
  }
  if (!loading && !user) {
    return null
  }

  const expanded = pinned || hovered

  const isSuperAdmin = user?.role === 'SUPERADMIN'

  const adminSections = [
    {
      label: t('sidebar.section.operational'),
      items: [
        { href: '/dashboard', label: t('sidebar.dashboard'), icon: LayoutDashboard },
        { href: '/employees', label: t('sidebar.employees'), icon: Users },
        { href: '/approvals', label: t('sidebar.approvals'), icon: CheckSquare, matchPath: '/approvals' },
        { href: '/workplaces', label: t('sidebar.workplaces'), icon: Building2 },
        { href: '/coverage', label: t('sidebar.coverage'), icon: Shield },
      ],
    },
    {
      label: t('sidebar.section.intelligence'),
      items: [
        { href: '/predict', label: t('sidebar.predict'), icon: BrainCircuit },
      ],
    },
    {
      label: t('sidebar.section.system'),
      items: [
        { href: '/settings/holidays', label: t('sidebar.holidays'), icon: CalendarDays, matchPath: '/settings/holidays' },
        { href: '/settings', label: t('sidebar.settings'), icon: Settings, matchPath: '/settings' },
      ],
    },
  ]

  const isSuperAdminView = isSuperAdmin && !isImpersonating
  const superAdminLinks = [
    { href: '/admin', label: t('sidebar.adminPanel'), icon: Crown },
    { href: '/admin/credentials', label: t('sidebar.credentials'), icon: KeyRound },
    { href: '/dashboard', label: t('sidebar.globalDashboard'), icon: LayoutDashboard },
  ]

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (!pinned) setIsUserMenuOpen(false) }}
      className={`border-r border-white/5 bg-slate-900/50 backdrop-blur-xl flex flex-col shrink-0 transition-all duration-300 z-40 ${expanded ? 'w-64' : 'w-16'}`}
    >
      {/* Header: Logo + Pin toggle — usa brandName/brandLogoUrl se o tenant configurou (FR-V31-BRAND-001) */}
      <div className={`h-14 flex items-center border-b border-white/5 ${expanded ? 'px-4 justify-between' : 'justify-center'}`}>
        {(() => {
          const branding = (user as any)?.branding || {}
          const brandName: string | undefined = branding.brandName?.trim() || undefined
          const brandLogoUrl: string | undefined = branding.brandLogoUrl?.trim() || undefined
          return expanded ? (
            <>
              <div className="flex items-center gap-2 overflow-hidden">
                {brandLogoUrl ? (
                  <img src={brandLogoUrl} alt={brandName || 'Logo'} className="w-7 h-7 object-contain rounded-lg shrink-0" />
                ) : (
                  <div className="w-7 h-7 shrink-0 bg-gradient-to-tr from-primary to-secondary rounded-lg" />
                )}
                <h1 className="text-lg font-bold tracking-tight text-white whitespace-nowrap truncate">
                  {brandName ? (
                    <span>{brandName}</span>
                  ) : (
                    <>Gestão<span className="text-gradient">Férias</span></>
                  )}
                </h1>
              </div>
              <button
                onClick={() => setPinned(!pinned)}
                className="p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              title={pinned ? 'Recolher menu' : 'Fixar menu aberto'}
            >
              {pinned ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
          </>
          ) : (
            brandLogoUrl ? (
              <img src={brandLogoUrl} alt={brandName || 'Logo'} className="w-7 h-7 object-contain rounded-lg shrink-0" />
            ) : (
              <div className="w-7 h-7 shrink-0 bg-gradient-to-tr from-primary to-secondary rounded-lg" />
            )
          )
        })()}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 overflow-hidden overflow-y-auto">
        {isSuperAdminView ? (
          <div className="space-y-1">
            {superAdminLinks.map((link) => {
              const isActive = pathname.startsWith(link.href)
              const Icon = link.icon
              return (
                <Link key={link.href} href={link.href}
                  className={`group relative flex items-center gap-3 py-2.5 rounded-xl transition-all ${expanded ? 'px-3' : 'px-0 justify-center'} ${isActive ? 'bg-primary/10 text-primary font-bold' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                  title={!expanded ? link.label : undefined}>
                  <Icon className="w-5 h-5 shrink-0" />
                  {expanded && <span className="whitespace-nowrap text-sm">{link.label}</span>}
                  {!expanded && (
                    <span className="absolute left-full ml-3 px-2.5 py-1 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xl border border-white/10 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                      {link.label}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ) : (
          adminSections.map((section) => (
            <div key={section.label} className="mb-3">
              {expanded && (
                <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((link, idx) => {
                  // Para itens com sub-rotas (ex: /settings vs /settings/holidays), usar match exato no pai
                  const hasSubItem = section.items.some(s => s.href !== link.href && s.href.startsWith(link.href + '/'))
                  const isActive = hasSubItem ? pathname === link.href : pathname.startsWith(link.href)
                  const Icon = link.icon
                  return (
                    <Link key={`${link.href}-${idx}`} href={link.href}
                      className={`group relative flex items-center gap-3 py-2.5 rounded-xl transition-all ${expanded ? 'px-3' : 'px-0 justify-center'} ${isActive ? 'bg-primary/10 text-primary font-bold' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                      title={!expanded ? link.label : undefined}>
                      <Icon className="w-5 h-5 shrink-0" />
                      {expanded && (
                        <span className="flex-1 flex items-center justify-between">
                          <span className="whitespace-nowrap text-sm">{link.label}</span>
                          {badges[link.href] > 0 && (
                            <span className={`min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-bold text-white ${
                              link.href === '/coverage' ? 'bg-red-500' : 'bg-amber-500'
                            }`}>
                              {badges[link.href]}
                            </span>
                          )}
                        </span>
                      )}
                      {!expanded && (
                        <>
                          {badges[link.href] > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
                          )}
                          <span className="absolute left-full ml-3 px-2.5 py-1 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xl border border-white/10 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                            {link.label}{badges[link.href] > 0 ? ` (${badges[link.href]})` : ''}
                          </span>
                        </>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </nav>

      {/* User Section + Logout 1-click (FR-V31-SES-003) */}
      <div className="px-2 py-3 border-t border-white/5 relative flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowProfileModal(true)}
          className={`group relative flex-1 flex items-center gap-3 p-2 bg-slate-800/50 rounded-xl overflow-hidden hover:bg-slate-700/60 transition-colors text-left ${!expanded ? 'justify-center' : ''}`}
          title={expanded ? 'Editar perfil' : (user?.name || 'Conta')}
          aria-label="Editar perfil"
        >
          <div className="w-8 h-8 shrink-0 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold border border-indigo-500/20">
            {(user?.name || 'G').charAt(0)}
          </div>
          {expanded && (
            <div className="flex-1 overflow-hidden text-left">
              <p className="text-sm font-bold text-white truncate">{user?.name || 'Gestor'}</p>
              <p className="text-[11px] text-slate-500 truncate">{user?.role}</p>
            </div>
          )}
          {!expanded && (
            <span className="absolute left-full ml-3 px-2.5 py-1 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xl border border-white/10 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
              {user?.name || 'Conta'} — clique para editar
            </span>
          )}
        </button>

        {expanded && (
          <button
            onClick={() => {
              if (confirm(t('sidebar.logoutConfirm'))) logout()
            }}
            className="group relative shrink-0 p-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
            title={t('sidebar.logout')}
            aria-label={t('sidebar.logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
        {!expanded && (
          <button
            onClick={() => {
              if (confirm(t('sidebar.logoutConfirm'))) logout()
            }}
            className="absolute right-1 bottom-1 p-1 rounded bg-slate-900/80 text-rose-400 hover:bg-rose-500/20"
            title={t('sidebar.logout')}
            aria-label={t('sidebar.logout')}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <UserProfileModal open={showProfileModal} onClose={() => setShowProfileModal(false)} />
    </aside>
  )
}
