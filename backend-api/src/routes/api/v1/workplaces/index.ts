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
      let positions = 0

      // Agrupar por nome do posto (pode ter varias linhas = varias funcoes)
      const grouped = new Map<string, typeof rawData>()
      for (const row of rawData) {
        if (!row.name) continue
        const key = row.name
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(row)
      }

      for (const [name, rows] of grouped) {
        const first = rows[0]
        // Criar ou encontrar o posto
        let workplace = await fastify.prisma.workplace.findFirst({
          where: { name, tenantId }
        })
        if (!workplace) {
          workplace = await fastify.prisma.workplace.create({
            data: {
              name,
              client: first.client || null,
              address: first.address || null,
              minStaff: first.minStaff ? parseInt(first.minStaff) : 1,
              tenantId,
            }
          })
          created++
        }

        // Criar posicoes (funcoes) para cada linha que tem positionRole
        for (const row of rows) {
          if (row.positionRole) {
            await fastify.prisma.workplacePosition.create({
              data: {
                workplaceId: workplace.id,
                role: row.positionRole,
                shiftPattern: row.positionShift || null,
                requiredCount: row.positionCount ? parseInt(row.positionCount) : 1,
                tenantId,
              }
            })
            positions++
          }
        }
      }

      return {
        message: `Importacao concluida: ${created} postos criados, ${positions} posicoes adicionadas.`,
        workplaces: created,
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
