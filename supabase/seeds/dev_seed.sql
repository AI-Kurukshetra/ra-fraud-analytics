-- Run after creating at least one auth user in Supabase Auth.

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
  ('11111111-1111-1111-1111-111111111111', 'Roaming Tariff Mismatch', 'roaming_fraud', 50, true)
on conflict do nothing;

insert into public.workflows (tenant_id, workflow_name, workflow_type, status, is_active)
values
  ('11111111-1111-1111-1111-111111111111', 'Fraud Triage', 'alert_to_case', 'active', true),
  ('11111111-1111-1111-1111-111111111111', 'Leakage Recovery', 'reconciliation', 'active', true)
on conflict do nothing;

insert into public.network_elements (tenant_id, element_code, element_type, region, status, anomaly_score, revenue_impact)
values
  ('11111111-1111-1111-1111-111111111111', 'MSC-001', 'msc', 'west', 'active', 0.21, 120.50),
  ('11111111-1111-1111-1111-111111111111', 'SBC-101', 'sbc', 'north', 'active', 0.78, 1040.35)
on conflict do nothing;
