create extension if not exists pgcrypto;

create schema if not exists app;

create or replace function app.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id'), '')::uuid;
$$;

create or replace function app.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role', false);
$$;

create type public.membership_role as enum ('owner', 'admin', 'analyst', 'viewer');
create type public.alert_severity as enum ('low', 'medium', 'high', 'critical');
create type public.case_status as enum ('open', 'investigating', 'resolved', 'closed');
create type public.workflow_status as enum ('active', 'paused', 'disabled');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists public.cdrs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscriber_id text not null,
  imsi text,
  msisdn text not null,
  call_type text not null,
  origin_country text not null,
  destination_country text not null,
  duration_seconds integer not null,
  charge_amount numeric(14,2) not null,
  billed_amount numeric(14,2) not null,
  event_time timestamptz not null,
  source_system text not null,
  cell_id text,
  network_element_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cdrs_tenant_event_time on public.cdrs(tenant_id, event_time desc);
create index if not exists idx_cdrs_subscriber on public.cdrs(tenant_id, subscriber_id);

create table if not exists public.alerts (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cdr_id uuid references public.cdrs(id) on delete set null,
  title text not null,
  description text not null,
  fraud_type text not null,
  severity public.alert_severity not null,
  confidence numeric(5,2) not null,
  dedupe_key text not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key)
);

create table if not exists public.reconciliation_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  record_key text not null,
  mismatch_amount numeric(14,2) not null,
  leakage_amount numeric(14,2) not null,
  severity public.alert_severity not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  status public.case_status not null default 'open',
  assignee_user_id uuid references auth.users(id) on delete set null,
  alert_id text references public.alerts(id) on delete set null,
  revenue_impact numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_type text not null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  partner_type text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.network_elements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  element_code text not null,
  element_type text not null,
  region text not null,
  status text not null default 'active',
  anomaly_score numeric(8,4) not null default 0,
  revenue_impact numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  rule_name text not null,
  rule_type text not null,
  threshold numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_name text not null,
  workflow_type text not null,
  status public.workflow_status not null default 'active',
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  partner_id uuid references public.partners(id) on delete set null,
  period_start date not null,
  period_end date not null,
  amount_due numeric(14,2) not null,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.data_quality_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quality_score numeric(6,2) not null,
  checked_count integer not null,
  failed_count integer not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.data_lineage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_system text not null,
  dataset text not null,
  operation text not null,
  record_count integer not null,
  processed_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.cdrs enable row level security;
alter table public.alerts enable row level security;
alter table public.reconciliation_results enable row level security;
alter table public.cases enable row level security;
alter table public.reports enable row level security;
alter table public.partners enable row level security;
alter table public.network_elements enable row level security;
alter table public.rules enable row level security;
alter table public.workflows enable row level security;
alter table public.settlements enable row level security;
alter table public.audit_logs enable row level security;
alter table public.data_quality_runs enable row level security;
alter table public.data_lineage_events enable row level security;

create policy profiles_self_select on public.profiles for select using (id = auth.uid() or app.is_service_role());
create policy profiles_self_update on public.profiles for update using (id = auth.uid() or app.is_service_role());

create policy tenants_member_select on public.tenants
for select using (
  app.is_service_role() or exists (
    select 1 from public.memberships m where m.tenant_id = tenants.id and m.user_id = auth.uid() and m.is_active
  )
);

create policy memberships_member_select on public.memberships
for select using (app.is_service_role() or user_id = auth.uid() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_cdrs_all on public.cdrs
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_alerts_all on public.alerts
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_reconciliation_all on public.reconciliation_results
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_cases_all on public.cases
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_reports_all on public.reports
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_partners_all on public.partners
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_network_elements_all on public.network_elements
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_rules_all on public.rules
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_workflows_all on public.workflows
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_settlements_all on public.settlements
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_audit_all on public.audit_logs
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_quality_all on public.data_quality_runs
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_lineage_all on public.data_lineage_events
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());
