# Realtime Frontend Runbook (Async Ingestion + ML)

This runbook gives a frontend-visible flow with real data, not static fixtures.

## 1) Prerequisites

- Use Node `20+` (`next build` and modern tooling compatibility).
- Configure `.env.local` with:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `FRAUD_MODEL_ENABLED=true`
  - `FRAUD_MODEL_PATH=models/fraud-model-trained.json` (or `models/fraud-model-v1.json`)

## 2) Database setup

Run migrations in this order:

1. `supabase/migrations/20260314_backend_foundation.sql`
2. `supabase/migrations/20260314_async_ingestion_and_ml.sql`
3. `supabase/migrations/20260314_report_distribution_jobs.sql`

Run seeds:

1. `supabase/seeds/dev_seed.sql`
2. `supabase/seeds/realtime_demo_seed.sql`

## 3) Train model with realistic dataset

Use provided realistic CSV:

```bash
npm run ml:train -- docs/cdr_ml_dataset_realistic.csv models/fraud-model-trained.json
```

## 4) Start app and authenticate

```bash
npm install
npm run dev
```

Then:
- open `/signup` (or `/login` if existing user),
- complete tenant setup,
- ensure active tenant is `11111111-1111-1111-1111-111111111111` (demo seed tenant).

## 5) Frontend-visible realtime flow

From UI, open `/integrations`:

1. In `Live CDR ingest queue`, enqueue a JSON CDR batch.
2. Click `Process Jobs` to run worker processing.
3. Click `Refresh` to observe `pending -> processing -> completed`.
4. Check `Fraud model status` card for model availability/version.

Then verify downstream pages:

- `/alerts`: new ML-assisted fraud alerts and status actions.
- `/dashboard`: KPI movement after job completion.
- `/reports`: generated reports and timeline.
- `/compliance`: quality/lineage/audit events.

## 6) API parity checks (optional)

- `GET /api/v1/cdrs/ingest-async`
- `POST /api/v1/cdrs/jobs/process`
- `GET /api/v1/fraud-detection/model`

## 7) Expected operational outcomes

- Async queue supports burst ingestion without blocking client request cycles.
- Detection combines rule logic with model-assisted confidence uplift.
- Data quality, lineage, and audit records are generated per ingestion run.
- Frontend displays only API-backed states for ingestion/processing lifecycle.
