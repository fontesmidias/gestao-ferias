'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CheckSquare, Users, Settings, BrainCircuit, LogOut, Menu, UserCircle } from 'lucide-react'
import { useAuth } from '@/components/AuthContext'

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout, loading } = useAuth()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  // Load state from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('gestao_sidebar_collapsed')
    if (saved === 'true') setIsCollapsed(true)
  }, [])

  const toggleCollapse = () => {
    const newVal = !isCollapsed
    setIsCollapsed(newVal)
    localStorage.setItem('gestao_sidebar_collapsed', String(newVal))
    if (newVal) setIsUserMenuOpen(false) // Close menu if collapsing sidebar
  }

  // Se estiver na PWA ou não estiver logado, não mostra sidebar
  if (pathname.startsWith('/employee') || pathname.startsWith('/auth') || !user) {
    return null
  }

  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/predict', label: 'Oráculo AI', icon: BrainCircuit },
    { href: '/approvals', label: 'Aprovações', icon: CheckSquare },
    { href: '/employees', label: 'Colaboradores', icon: Users }
  ]

  return (
    <aside className={`border-r border-white/5 bg-slate-900/50 backdrop-blur-xl flex flex-col hidden md:flex shrink-0 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
      <div className={`h-16 flex items-center px-6 border-b border-white/5 ${isCollapsed ? 'justify-center px-0' : 'justify-between'}`}>
        {!isCollapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 shrink-0 bg-gradient-to-tr from-primary to-secondary rounded-lg" />
            <h1 className="text-xl font-bold tracking-tight text-white whitespace-nowrap">
              Gestão<span className="text-gradient">Férias</span>
            </h1>
          </div>
        )}
        {isCollapsed && (
          <div className="w-8 h-8 shrink-0 bg-gradient-to-tr from-primary to-secondary rounded-lg" />
        )}
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-hidden">
        {links.map((link) => {
          const isActive = pathname.startsWith(link.href)
          const Icon = link.icon
          
          return (
            <Link 
              key={link.href} 
              href={link.href}
              className={`flex items-center gap-3 py-3 rounded-xl transition-all ${isCollapsed ? 'px-0 justify-center' : 'px-4'} ${
                isActive 
                  ? 'bg-primary/10 text-primary font-bold' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title={isCollapsed ? link.label : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span className="whitespace-nowrap">{link.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="px-4 py-2 border-t border-white/5 flex justify-end">
        <button 
          onClick={toggleCollapse}
          className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors w-full flex justify-center"
          title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 border-t border-white/5 relative">
        {/* User Card as a Button */}
        <button 
          onClick={() => !isCollapsed && setIsUserMenuOpen(!isUserMenuOpen)}
          className={`w-full flex items-center gap-3 p-3 bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition-colors ${isCollapsed ? 'justify-center p-2' : ''}`}
          title={isCollapsed ? user?.name || 'Gestão' : "Opções da Conta"}
        >
          <div className={`${isCollapsed ? 'w-8 h-8' : 'w-10 h-10'} shrink-0 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-sm font-bold border border-indigo-500/20`}>
            {(user?.name || 'G').charAt(0)}
          </div>
          {!isCollapsed && (
            <div className="flex-1 overflow-hidden text-left">
              <p className="text-sm font-bold text-white truncate">{user?.name || 'Gestor'}</p>
              <p className="text-xs text-slate-400 truncate">{user.role}</p>
            </div>
          )}
        </button>

        {/* User Popover Menu */}
        {!isCollapsed && isUserMenuOpen && (
          <div className="absolute bottom-full left-4 right-4 mb-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2">
            <Link 
              href="/settings"
              onClick={() => setIsUserMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-bold">Configurações</span>
            </Link>
            {/* Could add Profile Edit here later */}
            {/* <Link href="/profile" className="..."> <UserCircle.../> Meu Perfil </Link> */}
            
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
