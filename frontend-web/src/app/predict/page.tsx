'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  BrainCircuit,
  TrendingDown,
  Users,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  Send,
  Loader2,
  MessageSquare,
  BarChart3,
  AlertCircle,
} from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { InfoTooltip } from '@/components/InfoTooltip'
import { HttpClient } from '@/lib/api-client'
import { toast } from 'sonner'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────────
interface RiskSummary {
  totalRisks: number
  highRisks: number
  totalMultaEstimada: number
  totalSavingsEstimado: number
}

interface Risk {
  employeeId: string
  name: string
  position: string
  risk: 'HIGH' | 'MEDIUM' | 'LOW'
  multaEstimada: number
  savingsEstimado: number
  deadline: string
  action: string
  vencidoCount: number
  concessivoCount: number
}

interface ForecastMonth {
  month: string
  totalVacations: number
  uncoveredVacations: number
  affectedWorkplaces: number
  intermitentesNeeded: number
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  provider?: string
}

// ── Constants ───────────────────────────────────────────────────────
const SUGGESTION_CHIPS = [
  'Quantos intermitentes preciso no próximo trimestre?',
  'Qual posto fica descoberto semana que vem?',
  'Quanto vai custar a cobertura do próximo mês?',
  'Quais colaboradores têm férias vencendo?',
]

// ── Helpers ──────────────────────────────────────────────────────────
const RISK_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatCompact(value: number): string {
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(1)}k`
  }
  return formatBRL(value)
}

function riskColor(risk: string) {
  if (risk === 'HIGH') return 'bg-rose-500'
  if (risk === 'MEDIUM') return 'bg-amber-500'
  return 'bg-emerald-500'
}

// ── Component ────────────────────────────────────────────────────────
export default function AIPredictDashboard() {
  const [summary, setSummary] = useState<RiskSummary | null>(null)
  const [risks, setRisks] = useState<Risk[]>([])
  const [forecast, setForecast] = useState<ForecastMonth[]>([])
  const [loading, setLoading] = useState(true)

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [llmUnavailable, setLlmUnavailable] = useState(false)

  // ── Data fetching ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [risksData, forecastData] = await Promise.all([
        HttpClient.get('/predict/risks'),
        HttpClient.get('/predict/coverage-forecast'),
      ])

      setSummary(risksData.summary)
      const sorted = [...risksData.risks].sort(
        (a: Risk, b: Risk) => (RISK_ORDER[a.risk] ?? 9) - (RISK_ORDER[b.risk] ?? 9),
      )
      setRisks(sorted)
      setForecast(forecastData.forecast)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar dados do Predict AI')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Chat handler ───────────────────────────────────────────────────
  async function handleAskQuestion() {
    const question = chatInput.trim()
    if (!question || chatLoading) return

    setChatMessages((prev) => [...prev, { role: 'user', content: question }])
    setChatInput('')
    setChatLoading(true)
    setLlmUnavailable(false)

    try {
      const data = await HttpClient.post('/predict/ask', { question })
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer, provider: data.provider },
      ])
    } catch (err: any) {
      const msg = err.message || ''
      if (msg.toLowerCase().includes('llm') || msg.toLowerCase().includes('provider') || msg.toLowerCase().includes('key')) {
        setLlmUnavailable(true)
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              'Nenhum provedor de IA configurado. Acesse as configurações e adicione sua chave de API (OpenAI, Anthropic, etc.) para usar o chat.',
          },
        ])
      } else {
        toast.error(msg || 'Erro ao consultar a IA')
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente.' },
        ])
      }
    } finally {
      setChatLoading(false)
    }
  }

  // ── Skeleton loader ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-dashboard text-slate-200 pb-12 min-h-full">
        <main className="max-w-7xl mx-auto px-4 pt-8">
          <div className="bg-gradient-to-br from-indigo-900/60 to-purple-900/20 border border-indigo-500/30 rounded-3xl p-8 mb-12 animate-pulse">
            <div className="h-10 bg-slate-700/50 rounded w-80 mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-900/50 rounded-2xl p-6 h-32" />
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card rounded-2xl p-6 h-24 animate-pulse" />
            ))}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="bg-dashboard text-slate-200 pb-12 min-h-full">
      <main className="max-w-7xl mx-auto px-4 pt-8">
        {/* ── Header Hero ─────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-indigo-900/60 to-purple-900/20 border border-indigo-500/30 rounded-3xl p-8 mb-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 blur-[100px] rounded-full pointer-events-none" />

          <div className="flex items-center gap-4 mb-6 relative z-10">
            <div className="p-3 bg-indigo-500/20 rounded-xl border border-indigo-500/30 text-indigo-400">
              <BrainCircuit className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-white flex items-center gap-2">
                Oráculo{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                  Predict
                </span>{' '}
                AI
                <Sparkles className="w-5 h-5 text-purple-400" />
              </h2>
              <p className="text-indigo-200/70 mt-1">
                Inteligência Operacional Analisando {summary?.totalRisks ?? '—'} Colaboradores em Risco
              </p>
            </div>
          </div>

          {/* ── KPI Cards ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
            {/* Risco de Passivo */}
            <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl p-6 border border-white/5">
              <div className="flex items-center gap-3 text-rose-400 mb-2">
                <ShieldAlert className="w-5 h-5" />
                <span className="font-bold text-sm tracking-widest uppercase">Risco de Passivo</span>
                <InfoTooltip text="Estimativa de multas pela CLT Art. 137 caso as férias vencidas não sejam concedidas a tempo. Quanto maior, mais urgente." />
              </div>
              <p className="text-4xl font-black text-white">
                {summary ? formatCompact(summary.totalMultaEstimada) : '—'}
              </p>
              <p className="text-xs text-slate-400 mt-2">Multas estimadas CLT Art. 137 se ignorado.</p>
            </div>

            {/* Savings Sugerido */}
            <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl p-6 border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.1)]">
              <div className="flex items-center gap-3 text-emerald-400 mb-2">
                <TrendingDown className="w-5 h-5" />
                <span className="font-bold text-sm tracking-widest uppercase">Savings Sugerido</span>
                <InfoTooltip text="Economia estimada ao seguir as recomendações da IA para agendamento de férias. Evita multas e otimiza cobertura." />
              </div>
              <p className="text-4xl font-black text-emerald-400">
                {summary ? formatCompact(summary.totalSavingsEstimado) : '—'}
              </p>
              <p className="text-xs text-slate-400 mt-2">Seguindo as recomendações imediatas da AI.</p>
            </div>

            {/* Gargalos Críticos */}
            <div className="bg-slate-900/50 backdrop-blur-md rounded-2xl p-6 border border-white/5">
              <div className="flex items-center gap-3 text-sky-400 mb-2">
                <Users className="w-5 h-5" />
                <span className="font-bold text-sm tracking-widest uppercase">Gargalos Críticos</span>
                <InfoTooltip text="Colaboradores com risco alto que precisam de ação imediata. Prioridade máxima para agendamento." />
              </div>
              <p className="text-4xl font-black text-white">
                {summary?.highRisks ?? '—'}{' '}
                <span className="text-lg font-medium text-slate-500">pessoas</span>
              </p>
              <p className="text-xs text-slate-400 mt-2">
                Colaboradores com duplo período concessivo iminente.
              </p>
            </div>
          </div>
        </div>

        {/* ── AI Chat (movido para cima) ─────────────────────────── */}
        <ErrorBoundary>
          <div className="mb-6 flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-purple-400" />
            <h3 className="text-xl font-bold text-white">
              Pergunte ao Oráculo
            </h3>
            <InfoTooltip text="Converse com a IA sobre riscos trabalhistas, cobertura de férias e recomendações estratégicas." />
          </div>

          <div className="glass-card rounded-2xl p-6 border border-white/5 mb-10">
            {chatMessages.length > 0 && (
              <div className="mb-4 max-h-80 overflow-y-auto space-y-3 pr-2">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200 border border-white/5'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{
                          __html: msg.content
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\*(.*?)\*/g, '<em>$1</em>')
                            .replace(/^- /gm, '• ')
                            .replace(/^(\d+)\. /gm, '<strong>$1.</strong> ')
                            .replace(/\n/g, '<br/>')
                        }} />
                      ) : msg.content}
                      {msg.provider && (
                        <span className="inline-block ml-2 mt-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold bg-purple-500/20 text-purple-300 rounded-full">
                          via {msg.provider}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 border border-white/5 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" /> Pensando...
                    </div>
                  </div>
                )}
              </div>
            )}
            {llmUnavailable && (
              <div className="mb-4 flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>Nenhum provedor de IA configurado. Vá em <strong>Configurações</strong> para adicionar sua chave de API.</span>
              </div>
            )}
            {chatMessages.length === 0 && !chatLoading && (
              <div className="mb-4 flex flex-wrap gap-2">
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setChatInput(chip)
                      // Auto-submit after setting input
                      setTimeout(() => {
                        setChatMessages((prev) => [...prev, { role: 'user', content: chip }])
                        setChatLoading(true)
                        setLlmUnavailable(false)
                        HttpClient.post('/predict/ask', { question: chip })
                          .then((data) => {
                            setChatMessages((prev) => [
                              ...prev,
                              { role: 'assistant', content: data.answer, provider: data.provider },
                            ])
                          })
                          .catch((err: any) => {
                            const msg = err.message || ''
                            if (msg.toLowerCase().includes('llm') || msg.toLowerCase().includes('provider') || msg.toLowerCase().includes('key')) {
                              setLlmUnavailable(true)
                              setChatMessages((prev) => [
                                ...prev,
                                { role: 'assistant', content: 'Nenhum provedor de IA configurado. Acesse as configurações e adicione sua chave de API (OpenAI, Anthropic, etc.) para usar o chat.' },
                              ])
                            } else {
                              toast.error(msg || 'Erro ao consultar a IA')
                              setChatMessages((prev) => [
                                ...prev,
                                { role: 'assistant', content: 'Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente.' },
                              ])
                            }
                          })
                          .finally(() => setChatLoading(false))
                        setChatInput('')
                      }, 0)
                    }}
                    className="px-3 py-2 text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-xl hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); handleAskQuestion() }} className="flex items-center gap-3">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ex: Quais colaboradores têm férias vencidas este mês?"
                className="flex-1 bg-slate-900/70 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                disabled={chatLoading} />
              <button type="submit" disabled={chatLoading || !chatInput.trim()}
                className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.96]">
                {chatLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </form>
          </div>
        </ErrorBoundary>

        {/* ── Recommendations List ────────────────────────────────── */}
        <ErrorBoundary>
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-xl font-bold text-white flex items-center gap-3">
              Plano de Ação Estratégico gerado por AI
              <InfoTooltip text="Lista de colaboradores ordenada por risco, com recomendações da IA para evitar multas e otimizar cobertura." />
            </h3>
            <button className="text-sm text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1">
              Exportar Relatório <ArrowRight className="w-4 h-4" />
              <InfoTooltip text="Gera um PDF com toda a análise da IA, recomendações e projeções de risco para apresentar à diretoria." />
            </button>
          </div>

          {risks.length === 0 && !loading && (
            <div className="glass-card rounded-2xl p-8 border border-white/5 text-center text-slate-400">
              Nenhum risco identificado no momento.
            </div>
          )}

          <div className="space-y-4">
            {risks.map((rec) => (
              <div
                key={rec.employeeId}
                className="glass-card rounded-2xl p-6 border border-white/5 hover:border-indigo-500/30 transition-all group flex flex-col md:flex-row items-center justify-between gap-6 cursor-pointer"
              >
                <div className="flex items-center gap-6 w-full md:w-1/3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center font-bold text-lg text-slate-300">
                      {rec.name.charAt(0)}
                    </div>
                    <div
                      className={`absolute -bottom-1 -right-1 w-4 h-4 ${riskColor(rec.risk)} rounded-full border-2 border-slate-900 ${rec.risk === 'HIGH' ? 'animate-pulse' : ''}`}
                    />
                  </div>
                  <div>
                    <p className="font-bold text-white text-lg">{rec.name}</p>
                    <p className="text-sm text-slate-400">{rec.position}</p>
                    <p className="text-sm text-rose-400 font-medium">{rec.deadline}</p>
                  </div>
                </div>

                <div className="w-full md:w-1/3 text-left md:text-center p-4 bg-slate-900/50 rounded-xl border border-white/5">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">
                    Risco Evitado{' '}
                    <InfoTooltip text="Valor da multa que será evitada se esta recomendação for seguida." />
                  </p>
                  <p className="text-2xl font-black text-emerald-400">
                    {formatBRL(rec.savingsEstimado)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Multa: {formatBRL(rec.multaEstimada)}
                  </p>
                </div>

                <div className="w-full md:w-1/3 flex justify-end">
                  <button className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]">
                    {rec.action}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </ErrorBoundary>

        {/* ── Forecast Chart ──────────────────────────────────────── */}
        <ErrorBoundary>
          <div className="mt-12 mb-6 flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <h3 className="text-xl font-bold text-white">
              Previsão de Cobertura por Mês
            </h3>
            <InfoTooltip text="Projeção da demanda de cobertura para os próximos meses, incluindo férias não cobertas e necessidade de intermitentes." />
          </div>

          {forecast.length > 0 ? (
            <div className="glass-card rounded-2xl p-6 border border-white/5">
              <ResponsiveContainer width="100%" height={340}>
                <AreaChart data={forecast} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorUncovered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      color: '#e2e8f0',
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="totalVacations"
                    name="Total Férias"
                    stroke="#818cf8"
                    fill="url(#colorTotal)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="uncoveredVacations"
                    name="Sem Cobertura"
                    stroke="#f43f5e"
                    fill="url(#colorUncovered)"
                    strokeWidth={2}
                  />
                  <Bar
                    dataKey="intermitentesNeeded"
                    name="Intermitentes Necessários"
                    fill="#a78bfa"
                    radius={[4, 4, 0, 0]}
                    barSize={20}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-8 border border-white/5 text-center text-slate-400">
              Dados de previsão indisponíveis no momento.
            </div>
          )}
        </ErrorBoundary>

        {/* Chat moved to top of page */}
      </main>
    </div>
  )
}
