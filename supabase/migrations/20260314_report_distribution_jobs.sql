create table if not exists public.report_distribution_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  channel text not null,
  recipient text not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  scheduled_for timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_distribution_jobs_channel_check check (channel in ('email', 'webhook')),
  constraint report_distribution_jobs_status_check check (status in ('queued', 'processing', 'delivered', 'failed')),
  constraint report_distribution_jobs_attempts_check check (attempts >= 0 and max_attempts >= 1)
);

create index if not exists idx_report_distribution_jobs_tenant_status
  on public.report_distribution_jobs (tenant_id, status, scheduled_for asc);

alter table public.report_distribution_jobs enable row level security;

create policy tenant_scoped_report_distribution_jobs_all on public.report_distribution_jobs
for all using (app.is_service_role() or tenant_id = app.current_tenant_id())
with check (app.is_service_role() or tenant_id = app.current_tenant_id());
