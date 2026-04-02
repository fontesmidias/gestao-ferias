-- Row Level Security (RLS) Setup
-- This script enables 100% data isolation at the database level.

-- Enable RLS on all tenant-specific tables
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vacation_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signatures" ENABLE ROW LEVEL SECURITY;

-- Create Tenant Isolation Policies
-- Using the current session setting 'app.current_tenant_id'
-- This must be set by the Backend (Prisma Middleware/Service) via `SET LOCAL app.current_tenant_id = 'uuid-here'`

-- Policy for 'users' table
CREATE POLICY tenant_isolation_policy ON "users"
    USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for 'employees' table
CREATE POLICY tenant_isolation_policy ON "employees"
    USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for 'audit_logs' table
CREATE POLICY tenant_isolation_policy ON "audit_logs"
    USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for 'vacation_requests' table
CREATE POLICY tenant_isolation_policy ON "vacation_requests"
    USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for 'signatures' table
CREATE POLICY tenant_isolation_policy ON "signatures"
    USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

-- Note: The 'tenants' table itself does NOT have RLS, as it is a meta-table 
-- managed by the SuperAdmin to manage all companies.
