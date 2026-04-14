'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Calendar, AlertCircle, Plane, CheckCircle2, Navigation, LogOut, Clock, Building2, Loader2 } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { InfoTooltip } from '@/components/InfoTooltip'
import { useAuth } from '@/components/AuthContext'
import { HttpClient } from '@/lib/api-client'
import { toast } from 'sonner'

interface Employee {
  id: string
  name: string
  cpf: string
  position?: string
  workplace?: string
  hireDate: string
  status: string
}

interface BalanceData {
  employeeId: string
  employeeName: string
  hireDate: string
  totalDaysOfRight: number
  totalDaysUsed: number
  availableBalance: number
  periods: Array<{
    startDate: string
    endDate: string
    daysOfRight: number
    limitDate: string
  }>
}

interface VacationRequest {
  id: string
  employeeId: string
  startDate: string
  endDate: string
  days: number
  status: string
  createdAt: string
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendente', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  APPROVED: { label: 'Aprovado', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  REJECTED: { label: 'Rejeitado', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  RETURNED: { label: 'Devolvido', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  SIGNED: { label: 'Assinado', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  COMPLETED: { label: 'Concluído', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
}

export default function EmployeeDashboard() {
  const [requestMode, setRequestMode] = useState(false)
  const [selectedDays, setSelectedDays] = useState(15)
  const [startDate, setStartDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { user, logout, loading: authLoading } = useAuth()

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [balance, setBalance] = useState<BalanceData | null>(null)
  const [vacations, setVacations] = useState<VacationRequest[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!user) return
    setLoadingData(true)
    setError(null)

    try {
      // Usar employeeId do JWT (vem do AuthContext)
      const employeeId = (user as any).employeeId
      if (!employeeId) {
        setError('Seu usuário não está vinculado a um colaborador. Solicite ao RH a vinculação.')
        setLoadingData(false)
        return
      }

      // Fetch employee, balance and vacations in parallel
      const [employees, balanceData, vacationsData] = await Promise.all([
        HttpClient.get('/employees'),
        HttpClient.get(`/employees/${employeeId}/balance`),
        HttpClient.get('/vacations'),
      ])

      const matched = (employees as Employee[]).find(e => e.id === employeeId)
      if (matched) setEmployee(matched)

      setBalance(balanceData)

      const myVacations = (vacationsData as VacationRequest[]).filter(
        (v) => v.employeeId === employeeId
      )
      setVacations(myVacations)
    } catch (err: any) {
      console.error('Failed to fetch employee data:', err)
      setError(err.message || 'Erro ao carregar dados. Tente novamente.')
    } finally {
      setLoadingData(false)
    }
  }, [user])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSubmit = async () => {
    if (!employee || !startDate || !balance) return

    if (selectedDays > balance.availableBalance) {
      toast.error(`Saldo insuficiente. Voc\ê tem ${balance.availableBalance} dias dispon\íveis.`)
      return
    }

    setSubmitting(true)
    try {
      // Calculate endDate: startDate + selectedDays - 1
      const start = new Date(startDate + 'T00:00:00')
      const end = new Date(start)
      end.setDate(end.getDate() + selectedDays - 1)

      const endDateStr = end.toISOString().split('T')[0]

      await HttpClient.post('/vacations', {
        employeeId: employee.id,
        startDate,
        endDate: endDateStr,
      })

      toast.success('Solicita\ç\ão enviada com sucesso! O RH ser\á notificado.')
      setRequestMode(false)
      setStartDate('')
      setSelectedDays(15)

      // Refresh data
      await fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar solicita\ç\ão. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  // Find the nearest expiration date from periods
  const nextExpiration = balance?.periods?.length
    ? balance.periods
        .map((p) => p.limitDate)
        .filter(Boolean)
        .sort()[0]
    : null

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  const roleLabel = user.role === 'ADMIN' ? 'Gestor de RH' : 'Colaborador'

  return (
    <div className="bg-slate-950 text-slate-200 min-h-screen pb-24 md:pb-12 text-center md:text-left select-none">

      {/* Mobile Top App Bar */}
      <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold shadow-lg shadow-indigo-500/20">
            {user.name.charAt(0)}
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-white leading-tight">Ol\á, {user.name.split(' ')[0]}!</p>
            <p className="text-xs text-slate-400">{roleLabel}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-10 h-10 flex items-center justify-center bg-slate-800 text-rose-400 rounded-full hover:bg-rose-500/10 transition"
          title="Sair"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      <main className="max-w-md mx-auto px-4 pt-8 pb-12">
        <ErrorBoundary>

          {/* Loading State */}
          {loadingData && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
              <p className="text-slate-400 text-sm">Carregando seus dados...</p>
            </div>
          )}

          {/* Error State */}
          {error && !loadingData && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-center">
              <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
              <p className="text-rose-300 font-bold mb-2">Ops!</p>
              <p className="text-sm text-slate-400">{error}</p>
              <button
                onClick={fetchData}
                className="mt-4 bg-slate-800 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-slate-700 transition"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {/* Main Content */}
          {!loadingData && !error && balance && (
            <>
              <h2 className="text-xl font-bold mb-4 px-2">Seu Saldo de F\érias <InfoTooltip text="Resumo do seu saldo atual de f\érias, calculado automaticamente com base na CLT e sua data de admiss\ão." /></h2>

              {/* Workplace Badge */}
              {employee?.workplace && (
                <div className="flex items-center gap-2 bg-slate-900/60 border border-white/5 rounded-xl px-4 py-2 mb-4 mx-2">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs text-slate-400">Posto de Servi\ço:</span>
                  <span className="text-xs font-bold text-white">{employee.workplace}</span>
                  <InfoTooltip text="Local onde voc\ê est\á alocado atualmente. Informado pelo RH." />
                </div>
              )}

              {/* Balance Hero Card */}
              <div className="glass-card rounded-[2rem] p-8 mb-8 bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/20 relative overflow-hidden shadow-2xl shadow-indigo-900/20">
                <div className="absolute -top-12 -right-12 w-40 h-40 bg-indigo-500/20 blur-3xl rounded-full"></div>
                <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-purple-500/20 blur-3xl rounded-full"></div>

                <div className="flex flex-col items-center justify-center relative z-10">
                  <span className="text-sm font-medium text-indigo-300 tracking-wider uppercase mb-2">Dias Dispon\íveis <InfoTooltip text="Total de dias de f\érias que voc\ê tem direito e ainda n\ão utilizou. Calculado com base na sua data de admiss\ão conforme a CLT." /></span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400">
                      {balance.availableBalance}
                    </span>
                    <span className="text-xl font-bold text-slate-500">dias</span>
                  </div>
                  <div className="flex gap-6 mt-4 text-xs text-slate-500">
                    <span>Direito: <strong className="text-slate-300">{balance.totalDaysOfRight}d</strong> <InfoTooltip text="Total de dias de f\érias adquiridos desde sua admiss\ão." /></span>
                    <span>Usados: <strong className="text-slate-300">{balance.totalDaysUsed}d</strong> <InfoTooltip text="Total de dias j\á gozados ou aprovados em per\íodos anteriores." /></span>
                  </div>
                </div>

                {nextExpiration && (
                  <div className="mt-8 flex items-center justify-between bg-slate-950/50 rounded-2xl p-4 border border-white/5 relative z-10">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-rose-400" />
                      <div className="text-left">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Vence em <InfoTooltip text="Data limite para usufruir das f\érias. Ap\ós esta data, a empresa pode ser multada e voc\ê perde o per\íodo concessivo." /></p>
                        <p className="text-sm font-bold text-rose-300">{new Date(nextExpiration).toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Area */}
              {!requestMode ? (
                <div className="space-y-4">
                  <button
                    onClick={() => setRequestMode(true)}
                    className="w-full bg-white text-slate-950 font-black py-4 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-transform shadow-xl shadow-white/10"
                  >
                    <Plane className="w-6 h-6" />
                    Solicitar F\érias Agora <InfoTooltip text="Abre o formul\ário para solicitar suas f\érias. A solicita\ç\ão ser\á enviada ao RH para aprova\ç\ão." />
                  </button>
                </div>
              ) : (
                <div className="bg-slate-900 rounded-[2rem] p-6 border border-white/5 shadow-2xl animate-in slide-in-from-bottom-8 fade-in duration-300">
                  <h3 className="font-bold text-lg mb-4 text-white">Quantos dias deseja tirar? <InfoTooltip text="Escolha a dura\ç\ão das f\érias. Pela CLT, o m\ínimo \é 10 dias corridos. Pode dividir em at\é 3 per\íodos." /></h3>

                  <div className="flex bg-slate-950 p-2 rounded-xl mb-6">
                     {[10, 15, 20, 30].map(d => (
                       <button
                        key={d}
                        onClick={() => setSelectedDays(d)}
                        className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${selectedDays === d ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400'}`}
                       >
                         {d}
                       </button>
                     ))}
                  </div>

                  <div className="space-y-4 mb-8 text-left">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-4 mb-2 block">Data de In\ício (A partir de) <InfoTooltip text="Primeiro dia das suas f\érias. N\ão pode iniciar em sexta-feira, s\ábado, domingo ou v\éspera de feriado (CLT Art. 134 \§3)." /></label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                      />
                    </div>
                    {startDate && (
                      <div className="bg-slate-950/50 rounded-xl p-3 border border-white/5">
                        <p className="text-xs text-slate-500">Per\íodo calculado:</p>
                        <p className="text-sm font-bold text-white">
                          {new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')} a{' '}
                          {(() => {
                            const end = new Date(startDate + 'T00:00:00')
                            end.setDate(end.getDate() + selectedDays - 1)
                            return end.toLocaleDateString('pt-BR')
                          })()}
                          {' '}({selectedDays} dias)
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => { setRequestMode(false); setStartDate('') }}
                      className="flex-1 bg-slate-800 text-white font-bold py-4 rounded-xl"
                      disabled={submitting}
                    >Cancelar</button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || !startDate}
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5" />
                      )}
                      {submitting ? 'Enviando...' : 'Enviar RH'} <InfoTooltip text="Envia a solicita\ç\ão para o RH avaliar. Voc\ê ser\á notificado quando houver uma decis\ão." />
                    </button>
                  </div>
                </div>
              )}

              {/* Vacation History */}
              {vacations.length > 0 && (
                <div className="mt-10">
                  <h3 className="text-lg font-bold mb-4 px-2">Hist\órico de Solicita\ç\ões <InfoTooltip text="Todas as suas solicita\ç\ões de f\érias, com status atualizado em tempo real." /></h3>
                  <div className="space-y-3">
                    {vacations.map((v) => {
                      const statusInfo = STATUS_MAP[v.status] || { label: v.status, color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' }
                      return (
                        <div key={v.id} className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                          <div className="text-left">
                            <div className="flex items-center gap-2 mb-1">
                              <Clock className="w-4 h-4 text-slate-500" />
                              <span className="text-sm font-bold text-white">{v.days} dias</span>
                            </div>
                            <p className="text-xs text-slate-500">
                              {new Date(v.startDate).toLocaleDateString('pt-BR')} a {new Date(v.endDate).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <span className={`text-xs font-bold px-3 py-1 rounded-full border ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

        </ErrorBoundary>
      </main>

      {/* Mobile Bottom Navigation (PWA feel) */}
      <div className="md:hidden fixed bottom-0 left-0 w-full glass border-t border-white/5 pb-safe pt-2 px-6 flex justify-between items-center z-50">
        <button className="flex flex-col items-center p-2 text-indigo-400">
          <Navigation className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold">In\ício</span>
        </button>
        <button className="flex flex-col items-center p-2 text-slate-500">
          <Calendar className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold">Calend\ário</span>
        </button>
        <button className="flex flex-col items-center p-2 text-slate-500">
          <AlertCircle className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold">Avisos</span>
        </button>
      </div>

    </div>
  )
}
