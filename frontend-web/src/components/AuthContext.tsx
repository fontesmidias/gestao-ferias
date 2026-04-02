'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { HttpClient } from '@/lib/api-client'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'

interface User {
  id: string
  email: string
  name: string
  role: string
  tenantId: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string) => Promise<void>
  verifyToken: (token: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  const checkUser = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }

    try {
      const userData = await HttpClient.get('/auth/me')
      setUser(userData)
    } catch (err) {
      console.error('Failed to fetch user:', err)
      localStorage.removeItem('token')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkUser()
  }, [])

  const login = async (email: string) => {
    try {
      await HttpClient.post('/auth/magic-link', { email })
      toast.success('Link de acesso enviado para seu e-mail!')
    } catch (err) {
      toast.error('Erro ao solicitar acesso. Verifique o e-mail ou tente novamente.')
      throw err
    }
  }

  const verifyToken = async (token: string) => {
    try {
      const data = await HttpClient.request(`/auth/verify?token=${token}`, { method: 'GET' })
      localStorage.setItem('token', data.token)
      setUser(data.user)
      toast.success('Login realizado com sucesso!')
      
      // Se for colaborador (role USER), manda pra PWA, se for ADMIN, manda pro Dashboard
      if (data.user.role === 'ADMIN') {
        router.push('/dashboard')
      } else {
        router.push('/employee/dashboard')
      }
    } catch (err) {
      toast.error('O link de acesso expirou ou é inválido.')
      router.push('/auth/login')
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
    toast.message('Você saiu da plataforma.')
    router.push('/auth/login')
  }

  // Redirecionamento automático se não estiver logado (exceto em rotas /auth)
  useEffect(() => {
    if (!loading && !user && !pathname.includes('/auth')) {
      router.push('/auth/login')
    }
  }, [user, loading, pathname, router])

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyToken, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
