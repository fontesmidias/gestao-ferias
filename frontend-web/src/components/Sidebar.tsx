'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CheckSquare, Users, Settings, BrainCircuit, LogOut, PanelLeftOpen, PanelLeftClose, Building2 } from 'lucide-react'
import { useAuth } from '@/components/AuthContext'

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout, loading } = useAuth()
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  // Se estiver na PWA ou não estiver logado (e já carregou), não mostra sidebar
  if (pathname.startsWith('/employee') || pathname.startsWith('/auth')) {
    return null
  }
  if (!loading && !user) {
    return null
  }

  const expanded = pinned || hovered

  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/predict', label: 'Oráculo AI', icon: BrainCircuit },
    { href: '/approvals', label: 'Aprovações', icon: CheckSquare },
    { href: '/employees', label: 'Colaboradores', icon: Users },
    { href: '/workplaces', label: 'Postos', icon: Building2 }
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
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-hidden">
        {links.map((link) => {
          const isActive = pathname.startsWith(link.href)
          const Icon = link.icon

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`group relative flex items-center gap-3 py-2.5 rounded-xl transition-all ${expanded ? 'px-3' : 'px-0 justify-center'} ${
                isActive
                  ? 'bg-primary/10 text-primary font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title={!expanded ? link.label : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {expanded && <span className="whitespace-nowrap text-sm">{link.label}</span>}
              {/* Tooltip quando retraído */}
              {!expanded && (
                <span className="absolute left-full ml-3 px-2.5 py-1 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xl border border-white/10 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                  {link.label}
                </span>
              )}
            </Link>
          )
        })}
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
              <p className="text-[11px] text-slate-500 truncate">{user.role}</p>
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
            <Link
              href="/settings"
              onClick={() => setIsUserMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-bold">Configurações</span>
            </Link>
            <div className="h-px bg-slate-700/50 w-full" />
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
