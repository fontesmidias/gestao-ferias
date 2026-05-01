import fp from 'fastify-plugin'
import { HolidayResolver } from '../modules/holidays/holiday-resolver'

export default fp(async (fastify) => {
  const resolver = new HolidayResolver(fastify.prisma)
  fastify.decorate('holidayResolver', resolver)
}, {
  name: 'holidays',
  dependencies: ['prisma']
})

declare module 'fastify' {
  export interface FastifyInstance {
    holidayResolver: HolidayResolver
  }
}
