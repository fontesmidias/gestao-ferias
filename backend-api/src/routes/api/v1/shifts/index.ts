import { buildLookupRoutes } from '../../../../modules/lookups/lookup-routes-factory'

export default buildLookupRoutes({
  model: 'shift',
  legacyField: 'shift',
  fkField: 'shiftId',
  auditAction: 'SHIFT_BACKFILL',
  extraFields: ['pattern', 'startTime', 'endTime'],
})
