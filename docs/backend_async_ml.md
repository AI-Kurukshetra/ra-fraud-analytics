# Backend Async Ingestion + ML Scoring

## 1) Async CDR Ingestion Pipeline

### Endpoints
- `POST /api/v1/cdrs/ingest-async`
  - Enqueue a CDR ingest job.
  - Body: `{ records: CdrRecord[], priority?: number, maxAttempts?: number }`
- `GET /api/v1/cdrs/ingest-async`
  - List jobs for tenant.
  - Query: `status`, `limit`.
- `GET /api/v1/cdrs/jobs/{id}`
  - Fetch one job status/result.
- `POST /api/v1/cdrs/jobs/process`
  - Worker trigger to claim/process pending jobs.
  - Body: `{ maxJobs?: number, workerId?: string }`
- `GET /api/v1/fraud-detection/model`
  - Inspect model-enabled status and metadata.

### Job Lifecycle
- `pending` -> `processing` -> `completed`
- retries: `processing` -> `pending` (attempts increment)
- terminal fail: `processing` -> `failed` when attempts reach `max_attempts`

### Recommended production execution
- Run `POST /api/v1/cdrs/jobs/process` from a scheduler every 5-15 seconds.
- Use multiple worker IDs in parallel for throughput.
- Track queue health using `GET /api/v1/cdrs/ingest-async?status=pending|processing|failed`.

## 2) Model-Assisted Fraud Scoring

### Runtime
- Detection still uses deterministic rules, but now fuses model prediction for confidence and unknown-case lift.
- Model path default: `models/fraud-model-v1.json`.
- Env toggles:
  - `FRAUD_MODEL_ENABLED=true|false` (default enabled)
  - `FRAUD_MODEL_PATH=/abs/or/relative/path/to/model.json` (optional)

### Inspect model readiness
- `GET /api/v1/fraud-detection/model`

### Train a model from labeled data
1. Prepare CSV using template: `docs/cdr_ml_dataset_template.csv` or realistic sample `docs/cdr_ml_dataset_realistic.csv`.
2. Run:

```bash
npm run ml:train -- docs/cdr_ml_dataset_realistic.csv models/fraud-model-trained.json
```

3. Set env to use trained model:

```bash
FRAUD_MODEL_PATH=models/fraud-model-trained.json
```

## 3) Report Distribution Delivery Support

Schema support exists via `report_distribution_jobs` table for `email` and `webhook` channels.

- statuses: `queued`, `processing`, `delivered`, `failed`
- scheduling fields: `scheduled_for`, `processed_at`
- retry fields: `attempts`, `max_attempts`, `error_message`
