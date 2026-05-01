'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Calendar, AlertCircle, Plane, CheckCircle2, Navigation, LogOut, Clock, Building2, Loader2, CalendarDays, Info } from 'lucide-react'
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

interface FractioningInfo {
  period: { startDate: string; endDate: string; concessiveEndDate: string; daysOfRight: number; status: string } | null
  analysis: {
    fractionsUsed: number
    daysUsed: number
    daysRemaining: number
    hasFractionWith14Plus: boolean
    maxFractionsAllowed: number
    nextRequestMinDays: number
  } | null
  existingFractions: { startDate: string; endDate: string; days: number; status: string }[]
  holidaysAhead: { date: string; name: string; source: string }[]
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
  const [fractioning, setFractioning] = useState<FractioningInfo | null>(null)
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

      // Fetch tudo em paralelo (incluindo análise de fracionamento + feriados)
      const [employees, balanceData, vacationsData, fractioningData] = await Promise.all([
        HttpClient.get('/employees'),
        HttpClient.get(`/employees/${employeeId}/balance`),
        HttpClient.get('/vacations'),
        HttpClient.get(`/vacations/fractioning/${employeeId}`).catch(() => null),
      ])

      const matched = (employees as Employee[]).find(e => e.id === employeeId)
      if (matched) setEmployee(matched)

      setBalance(balanceData)
      setFractioning(fractioningData as FractioningInfo)

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

  // Validação client-side: domingo + feriado + véspera (espelha o backend)
  const validateStartDateClient = (dateStr: string): { ok: boolean; reason?: string } => {
    if (!dateStr) return { ok: false }
    const d = new Date(dateStr + 'T00:00:00')
    if (d.getDay() === 0) return { ok: false, reason: 'Início em domingo não é permitido (CLT Art. 134 §3º).' }
    if (fractioning?.holidaysAhead) {
      const todayIso = dateStr
      const eveDate = new Date(d); eveDate.setDate(eveDate.getDate() + 1)
      const eveIso = eveDate.toISOString().slice(0, 10)
      const hit = fractioning.holidaysAhead.find(h => h.date === todayIso)
      if (hit) return { ok: false, reason: `Início em feriado "${hit.name}" não é permitido (CLT Art. 134 §3º).` }
      const eveHit = fractioning.holidaysAhead.find(h => h.date === eveIso)
      if (eveHit) return { ok: false, reason: `Início em véspera de feriado "${eveHit.name}" não é permitido (CLT Art. 134 §3º).` }
    }
    return { ok: true }
  }

  const minDaysForThisFraction = fractioning?.analysis?.nextRequestMinDays ?? 14

  const handleSubmit = async () => {
    if (!employee || !startDate || !balance) return

    if (selectedDays > balance.availableBalance) {
      toast.error(`Saldo insuficiente. Você tem ${balance.availableBalance} dias disponíveis.`)
      return
    }

    // Validação CLT — fracionamento: 1ª fração ≥14, demais ≥5 (Lei 13.467/2017)
    if (fractioning?.analysis && selectedDays < minDaysForThisFraction) {
      const reason = fractioning.analysis.hasFractionWith14Plus
        ? `Demais frações têm mínimo de 5 dias corridos (você selecionou ${selectedDays}).`
        : `Sua primeira fração de férias deve ter no mínimo 14 dias corridos (você selecionou ${selectedDays}).`
      toast.error(reason)
      return
    }

    // Validação CLT Art. 134 §3º — domingo, feriado, véspera
    const startCheck = validateStartDateClient(startDate)
    if (!startCheck.ok) {
      toast.error(startCheck.reason || 'Data de início inválida.')
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

      toast.success('Solicitação enviada com sucesso! O RH será notificado.')
      setRequestMode(false)
      setStartDate('')
      setSelectedDays(15)

      // Refresh data
      await fetchData()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar solicitação. Tente novamente.')
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
            <p className="text-sm font-bold text-white leading-tight">Olá, {user.name.split(' ')[0]}!</p>
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
              <h2 className="text-xl font-bold mb-4 px-2">Seu Saldo de Férias <InfoTooltip text="Resumo do seu saldo atual de férias, calculado automaticamente com base na CLT e sua data de admissão." /></h2>

              {/* Workplace Badge */}
              {employee?.workplace && (
                <div className="flex items-center gap-2 bg-slate-900/60 border border-white/5 rounded-xl px-4 py-2 mb-4 mx-2">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs text-slate-400">Posto de Serviço:</span>
                  <span className="text-xs font-bold text-white">{employee.workplace}</span>
                  <InfoTooltip text="Local onde você está alocado atualmente. Informado pelo RH." />
                </div>
              )}

              {/* Balance Hero Card */}
              <div className="glass-card rounded-[2rem] p-8 mb-8 bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/20 relative overflow-hidden shadow-2xl shadow-indigo-900/20">
                <div className="absolute -top-12 -right-12 w-40 h-40 bg-indigo-500/20 blur-3xl rounded-full"></div>
                <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-purple-500/20 blur-3xl rounded-full"></div>

                <div className="flex flex-col items-center justify-center relative z-10">
                  <span className="text-sm font-medium text-indigo-300 tracking-wider uppercase mb-2">Dias Disponíveis <InfoTooltip text="Total de dias de férias que você tem direito e ainda não utilizou. Calculado com base na sua data de admissão conforme a CLT." /></span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400">
                      {balance.availableBalance}
                    </span>
                    <span className="text-xl font-bold text-slate-500">dias</span>
                  </div>
                  <div className="flex gap-6 mt-4 text-xs text-slate-500">
                    <span>Direito: <strong className="text-slate-300">{balance.totalDaysOfRight}d</strong> <InfoTooltip text="Total de dias de férias adquiridos desde sua admissão." /></span>
                    <span>Usados: <strong className="text-slate-300">{balance.totalDaysUsed}d</strong> <InfoTooltip text="Total de dias já gozados ou aprovados em períodos anteriores." /></span>
                  </div>
                </div>

                {nextExpiration && (
                  <div className="mt-8 flex items-center justify-between bg-slate-950/50 rounded-2xl p-4 border border-white/5 relative z-10">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-rose-400" />
                      <div className="text-left">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Vence em <InfoTooltip text="Data limite para usufruir das férias. Após esta data, a empresa pode ser multada e você perde o período concessivo." /></p>
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
                    Solicitar Férias Agora <InfoTooltip text="Abre o formulário para solicitar suas férias. A solicitação será enviada ao RH para aprovação." />
                  </button>
                </div>
              ) : (
                <div className="bg-slate-900 rounded-[2rem] p-6 border border-white/5 shadow-2xl animate-in slide-in-from-bottom-8 fade-in duration-300">
                  {/* Card de fracionamento (CLT Art. 134 §1º — Lei 13.467/2017) */}
                  {fractioning?.analysis && (
                    <div className="mb-5 bg-slate-950/60 border border-indigo-500/20 rounded-xl p-4 text-left">
                      <div className="flex items-center gap-2 mb-2">
                        <Info className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">Fracionamento (CLT)</span>
                      </div>
                      <p className="text-sm text-slate-300">
                        Você já fez <strong className="text-white">{fractioning.analysis.fractionsUsed}</strong> de até <strong className="text-white">{fractioning.analysis.maxFractionsAllowed}</strong> frações
                        {' '}usando <strong className="text-white">{fractioning.analysis.daysUsed}</strong> dias.
                        {' '}Restam <strong className="text-emerald-400">{fractioning.analysis.daysRemaining}</strong> dias neste aquisitivo.
                      </p>
                      <p className="text-xs text-amber-300 mt-2">
                        {fractioning.analysis.hasFractionWith14Plus
                          ? 'Próxima fração: mínimo 5 dias.'
                          : 'Próxima fração: mínimo 14 dias (regra da 1ª fração).'}
                      </p>
                    </div>
                  )}

                  <h3 className="font-bold text-lg mb-4 text-white">Quantos dias deseja tirar? <InfoTooltip text={`Lei 13.467/2017: pode dividir em até 3 frações. A primeira deve ter ≥14 dias; as demais ≥5 dias. Mínimo agora: ${minDaysForThisFraction} dias.`} /></h3>

                  <div className="flex bg-slate-950 p-2 rounded-xl mb-6 gap-1">
                     {(() => {
                       const remaining = fractioning?.analysis?.daysRemaining ?? balance.availableBalance
                       const min = minDaysForThisFraction
                       const options = Array.from(new Set([min, 14, 20, remaining]))
                         .filter(d => d >= min && d <= remaining)
                         .sort((a, b) => a - b)
                       return options.map(d => (
                         <button
                          key={d}
                          onClick={() => setSelectedDays(d)}
                          className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${selectedDays === d ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400'}`}
                         >
                           {d}
                         </button>
                       ))
                     })()}
                  </div>

                  <div className="space-y-4 mb-6 text-left">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-4 mb-2 block">Data de Início <InfoTooltip text="Primeiro dia das suas férias. Não pode iniciar em domingo, feriado nacional/estadual ou véspera de feriado (CLT Art. 134 §3º)." /></label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                      />
                      {startDate && (() => {
                        const check = validateStartDateClient(startDate)
                        if (check.ok) return null
                        return (
                          <div className="mt-2 flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2 text-xs text-rose-300">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>{check.reason}</span>
                          </div>
                        )
                      })()}
                    </div>
                    {startDate && validateStartDateClient(startDate).ok && (
                      <div className="bg-slate-950/50 rounded-xl p-3 border border-white/5">
                        <p className="text-xs text-slate-500">Período calculado:</p>
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

                  {/* Próximos feriados (referência) */}
                  {fractioning?.holidaysAhead && fractioning.holidaysAhead.length > 0 && (
                    <details className="mb-6 text-left">
                      <summary className="text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 flex items-center gap-2">
                        <CalendarDays className="w-3.5 h-3.5" />
                        Próximos feriados ({fractioning.holidaysAhead.slice(0, 8).length})
                      </summary>
                      <ul className="mt-2 space-y-1 text-xs text-slate-400">
                        {fractioning.holidaysAhead.slice(0, 8).map(h => (
                          <li key={h.date} className="flex justify-between bg-slate-950/40 rounded px-2 py-1">
                            <span className="font-mono">{new Date(h.date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                            <span>{h.name}</span>
                            <span className={`text-[10px] px-1.5 rounded ${h.source === 'NATIONAL' ? 'bg-blue-500/20 text-blue-300' : h.source === 'STATE' ? 'bg-purple-500/20 text-purple-300' : 'bg-amber-500/20 text-amber-300'}`}>
                              {h.source === 'NATIONAL' ? 'NAC' : h.source === 'STATE' ? 'EST' : 'MAN'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

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
                      {submitting ? 'Enviando...' : 'Enviar RH'} <InfoTooltip text="Envia a solicitação para o RH avaliar. Você será notificado quando houver uma decisão." />
                    </button>
                  </div>
                </div>
              )}

              {/* Vacation History */}
              {vacations.length > 0 && (
                <div className="mt-10">
                  <h3 className="text-lg font-bold mb-4 px-2">Histórico de Solicitações <InfoTooltip text="Todas as suas solicitações de férias, com status atualizado em tempo real." /></h3>
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
          <span className="text-[10px] font-bold">Início</span>
        </button>
        <button className="flex flex-col items-center p-2 text-slate-500">
          <Calendar className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold">Calendário</span>
        </button>
        <button className="flex flex-col items-center p-2 text-slate-500">
          <AlertCircle className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-bold">Avisos</span>
        </button>
      </div>

    </div>
  )
}
