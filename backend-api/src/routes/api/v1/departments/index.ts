import { buildLookupRoutes } from '../../../../modules/lookups/lookup-routes-factory'

export default buildLookupRoutes({
  model: 'department',
  legacyField: 'department',
  fkField: 'departmentId',
  auditAction: 'DEPARTMENT_BACKFILL',
})
