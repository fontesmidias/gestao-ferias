import Holidays from 'date-holidays'
import { startOfDay, format, addDays, subDays } from 'date-fns'
import type { PrismaClient } from '@prisma/client'

export type HolidaySource = 'NATIONAL' | 'STATE' | 'MANUAL'

export interface ResolvedHoliday {
  date: string // YYYY-MM-DD
  name: string
  source: HolidaySource
}

interface CacheEntry {
  resolvedAt: number
  holidays: ResolvedHoliday[]
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1h

export class HolidayResolver {
  private cache = new Map<string, CacheEntry>()

  constructor(private prisma: PrismaClient) {}

  async getHolidays(params: { tenantId: string; year: number }): Promise<ResolvedHoliday[]> {
    const { tenantId, year } = params
    const key = `${tenantId}:${year}`
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.resolvedAt < CACHE_TTL_MS) {
      return cached.holidays
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { uf: true }
    })

    const libHolidays = this.resolveFromLib(year, tenant?.uf ?? null)

    const overrides = await this.prisma.tenantHoliday.findMany({
      where: {
        tenantId,
        date: {
          gte: new Date(`${year}-01-01`),
          lte: new Date(`${year}-12-31`),
        }
      }
    })

    const removed = new Set(
      overrides
        .filter(o => o.action === 'REMOVE')
        .map(o => format(o.date, 'yyyy-MM-dd'))
    )

    const resolved: ResolvedHoliday[] = libHolidays.filter(h => !removed.has(h.date))

    for (const o of overrides) {
      if (o.action !== 'ADD') continue
      const dateStr = format(o.date, 'yyyy-MM-dd')
      if (resolved.some(h => h.date === dateStr)) continue
      resolved.push({ date: dateStr, name: o.name, source: 'MANUAL' })
    }

    resolved.sort((a, b) => a.date.localeCompare(b.date))

    this.cache.set(key, { resolvedAt: Date.now(), holidays: resolved })
    return resolved
  }

  async isHoliday(date: Date, tenantId: string): Promise<ResolvedHoliday | null> {
    const year = date.getFullYear()
    const target = format(startOfDay(date), 'yyyy-MM-dd')
    const holidays = await this.getHolidays({ tenantId, year })
    return holidays.find(h => h.date === target) ?? null
  }

  async isHolidayEve(date: Date, tenantId: string): Promise<ResolvedHoliday | null> {
    const next = addDays(startOfDay(date), 1)
    return this.isHoliday(next, tenantId)
  }

  invalidateCache(tenantId: string, year?: number): void {
    if (year !== undefined) {
      this.cache.delete(`${tenantId}:${year}`)
      return
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${tenantId}:`)) this.cache.delete(key)
    }
  }

  private resolveFromLib(year: number, uf: string | null): ResolvedHoliday[] {
    const result: ResolvedHoliday[] = []
    const seen = new Set<string>()

    const national = new Holidays('BR')
    for (const h of national.getHolidays(year)) {
      if (h.type !== 'public') continue
      const dateStr = format(h.start, 'yyyy-MM-dd')
      if (seen.has(dateStr)) continue
      seen.add(dateStr)
      result.push({ date: dateStr, name: h.name, source: 'NATIONAL' })
    }

    if (uf && /^[A-Z]{2}$/.test(uf)) {
      try {
        const state = new Holidays('BR', uf)
        for (const h of state.getHolidays(year)) {
          if (h.type !== 'public') continue
          const dateStr = format(h.start, 'yyyy-MM-dd')
          if (seen.has(dateStr)) continue
          seen.add(dateStr)
          result.push({ date: dateStr, name: h.name, source: 'STATE' })
        }
      } catch {
        // UF inválida — silencia, retorna apenas nacionais
      }
    }

    return result
  }
}

// Helper: format ISO date string from Date (sem timezone offset)
export function dateOnlyString(d: Date): string {
  return format(startOfDay(d), 'yyyy-MM-dd')
}

// Helper expostos para uso fora da classe
export { addDays, subDays, startOfDay, format }
