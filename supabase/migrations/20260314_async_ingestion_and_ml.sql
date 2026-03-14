create table if not exists public.cdr_ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending',
  priority smallint not null default 5,
  payload jsonb not null,
  record_count integer not null,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  worker_id text,
  error_message text,
  result jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cdr_ingest_jobs_status_check check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint cdr_ingest_jobs_priority_check check (priority between 1 and 10),
  constraint cdr_ingest_jobs_attempts_check check (attempts >= 0 and max_attempts >= 1)
);

create index if not exists idx_cdr_ingest_jobs_tenant_status_priority
  on public.cdr_ingest_jobs (tenant_id, status, priority desc, created_at asc);

create index if not exists idx_cdr_ingest_jobs_created_at
  on public.cdr_ingest_jobs (created_at desc);

create table if not exists public.ml_model_registry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  model_name text not null,
  model_version text not null,
  source_type text not null default 'local',
  metrics jsonb not null default '{}'::jsonb,
  artifact_path text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_ml_model_registry_tenant_model_version
  on public.ml_model_registry (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), model_name, model_version);

alter table public.cdr_ingest_jobs enable row level security;
alter table public.ml_model_registry enable row level security;

create policy tenant_scoped_cdr_ingest_jobs_all on public.cdr_ingest_jobs
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());

create policy tenant_scoped_ml_model_registry_all on public.ml_model_registry
for all using (app.is_service_role() or tenant_id = app.current_tenant_id() or tenant_id is null)
with check (app.is_service_role() or tenant_id = app.current_tenant_id() or tenant_id is null);
