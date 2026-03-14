-- Realtime demo seed for async ingestion + ML visibility.
-- Run after migrations.

insert into public.tenants (id, name, slug)
values
  ('11111111-1111-1111-1111-111111111111', 'Demo Telecom', 'demo-telecom')
on conflict (id) do nothing;

insert into public.partners (tenant_id, name, partner_type, status)
values
  ('11111111-1111-1111-1111-111111111111', 'Global Interconnect A', 'interconnect', 'active'),
  ('11111111-1111-1111-1111-111111111111', 'Roaming Partner B', 'roaming', 'active')
on conflict do nothing;

insert into public.rules (tenant_id, rule_name, rule_type, threshold, is_active)
values
  ('11111111-1111-1111-1111-111111111111', 'PBX Duration Spike', 'pbx_hacking', 7200, true),
  ('11111111-1111-1111-1111-111111111111', 'SIM Box Burst Short Calls', 'sim_box', 5, true),
  ('11111111-1111-1111-1111-111111111111', 'Roaming Tariff Mismatch', 'roaming_fraud', 50, true),
  ('11111111-1111-1111-1111-111111111111', 'Interconnect Underbilling', 'interconnect_leakage', 0.85, true)
on conflict do nothing;

insert into public.workflows (tenant_id, workflow_name, workflow_type, status, is_active)
values
  ('11111111-1111-1111-1111-111111111111', 'Fraud Triage', 'alert_to_case', 'active', true),
  ('11111111-1111-1111-1111-111111111111', 'Leakage Recovery', 'reconciliation', 'active', true),
  ('11111111-1111-1111-1111-111111111111', 'Report Distribution', 'report_distribution', 'active', true)
on conflict do nothing;

insert into public.network_elements (tenant_id, element_code, element_type, region, status, anomaly_score, revenue_impact)
values
  ('11111111-1111-1111-1111-111111111111', 'MSC-001', 'msc', 'west', 'active', 0.21, 120.50),
  ('11111111-1111-1111-1111-111111111111', 'SBC-101', 'sbc', 'north', 'active', 0.78, 1040.35),
  ('11111111-1111-1111-1111-111111111111', 'GGSN-42', 'ggsn', 'east', 'degraded', 0.66, 620.10)
on conflict do nothing;

insert into public.settlements (tenant_id, period_start, period_end, amount_due, amount_paid, status)
values
  ('11111111-1111-1111-1111-111111111111', current_date - 30, current_date - 1, 18000, 14200, 'open'),
  ('11111111-1111-1111-1111-111111111111', current_date - 60, current_date - 31, 16200, 16200, 'closed')
on conflict do nothing;

-- Seed async jobs for queue/status UI visibility.
insert into public.cdr_ingest_jobs (
  tenant_id, status, priority, payload, record_count, attempts, max_attempts, result, created_at, updated_at
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'completed',
    7,
    jsonb_build_object('records', jsonb_build_array()),
    1200,
    1,
    3,
    jsonb_build_object('inserted', 1200, 'alertsGenerated', 27, 'quality', jsonb_build_object('qualityScore', 98.9)),
    now() - interval '15 minutes',
    now() - interval '12 minutes'
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'processing',
    8,
    jsonb_build_object('records', jsonb_build_array()),
    950,
    0,
    3,
    null,
    now() - interval '2 minutes',
    now() - interval '1 minutes'
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'pending',
    6,
    jsonb_build_object('records', jsonb_build_array()),
    500,
    0,
    3,
    null,
    now() - interval '1 minutes',
    now() - interval '1 minutes'
  )
on conflict do nothing;

insert into public.reports (tenant_id, report_type, status, payload, generated_at)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'compliance',
    'generated',
    jsonb_build_object('windowDays', 30, 'summary', 'Monthly compliance package'),
    now() - interval '6 hours'
  )
on conflict do nothing;

insert into public.report_distribution_jobs (
  tenant_id, channel, recipient, status, attempts, max_attempts, payload, scheduled_for, processed_at
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'email',
    'ops-team@demo-telecom.example',
    'delivered',
    1,
    3,
    jsonb_build_object('reportType', 'compliance', 'format', 'pdf'),
    now() - interval '5 hours',
    now() - interval '5 hours'
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    'webhook',
    'https://example.invalid/ra-hook',
    'queued',
    0,
    3,
    jsonb_build_object('reportType', 'fraud', 'format', 'json'),
    now() + interval '10 minutes',
    null
  )
on conflict do nothing;

insert into public.ml_model_registry (
  tenant_id, model_name, model_version, source_type, metrics, artifact_path, is_active
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'fraud-classifier',
    'v1',
    'local',
    jsonb_build_object('top1_accuracy', 0.9829, 'dataset_rows', 350),
    'models/fraud-model-trained.json',
    true
  )
on conflict do nothing;
