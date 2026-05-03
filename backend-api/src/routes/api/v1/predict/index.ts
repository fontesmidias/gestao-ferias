import { FastifyPluginAsync } from 'fastify'
import { VacationEngine } from '../../../../modules/vacations/vacation-engine'
import { ROIEngine } from '../../../../modules/finance/roi-engine'
import { PromptBuilder } from '../../../../modules/ai/prompt-builder'
import { isInScope, buildOutOfScopeAnswer, SUPPORTED_TOPICS } from '../../../../modules/predict/scope-filter'
import { addMonths, startOfMonth, endOfMonth, format } from 'date-fns'

const predict: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Riscos reais: colaboradores com férias vencidas ou prestes a vencer
  fastify.get('/risks', {
    onRequest: [fastify.requireAuth]
  }, async (request) => {
    const { tenantId } = request.user as any

    const employees = await fastify.prisma.employee.findMany({
      where: { tenantId, status: 'ATIVO' },
      select: { id: true, name: true, hireDate: true, salary: true, balanceOffset: true, position: true }
    })

    const risks = employees.map(emp => {
      const periods = VacationEngine.calculatePeriods(emp.hireDate, 0, emp.balanceOffset)
      const vencidos = periods.filter(p => p.status === 'VENCIDO')
      const concessivos = periods.filter(p => p.status === 'CONCESSIVO')

      if (vencidos.length === 0 && concessivos.length === 0) return null

      // CLT Art. 137: multa = salário + 1/3 por período vencido
      const multaEstimada = vencidos.length > 0 && emp.salary
        ? Number(emp.salary) * (1 + 1/3) * vencidos.length
        : 0

      const savingsEstimado = emp.salary
        ? ROIEngine.calculateImpact(emp.salary, 30).totalContingency
        : 0

      return {
        employeeId: emp.id,
        name: emp.name,
        position: emp.position,
        risk: vencidos.length > 0 ? 'HIGH' : 'MEDIUM',
        vencidoCount: vencidos.length,
        concessivoCount: concessivos.length,
        multaEstimada: Math.round(multaEstimada * 100) / 100,
        savingsEstimado: Math.round(savingsEstimado * 100) / 100,
        deadline: concessivos[0]?.concessiveEndDate || vencidos[0]?.concessiveEndDate || null,
        action: vencidos.length > 0 ? 'Agendar Férias Urgente' : 'Planejar Férias'
      }
    }).filter(Boolean).sort((a: any, b: any) => {
      if (a.risk === 'HIGH' && b.risk !== 'HIGH') return -1
      if (a.risk !== 'HIGH' && b.risk === 'HIGH') return 1
      return (b.multaEstimada || 0) - (a.multaEstimada || 0)
    })

    const totalMulta = risks.reduce((sum, r: any) => sum + r.multaEstimada, 0)
    const totalSavings = risks.reduce((sum, r: any) => sum + r.savingsEstimado, 0)

    return {
      summary: {
        totalRisks: risks.length,
        highRisks: risks.filter((r: any) => r.risk === 'HIGH').length,
        totalMultaEstimada: Math.round(totalMulta * 100) / 100,
        totalSavingsEstimado: Math.round(totalSavings * 100) / 100,
      },
      risks
    }
  })

  // Previsão de demanda de cobertura por mês — Story 4.3 / M4
  // Diferencia ferista EFETIVO (custo zero, já no payroll) de intermitente (custo).
  fastify.get('/coverage-forecast', {
    onRequest: [fastify.requireAuth]
  }, async (request) => {
    const { tenantId } = request.user as any
    const today = new Date()
    const months: any[] = []

    // Salário médio dos intermitentes do tenant (para estimativa de custo).
    const intermitentesSal = await fastify.prisma.employee.aggregate({
      where: { tenantId, employeeType: 'INTERMITENTE', status: 'ATIVO' },
      _avg: { salary: true },
    })
    const avgIntermitenteSalary = intermitentesSal._avg.salary
      ? Number(intermitentesSal._avg.salary)
      : 0

    for (let i = 0; i < 6; i++) {
      const monthStart = startOfMonth(addMonths(today, i))
      const monthEnd = endOfMonth(addMonths(today, i))

      const vacations = await fastify.prisma.vacationRequest.findMany({
        where: {
          tenantId,
          status: { in: ['APPROVED', 'SIGNED'] },
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart }
        },
        include: {
          employee: {
            select: {
              id: true, name: true,
              allocations: {
                where: { status: 'ACTIVE' },
                include: { workplacePosition: { include: { workplace: { select: { id: true, name: true } } } } }
              }
            }
          },
          coverages: true
        }
      })

      const uncovered = vacations.filter(v => v.coverages.length === 0)
      const affectedWorkplaces = new Set<string>()
      uncovered.forEach(v => {
        const alloc = v.employee.allocations[0]
        if (alloc) affectedWorkplaces.add(alloc.workplacePosition.workplace.name)
      })

      // Pool de feristas EFETIVO disponíveis (sem cobertura sobreposta ao mês).
      const feristaEfetivoPool = await fastify.prisma.employee.count({
        where: {
          tenantId,
          status: 'ATIVO',
          employeeType: 'EFETIVO',
          isFerista: true,
          coveragesAsReplacement: {
            none: {
              startDate: { lte: monthEnd },
              endDate: { gte: monthStart },
              status: { in: ['PLANNED', 'ACTIVE'] },
            },
          },
        },
      })

      // Média de dias por férias do mês (para estimativa de custo).
      const avgDaysPerCoverage = uncovered.length > 0
        ? Math.round(uncovered.reduce((acc, v) => acc + (v.days ?? 0), 0) / uncovered.length)
        : 0

      const split = ROIEngine.splitCoverage({
        uncoveredCount: uncovered.length,
        feristaEfetivoPool,
        avgIntermitenteSalary,
        avgDaysPerCoverage,
      })

      months.push({
        month: format(monthStart, 'yyyy-MM'),
        totalVacations: vacations.length,
        uncoveredVacations: uncovered.length,
        affectedWorkplaces: Array.from(affectedWorkplaces),
        feristaEfetivoPool,
        feristaEfetivoCovers: split.feristaEfetivoCovers,
        intermitentesNeeded: split.intermitentesNeeded,
        estimatedIntermitenteCost: split.estimatedIntermitenteCost,
        estimatedSavedCost: split.estimatedSavedCost,
      })
    }

    return { forecast: months, avgIntermitenteSalary }
  })

  // Chat com LLM — pergunta em linguagem natural
  fastify.post('/ask', {
    onRequest: [fastify.requireAuth],
    schema: {
      body: {
        type: 'object',
        required: ['question'],
        properties: {
          question: { type: 'string', minLength: 5 }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { question } = request.body as { question: string }

    // Story 4.4 / M3 — filtro de escopo ANTES de qualquer chamada externa.
    // Economiza custo LLM + redireciona educadamente AC linha 669-671.
    const scope = isInScope(question)
    if (!scope.inScope) {
      return {
        answer: buildOutOfScopeAnswer(scope.reason),
        provider: 'scope-filter',
        source: 'Filtro local — sem chamada LLM',
        scope: 'out_of_scope' as const,
        reason: scope.reason,
        supportedTopics: SUPPORTED_TOPICS,
      }
    }

    // Buscar configuração LLM do tenant
    const tenant = await fastify.prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) {
      return reply.code(404).send({ error: 'Tenant não encontrado.' })
    }

    // Story 4.1: PromptBuilder centralizado com dados reais do tenant
    const tenantContext = await PromptBuilder.buildContext(fastify.prisma, tenantId)
    const systemPrompt = PromptBuilder.buildSystemPrompt(tenantContext)
    const sourceAttribution = PromptBuilder.buildSourceAttribution(tenantContext)

    // 30-second timeout for LLM calls
    const LLM_TIMEOUT_MS = 30_000
    const TIMEOUT_RESPONSE = { error: 'Timeout', message: 'Consulta demorou mais que o esperado. Tente novamente.' }

    function createTimeoutSignal(): AbortSignal {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
      return controller.signal
    }

    // Helper functions for each provider
    async function callOpenAI(apiKey: string, model: string): Promise<{ answer: string; provider: string } | null> {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: question }
            ],
            max_tokens: 1000
          }),
          signal: createTimeoutSignal()
        })
        const data = await response.json() as any
        if (data.choices?.[0]?.message?.content) {
          return { answer: data.choices[0].message.content, provider: 'openai' }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return reply.code(504).send(TIMEOUT_RESPONSE) as any
        }
        fastify.log.error(`[PREDICT] OpenAI error: ${err}`)
      }
      return null
    }

    async function callAnthropic(apiKey: string, model: string): Promise<{ answer: string; provider: string } | null> {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model,
            max_tokens: 1000,
            system: systemPrompt,
            messages: [{ role: 'user', content: question }]
          }),
          signal: createTimeoutSignal()
        })
        const data = await response.json() as any
        if (data.content?.[0]?.text) {
          return { answer: data.content[0].text, provider: 'anthropic' }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return reply.code(504).send(TIMEOUT_RESPONSE) as any
        }
        fastify.log.error(`[PREDICT] Anthropic error: ${err}`)
      }
      return null
    }

    async function callGemini(apiKey: string, model: string): Promise<{ answer: string; provider: string } | null> {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPrompt}\n\nPergunta: ${question}` }] }]
            }),
            signal: createTimeoutSignal()
          }
        )
        const data = await response.json() as any
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          return { answer: data.candidates[0].content.parts[0].text, provider: 'gemini' }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return reply.code(504).send(TIMEOUT_RESPONSE) as any
        }
        fastify.log.error(`[PREDICT] Gemini error: ${err}`)
      }
      return null
    }

    async function callGroq(apiKey: string, model: string): Promise<{ answer: string; provider: string } | null> {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: question }
            ],
            max_tokens: 1000
          }),
          signal: createTimeoutSignal()
        })
        const data = await response.json() as any
        if (data.choices?.[0]?.message?.content) {
          return { answer: data.choices[0].message.content, provider: 'groq' }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return reply.code(504).send(TIMEOUT_RESPONSE) as any
        }
        fastify.log.error(`[PREDICT] Groq error: ${err}`)
      }
      return null
    }

    // If tenant has an explicit provider selected, use ONLY that provider
    if (tenant.llmProvider) {
      const selectedModel = tenant.llmModel
      let result: { answer: string; provider: string } | null = null

      switch (tenant.llmProvider) {
        case 'openai':
          if (tenant.openaiKey) {
            result = await callOpenAI(tenant.openaiKey, selectedModel || 'gpt-4o-mini')
          }
          break
        case 'anthropic':
          if (tenant.anthropicKey) {
            result = await callAnthropic(tenant.anthropicKey, selectedModel || 'claude-sonnet-4-20250514')
          }
          break
        case 'gemini':
          if (tenant.geminiKey) {
            result = await callGemini(tenant.geminiKey, selectedModel || 'gemini-1.5-flash')
          }
          break
        case 'groq':
          if (tenant.groqKey) {
            result = await callGroq(tenant.groqKey, selectedModel || 'llama-3.3-70b-versatile')
          }
          break
      }

      if (result) return { ...result, source: sourceAttribution }

      return reply.code(503).send({
        error: 'Falha no provedor selecionado',
        message: `O provedor "${tenant.llmProvider}" está configurado mas a chamada falhou. Verifique a chave de API nas Configurações.`
      })
    }

    // Fallback chain: OpenAI -> Anthropic -> Gemini -> Groq
    if (tenant.openaiKey) {
      const result = await callOpenAI(tenant.openaiKey, 'gpt-4o-mini')
      if (result) return { ...result, source: sourceAttribution }
    }

    if (tenant.anthropicKey) {
      const result = await callAnthropic(tenant.anthropicKey, 'claude-sonnet-4-20250514')
      if (result) return { ...result, source: sourceAttribution }
    }

    if (tenant.geminiKey) {
      const result = await callGemini(tenant.geminiKey, 'gemini-1.5-flash')
      if (result) return { ...result, source: sourceAttribution }
    }

    if (tenant.groqKey) {
      const result = await callGroq(tenant.groqKey, 'llama-3.3-70b-versatile')
      if (result) return { ...result, source: sourceAttribution }
    }

    return reply.code(503).send({
      error: 'Nenhuma LLM configurada',
      message: 'Configure uma chave de API (OpenAI, Anthropic, Gemini ou Groq) nas Configurações do Tenant para ativar o Oráculo AI.'
    })
  })

  // Story 4.5 / L2 — Streaming SSE do chat. Emite eventos:
  //   data: {"type":"token","content":"..."}     — incremental
  //   data: {"type":"meta","provider":"...","source":"...","scope":"..."}  — termina contexto
  //   data: {"type":"done"}                       — fim
  //   data: {"type":"error","message":"..."}     — erro tratado
  fastify.post('/ask/stream', {
    onRequest: [fastify.requireAuth],
    schema: {
      body: {
        type: 'object',
        required: ['question'],
        properties: { question: { type: 'string', minLength: 5 } },
      },
    },
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { question } = request.body as { question: string }

    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    reply.raw.flushHeaders?.()

    const send = (obj: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`)
    }
    const end = () => { reply.raw.end() }

    // Filtro de escopo antes de qualquer coisa.
    const scope = isInScope(question)
    if (!scope.inScope) {
      send({ type: 'token', content: buildOutOfScopeAnswer(scope.reason) })
      send({
        type: 'meta',
        provider: 'scope-filter',
        source: 'Filtro local — sem chamada LLM',
        scope: 'out_of_scope',
        reason: scope.reason,
        supportedTopics: SUPPORTED_TOPICS,
      })
      send({ type: 'done' })
      end()
      return reply
    }

    const tenant = await fastify.prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) {
      send({ type: 'error', message: 'Tenant não encontrado.' })
      end()
      return reply
    }

    const tenantContext = await PromptBuilder.buildContext(fastify.prisma, tenantId)
    const systemPrompt = PromptBuilder.buildSystemPrompt(tenantContext)
    const sourceAttribution = PromptBuilder.buildSourceAttribution(tenantContext)

    const STREAM_TIMEOUT_MS = 60_000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS)

    // Stream OpenAI
    async function streamOpenAI(apiKey: string, model: string): Promise<boolean> {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: question },
            ],
            max_tokens: 1000,
            stream: true,
          }),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) return false
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        // OpenAI emite linhas SSE "data: {json}\n\n" + "data: [DONE]\n\n"
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (payload === '[DONE]') continue
            try {
              const json = JSON.parse(payload)
              const content = json.choices?.[0]?.delta?.content
              if (content) send({ type: 'token', content })
            } catch { /* ignora chunk parcial */ }
          }
        }
        return true
      } catch {
        return false
      }
    }

    // Stream Anthropic
    async function streamAnthropic(apiKey: string, model: string): Promise<boolean> {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model, max_tokens: 1000, system: systemPrompt,
            messages: [{ role: 'user', content: question }],
            stream: true,
          }),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) return false
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        // Anthropic emite "event: <name>\ndata: {json}\n\n"
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const part of parts) {
            for (const ln of part.split('\n')) {
              const line = ln.trim()
              if (!line.startsWith('data:')) continue
              const payload = line.slice(5).trim()
              try {
                const json = JSON.parse(payload)
                if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                  send({ type: 'token', content: json.delta.text })
                }
              } catch { /* ignora chunk parcial */ }
            }
          }
        }
        return true
      } catch {
        return false
      }
    }

    // Fallback não-streaming: pega resposta completa e emite como 1 token.
    async function nonStreamFallback(): Promise<{ ok: boolean; provider?: string }> {
      try {
        if (tenant?.geminiKey) {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${tenant.geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\nPergunta: ${question}` }] }],
              }),
              signal: controller.signal,
            },
          )
          const data = await r.json() as any
          const txt = data.candidates?.[0]?.content?.parts?.[0]?.text
          if (txt) { send({ type: 'token', content: txt }); return { ok: true, provider: 'gemini' } }
        }
        if (tenant?.groqKey) {
          const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tenant.groqKey}` },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: question },
              ],
              max_tokens: 1000,
            }),
            signal: controller.signal,
          })
          const data = await r.json() as any
          const txt = data.choices?.[0]?.message?.content
          if (txt) { send({ type: 'token', content: txt }); return { ok: true, provider: 'groq' } }
        }
      } catch { /* ignore */ }
      return { ok: false }
    }

    let provider: string | null = null
    try {
      // Provider explícito
      if (tenant.llmProvider === 'openai' && tenant.openaiKey) {
        if (await streamOpenAI(tenant.openaiKey, tenant.llmModel || 'gpt-4o-mini')) provider = 'openai'
      } else if (tenant.llmProvider === 'anthropic' && tenant.anthropicKey) {
        if (await streamAnthropic(tenant.anthropicKey, tenant.llmModel || 'claude-sonnet-4-20250514')) provider = 'anthropic'
      } else if (tenant.llmProvider === 'gemini' || tenant.llmProvider === 'groq') {
        const fb = await nonStreamFallback()
        if (fb.ok) provider = fb.provider!
      } else {
        // Fallback chain stream-first
        if (!provider && tenant.openaiKey) {
          if (await streamOpenAI(tenant.openaiKey, 'gpt-4o-mini')) provider = 'openai'
        }
        if (!provider && tenant.anthropicKey) {
          if (await streamAnthropic(tenant.anthropicKey, 'claude-sonnet-4-20250514')) provider = 'anthropic'
        }
        if (!provider) {
          const fb = await nonStreamFallback()
          if (fb.ok) provider = fb.provider!
        }
      }
    } finally {
      clearTimeout(timer)
    }

    if (!provider) {
      send({
        type: 'error',
        message: 'Nenhuma LLM configurada ou disponível. Configure chave de API nas Configurações do Tenant.',
      })
      end()
      return reply
    }

    send({ type: 'meta', provider, source: sourceAttribution, scope: 'in_scope' })
    send({ type: 'done' })
    end()
    return reply
  })
}

export default predict
