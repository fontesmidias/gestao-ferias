import { redirect } from 'next/navigation'

// Página dedicada de imports foi removida. Importação acontece direto na
// página de Colaboradores (botão Upload na toolbar). SUPERADMIN ainda tem
// /admin/imports/employees para batch cross-tenant.
export default function DeprecatedImportsPage() {
  redirect('/employees')
}
