import { FastifyPluginAsync } from 'fastify'
import { ImportService } from '../../../../modules/employees/import-service'

const workplaces: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Download template de importacao de postos
  fastify.get('/import/template', {
    onRequest: [fastify.requireAuth]
  }, async (request, reply) => {
    const buffer = ImportService.generateWorkplaceTemplate()
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="modelo-postos.xlsx"')
      .send(buffer)
  })

  // Importar postos em massa via arquivo (CSV/Excel)
  fastify.post('/import', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin]
  }, async (request, reply) => {
    const data = await request.file()
    if (!data) {
      return reply.code(400).send({ error: 'Bad Request', message: 'Nenhum arquivo enviado.' })
    }

    const buffer = await data.toBuffer()
    const ext = data.filename.split('.').pop()?.toLowerCase() || ''
    const { tenantId } = request.user as any

    try {
      const rawData = await ImportService.parseWorkplaces(buffer, ext)
      let created = 0
      let updated = 0
      let positions = 0

      // Agrupa linhas pelo identificador único: externalId quando presente,
      // senão pelo nome (planilha externa pode ter múltiplas linhas para
      // funções diferentes do mesmo posto).
      const grouped = new Map<string, typeof rawData>()
      for (const row of rawData) {
        if (!row.name) continue
        const key = row.externalId ? `ext:${row.externalId}` : `name:${row.name}`
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(row)
      }

      // Aceita "11/18/2025 15:47:56" e "DD/MM/YYYY HH:mm:ss" e ISO.
      const parseAnyDate = (raw?: string): Date | null => {
        if (!raw) return null
        const m1 = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
        if (m1) {
          const [, a, b, y, h, mi, s] = m1
          // Heurística: se primeiro >12, é DD/MM; senão assumir DD/MM (BR padrão).
          const dd = Number(a), mm = Number(b)
          const day = dd > 12 ? dd : dd
          const month = dd > 12 ? mm : mm
          // Para Postos de Serviço.xlsx, sabemos que é MM/DD; mas o template
          // fala em DD/MM. Se a importação vier do template, dia<=12 funciona
          // em qualquer um. Se for re-import da planilha externa, usar BR (DD/MM).
          const d = new Date(Date.UTC(Number(y), month - 1, day, Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0)))
          return Number.isNaN(d.getTime()) ? null : d
        }
        const d = new Date(raw)
        return Number.isNaN(d.getTime()) ? null : d
      }

      for (const [, rows] of grouped) {
        const first = rows[0]
        const externalId = first.externalId || null
        const name = first.name

        // Resolve o posto: por externalId (chave forte) ou por name+externalId=null.
        let workplace = null
        if (externalId) {
          workplace = await fastify.prisma.workplace.findFirst({
            where: { tenantId, externalId },
          })
        } else {
          workplace = await fastify.prisma.workplace.findFirst({
            where: { tenantId, name, externalId: null },
          })
        }

        const upsertPayload = {
          tenantId,
          name,
          externalId,
          legalName: first.legalName || null,
          cnpj: first.cnpj || null,
          client: first.client || null,
          responsible: first.responsible || null,
          phone: first.phone || null,
          email: first.email || null,
          cep: first.cep || null,
          street: first.street || null,
          number: first.number || null,
          complement: first.complement || null,
          neighborhood: first.neighborhood || null,
          city: first.city || null,
          state: first.state || null,
          address: first.address || null,
          contractStatus: first.contractStatus || null,
          minStaff: first.minStaff ? parseInt(first.minStaff) : 1,
          importedBy: first.importedBy || null,
          importedAt: parseAnyDate(first.importedAt),
        }

        if (workplace) {
          workplace = await fastify.prisma.workplace.update({
            where: { id: workplace.id },
            data: upsertPayload,
          })
          updated++
        } else {
          workplace = await fastify.prisma.workplace.create({ data: upsertPayload })
          created++
        }

        // Posições — só cria se a linha trouxer positionRole e ainda não
        // existir uma posição igual (mesmo role+shift) no posto.
        for (const row of rows) {
          if (!row.positionRole) continue
          const existsPos = await fastify.prisma.workplacePosition.findFirst({
            where: {
              workplaceId: workplace.id,
              role: row.positionRole,
              shiftPattern: row.positionShift || null,
            },
          })
          if (existsPos) continue
          await fastify.prisma.workplacePosition.create({
            data: {
              workplaceId: workplace.id,
              role: row.positionRole,
              shiftPattern: row.positionShift || null,
              requiredCount: row.positionCount ? parseInt(row.positionCount) : 1,
              tenantId,
            },
          })
          positions++
        }
      }

      return {
        message: `Importação concluída: ${created} postos criados, ${updated} atualizados, ${positions} posições adicionadas.`,
        workplaces: created,
        updated,
        positions,
      }
    } catch (error: any) {
      request.log.error(error)
      return reply.code(400).send({ error: 'Import Error', message: error.message })
    }
  })

  // Criar posto de trabalho — schema expandido em 2026-05-04
  const workplaceBodyProps = {
    name: { type: 'string', minLength: 2 },
    address: { type: 'string' },
    client: { type: 'string' },
    minStaff: { type: 'integer', minimum: 1 },
    // identificação fiscal
    legalName: { type: 'string' },
    cnpj: { type: 'string' },
    externalId: { type: 'string' },
    // contato
    responsible: { type: 'string' },
    phone: { type: 'string' },
    email: { type: 'string' },
    // endereço estruturado
    cep: { type: 'string' },
    street: { type: 'string' },
    number: { type: 'string' },
    complement: { type: 'string' },
    neighborhood: { type: 'string' },
    city: { type: 'string' },
    state: { type: 'string' },
    // contrato / auditoria de import
    contractStatus: { type: 'string' },
    importedBy: { type: 'string' },
    importedAt: { type: 'string' },
  } as const

  fastify.post('/', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      body: { type: 'object', required: ['name'], properties: workplaceBodyProps }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const data = request.body as any

    const workplace = await fastify.prisma.workplace.create({
      data: {
        name: data.name,
        address: data.address || null,
        client: data.client || null,
        minStaff: data.minStaff || 1,
        legalName: data.legalName || null,
        cnpj: data.cnpj || null,
        externalId: data.externalId || null,
        responsible: data.responsible || null,
        phone: data.phone || null,
        email: data.email || null,
        cep: data.cep || null,
        street: data.street || null,
        number: data.number || null,
        complement: data.complement || null,
        neighborhood: data.neighborhood || null,
        city: data.city || null,
        state: data.state || null,
        contractStatus: data.contractStatus || null,
        importedBy: data.importedBy || null,
        importedAt: data.importedAt ? new Date(data.importedAt) : null,
        tenantId,
      }
    })

    return reply.code(201).send(workplace)
  })

  // Listar postos do tenant (paginado)
  fastify.get('/', {
    onRequest: [fastify.requireAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 20 },
        },
      },
    },
  }, async (request) => {
    const { tenantId } = request.user as any
    const query = (request.query ?? {}) as { page?: number; limit?: number }
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const skip = (page - 1) * limit

    const [data, total] = await Promise.all([
      fastify.prisma.workplace.findMany({
        where: { tenantId },
        include: {
          positions: {
            include: {
              _count: { select: { allocations: { where: { status: 'ACTIVE' } } } },
            },
          },
          _count: { select: { employees: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      fastify.prisma.workplace.count({ where: { tenantId } }),
    ])

    return { data, meta: { total, page, limit } }
  })

  // Detalhes do posto com positions e alocações ativas
  fastify.get('/:id', {
    onRequest: [fastify.requireAuth],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }

    const workplace = await fastify.prisma.workplace.findFirst({
      where: { id, tenantId },
      include: {
        positions: {
          include: {
            allocations: {
              where: { status: 'ACTIVE' },
              include: { employee: { select: { id: true, name: true, cpf: true, employeeType: true, isFerista: true } } }
            }
          }
        }
      }
    })

    if (!workplace) {
      return reply.code(404).send({ error: 'Not Found', message: 'Posto não encontrado.' })
    }

    return workplace
  })

  // Atualizar posto — aceita todos os campos novos
  fastify.patch('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      },
      body: { type: 'object', properties: workplaceBodyProps }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }
    const data = request.body as any

    const existing = await fastify.prisma.workplace.findFirst({ where: { id, tenantId } })
    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Posto não encontrado.' })
    }

    const patch: Record<string, unknown> = {}
    const passthrough = [
      'name', 'address', 'client', 'minStaff',
      'legalName', 'cnpj', 'externalId',
      'responsible', 'phone', 'email',
      'cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state',
      'contractStatus', 'importedBy',
    ]
    for (const k of passthrough) {
      if (data[k] !== undefined) patch[k] = data[k] === '' ? null : data[k]
    }
    if (data.importedAt !== undefined) {
      patch.importedAt = data.importedAt ? new Date(data.importedAt) : null
    }

    const updated = await fastify.prisma.workplace.update({
      where: { id: existing.id },
      data: patch,
    })

    return updated
  })

  // Deletar posto (apenas se sem alocações ativas)
  fastify.delete('/:id', {
    onRequest: [fastify.requireAuth, fastify.requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } }
      }
    }
  }, async (request, reply) => {
    const { tenantId } = request.user as any
    const { id } = request.params as { id: string }

    const existing = await fastify.prisma.workplace.findFirst({
      where: { id, tenantId },
      include: {
        positions: {
          include: { _count: { select: { allocations: { where: { status: 'ACTIVE' } } } } }
        }
      }
    })

    if (!existing) {
      return reply.code(404).send({ error: 'Not Found', message: 'Posto não encontrado.' })
    }

    const hasActiveAllocations = existing.positions.some((p: any) => p._count.allocations > 0)
    if (hasActiveAllocations) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Não é possível remover posto com alocações ativas. Desaloque os colaboradores primeiro.'
      })
    }

    // Deletar positions primeiro, depois o workplace
    await fastify.prisma.workplacePosition.deleteMany({ where: { workplaceId: id } })
    await fastify.prisma.workplace.delete({ where: { id } })

    return reply.code(204).send()
  })
}

export default workplaces
