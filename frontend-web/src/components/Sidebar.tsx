'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CheckSquare, Users, Settings, BrainCircuit, LogOut, PanelLeftOpen, PanelLeftClose, Building2, Shield, Crown } from 'lucide-react'
import { useAuth } from '@/components/AuthContext'
import { HttpClient } from '@/lib/api-client'

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout, loading, isImpersonating } = useAuth()
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [badges, setBadges] = useState<Record<string, number>>({})

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
      label: 'Operacional',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/employees', label: 'Colaboradores', icon: Users },
        { href: '/approvals', label: 'Aprovações', icon: CheckSquare, matchPath: '/approvals' },
        { href: '/workplaces', label: 'Postos', icon: Building2 },
        { href: '/coverage', label: 'Cobertura', icon: Shield },
      ],
    },
    {
      label: 'Inteligência',
      items: [
        { href: '/predict', label: 'AI Oráculo', icon: BrainCircuit },
      ],
    },
    {
      label: 'Sistema',
      items: [
        { href: '/settings', label: 'Configurações', icon: Settings, matchPath: '/settings' },
      ],
    },
  ]

  const isSuperAdminView = isSuperAdmin && !isImpersonating
  const superAdminLinks = [
    { href: '/admin', label: 'Painel Admin', icon: Crown },
    { href: '/dashboard', label: 'Dashboard Global', icon: LayoutDashboard },
  ]

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (!pinned) setIsUserMenuOpen(false) }}
      className={`border-r border-white/5 bg-slate-900/50 backdrop-blur-xl flex flex-col shrink-0 transition-all duration-300 z-40 ${expanded ? 'w-64' : 'w-16'}`}
    >
      {/* Header: Logo + Pin toggle */}
      <div className={`h-14 flex items-center border-b border-white/5 ${expanded ? 'px-4 justify-between' : 'justify-center'}`}>
        {expanded ? (
          <>
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 shrink-0 bg-gradient-to-tr from-primary to-secondary rounded-lg" />
              <h1 className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
                Gestão<span className="text-gradient">Férias</span>
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
          <div className="w-7 h-7 shrink-0 bg-gradient-to-tr from-primary to-secondary rounded-lg" />
        )}
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
                  const isActive = pathname.startsWith(link.href)
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

      {/* User Section */}
      <div className="px-2 py-3 border-t border-white/5 relative">
        <button
          onClick={() => expanded && setIsUserMenuOpen(!isUserMenuOpen)}
          className={`group relative w-full flex items-center gap-3 p-2 bg-slate-800/50 rounded-xl overflow-hidden hover:bg-slate-700/50 transition-colors ${!expanded ? 'justify-center' : ''}`}
          title={!expanded ? user?.name || 'Conta' : 'Opções da Conta'}
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
          {/* Tooltip quando retraído */}
          {!expanded && (
            <span className="absolute left-full ml-3 px-2.5 py-1 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xl border border-white/10 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
              {user?.name || 'Conta'}
            </span>
          )}
        </button>

        {/* User Popover Menu */}
        {expanded && isUserMenuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
            <button
              onClick={() => { setIsUserMenuOpen(false); logout(); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-rose-400 hover:bg-rose-400/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-bold">Encerrar Sessão</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
