'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CheckSquare, Users, Settings, BrainCircuit, LogOut } from 'lucide-react'
import { useAuth } from '@/components/AuthContext'

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout, loading } = useAuth()

  // Se estiver na PWA ou não estiver logado, não mostra sidebar
  if (pathname.startsWith('/employee') || pathname.startsWith('/auth') || !user) {
    return null
  }

  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/predict', label: 'Oráculo AI', icon: BrainCircuit },
    { href: '/approvals', label: 'Aprovações', icon: CheckSquare },
    { href: '/employees', label: 'Colaboradores', icon: Users },
    { href: '/settings', label: 'Configurações', icon: Settings },
  ]

  return (
    <aside className="w-64 border-r border-white/5 bg-slate-900/50 backdrop-blur-xl flex flex-col hidden md:flex shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-primary to-secondary rounded-lg" />
          <h1 className="text-xl font-bold tracking-tight text-white">
            Gestão<span className="text-gradient">Férias</span>
          </h1>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {links.map((link) => {
          const isActive = pathname.startsWith(link.href)
          const Icon = link.icon
          
          return (
            <Link 
              key={link.href} 
              href={link.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive 
                  ? 'bg-primary/10 text-primary font-bold' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-5 h-5" />
              {link.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-white/5 space-y-2">
        <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-sm font-bold border border-indigo-500/20">
            {(user?.name || 'G').charAt(0)}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-bold text-white truncate">{user?.name || 'Gestor'}</p>
            <p className="text-xs text-slate-500 truncate">{user.role}</p>
          </div>
        </div>
        
        <button 
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-bold">Encerrar Sessão</span>
        </button>
      </div>
    </aside>
  )
}
