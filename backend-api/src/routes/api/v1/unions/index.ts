import { buildLookupRoutes } from '../../../../modules/lookups/lookup-routes-factory'

export default buildLookupRoutes({
  model: 'union',
  legacyField: 'unionName',
  fkField: 'unionId',
  auditAction: 'UNION_BACKFILL',
  extraFields: ['cnpj', 'category'],
})
