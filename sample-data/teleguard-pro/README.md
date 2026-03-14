# TeleGuard Pro Sample Data

This folder contains a synthetic dataset pack for testing ingestion, fraud analysis, reconciliation, dashboards, reports, and ML training.

Structure:

- `db/`: snake_case CSVs aligned to the implemented Supabase tables.
- `api/`: camelCase CSVs aligned to API request payloads.
- `ml/`: labeled training data for `npm run ml:train`.
- `supplemental/`: requirements-level entities that are not yet modeled as DB tables in this repo.
- `manifest.csv`: file inventory with row counts.

Regenerate everything with:

```bash
npm run data:generate
```

The generator uses realistic-but-synthetic telecom data with recent timestamps so the analytics and dashboard windows have usable activity immediately after import.
