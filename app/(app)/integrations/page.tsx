"use client";

import { useEffect, useState } from "react";
import { DataState } from "@/components/ui-state";
import { useAuthContext } from "@/components/auth-context";
import { apiClient, ApiClientError } from "@/lib/frontend/api-client";
import type {
  BillingConnector,
  CdrIngestJob,
  ConnectorSyncResult,
  FraudModelStatus,
  QualityEvent,
  ExistingCdrAnalysisResult,
} from "@/lib/frontend/types";
import type { CdrRecord } from "@/lib/backend/types";

export default function IntegrationsPage() {
  const { tenantId } = useAuthContext();
  const [connectors, setConnectors] = useState<BillingConnector[]>([]);
  const [syncResults, setSyncResults] = useState<ConnectorSyncResult[]>([]);
  const [qualityEvents, setQualityEvents] = useState<QualityEvent[]>([]);
  const [jobs, setJobs] = useState<CdrIngestJob[]>([]);
  const [modelStatus, setModelStatus] = useState<FraudModelStatus | null>(null);
  const [jobPayload, setJobPayload] = useState<string>(
    JSON.stringify(
      [
        {
          subscriberId: "sub-1001",
          msisdn: "919999100001",
          callType: "voice",
          originCountry: "IN",
          destinationCountry: "US",
          durationSeconds: 8200,
          chargeAmount: 120,
          billedAmount: 1850,
          eventTime: new Date().toISOString(),
          sourceSystem: "billing",
        },
      ],
      null,
      2,
    ),
  );
  const [jobBusy, setJobBusy] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisLimit, setAnalysisLimit] = useState(5000);
  const [existingAnalysisResult, setExistingAnalysisResult] = useState<ExistingCdrAnalysisResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [connectorData, complianceData, jobData, modelData] = await Promise.all([
          apiClient.getBillingSystems(tenantId),
          apiClient.getCompliance(tenantId),
          apiClient.listCdrIngestJobs(tenantId, { limit: 15 }),
          apiClient.getFraudModelStatus(tenantId),
        ]);
        setConnectors(connectorData.connectors);
        setQualityEvents(complianceData.qualityEvents);
        setJobs(jobData.jobs);
        setModelStatus(modelData);
      } catch (err) {
        setConnectors([]);
        setQualityEvents([]);
        setJobs([]);
        setModelStatus(null);
        setError(err instanceof ApiClientError ? err.message : "Unable to fetch ingestion/API health indicators");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [tenantId]);

  const runSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const data = await apiClient.syncBillingSystems(tenantId);
      setSyncResults(data.syncResults);
    } catch (err) {
      setSyncResults([]);
      setError(err instanceof ApiClientError ? err.message : "Unable to trigger connector sync");
    } finally {
      setSyncing(false);
    }
  };

  const refreshJobs = async () => {
    try {
      const data = await apiClient.listCdrIngestJobs(tenantId, { limit: 15 });
      setJobs(data.jobs);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Unable to refresh job status");
    }
  };

  const enqueueJob = async () => {
    setJobBusy(true);
    setError(null);
    try {
      const parsed = JSON.parse(jobPayload) as CdrRecord[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Payload must be a non-empty JSON array of CDR records");
      }
      await apiClient.enqueueCdrIngestJob(tenantId, { records: parsed, priority: 6, maxAttempts: 3 });
      await refreshJobs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to enqueue CDR job";
      setError(message);
    } finally {
      setJobBusy(false);
    }
  };

  const runWorker = async () => {
    setJobBusy(true);
    setError(null);
    try {
      await apiClient.processCdrJobs(tenantId, { maxJobs: 10 });
      await refreshJobs();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Unable to process CDR jobs");
    } finally {
      setJobBusy(false);
    }
  };

  const analyzeExisting = async () => {
    setAnalysisBusy(true);
    setError(null);
    try {
      const result = await apiClient.analyzeExistingCdrs(tenantId, { limit: analysisLimit });
      setExistingAnalysisResult(result);
      await refreshJobs();
    } catch (err) {
      setExistingAnalysisResult(null);
      setError(err instanceof ApiClientError ? err.message : "Unable to analyze existing CDRs");
    } finally {
      setAnalysisBusy(false);
    }
  };

  return (
    <div className="stack-lg">
      <div>
        <h2 className="page-title">Integrations & Platform Health</h2>
        <p className="muted">Connector setup, status diagnostics, error traces, and ingestion/API health indicators.</p>
      </div>

      <section className="grid-two">
        <article className="panel">
          <h3>Billing connectors</h3>
          <ul className="list">
            {connectors.map((connector) => (
              <li key={connector.name} className="list-item">
                <div>
                  <p className="list-title">{connector.name}</p>
                </div>
                <span className="badge connected">available</span>
              </li>
            ))}
          </ul>
          <div className="actions-row">
            <button type="button" className="button button-secondary" onClick={() => void runSync()} disabled={syncing}>
              {syncing ? "Syncing..." : "Run connector sync"}
            </button>
          </div>
          {syncResults.length > 0 ? (
            <ul className="list">
              {syncResults.map((result) => (
                <li key={`${result.connector}-${result.syncedAt}`} className="list-item">
                  <div>
                    <p className="list-title">{result.connector}</p>
                    <p className="muted">
                      {result.recordsPulled} records pulled at {new Date(result.syncedAt).toLocaleString()}
                    </p>
                    {result.details ? <p className="muted">{result.details}</p> : null}
                  </div>
                  <span className={`badge ${result.status === "success" ? "connected" : "error"}`}>
                    {result.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </article>

        <article className="panel">
          <h3>API & ingestion health</h3>
          <DataState
            loading={loading}
            error={error}
            isEmpty={!loading && !error && qualityEvents.length === 0}
            emptyTitle="No health data"
            emptyDescription="Health cards appear once monitoring probes are active."
          >
            <ul className="list">
              {qualityEvents.map((item) => (
                <li key={item.id} className="list-item">
                  <div>
                    <p className="list-title">Quality run {new Date(item.created_at).toLocaleString()}</p>
                    <p className="muted">
                      Score {Number(item.quality_score).toFixed(2)}% • Failed {item.failed_count} / {item.checked_count}
                    </p>
                  </div>
                  <span className={`badge ${Number(item.quality_score) >= 95 ? "healthy" : "degraded"}`}>
                    {Number(item.quality_score) >= 95 ? "healthy" : "degraded"}
                  </span>
                </li>
              ))}
            </ul>
          </DataState>
        </article>
      </section>

      <section className="grid-two">
        <article className="panel">
          <h3>Live CDR ingest queue</h3>
          <p className="muted">
            Push real-time CDR batches to async queue and run worker processing from UI.
          </p>
          <textarea
            className="input"
            style={{ width: "100%", minHeight: 180 }}
            value={jobPayload}
            onChange={(event) => setJobPayload(event.target.value)}
          />
          <div className="actions-row">
            <button type="button" className="button" onClick={() => void enqueueJob()} disabled={jobBusy}>
              {jobBusy ? "Working..." : "Enqueue Batch"}
            </button>
            <button type="button" className="button button-secondary" onClick={() => void runWorker()} disabled={jobBusy}>
              Process Jobs
            </button>
            <button type="button" className="button button-secondary" onClick={() => void refreshJobs()} disabled={jobBusy}>
              Refresh
            </button>
          </div>
          <ul className="list">
            {jobs.map((job) => (
              <li key={job.id} className="list-item">
                <div>
                  <p className="list-title">{job.id.slice(0, 8)} • {job.status}</p>
                  <p className="muted">
                    Records {job.recordCount} • Attempts {job.attempts}/{job.maxAttempts}
                  </p>
                  {job.errorMessage ? <p className="muted">{job.errorMessage}</p> : null}
                </div>
                <span className={`badge ${job.status === "completed" ? "completed" : job.status === "failed" ? "failed" : "running"}`}>
                  {job.status}
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h3>Analyze Existing CDRs</h3>
          <p className="muted">Run fraud detection directly on existing CDR rows from Supabase, no JSON paste required.</p>
          <div className="inline-form">
            <label htmlFor="existing-cdr-limit" className="muted">
              Rows
            </label>
            <input
              id="existing-cdr-limit"
              className="input"
              type="number"
              min={1}
              max={20000}
              value={analysisLimit}
              onChange={(event) => setAnalysisLimit(Number(event.target.value))}
            />
            <button type="button" className="button" onClick={() => void analyzeExisting()} disabled={analysisBusy}>
              {analysisBusy ? "Analyzing..." : "Analyze Existing Data"}
            </button>
          </div>
          {existingAnalysisResult ? (
            <div className="panel soft">
              <p className="list-title">
                Scanned {existingAnalysisResult.scanned.toLocaleString()} rows, generated{" "}
                {existingAnalysisResult.alertsGenerated.toLocaleString()} alerts
              </p>
              <ul className="list compact">
                {Object.entries(existingAnalysisResult.byFraudType).map(([key, value]) => (
                  <li key={key}>
                    {key}: {value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      </section>

      <section className="grid-two">
        <article className="panel">
          <h3>Fraud model status</h3>
          {modelStatus ? (
            <ul className="list compact">
              <li>Enabled: {modelStatus.enabled ? "yes" : "no"}</li>
              <li>Model available: {modelStatus.available ? "yes" : "no"}</li>
              <li>Version: {modelStatus.version ?? "n/a"}</li>
              <li>Trained at: {modelStatus.trainedAt ? new Date(modelStatus.trainedAt).toLocaleString() : "n/a"}</li>
              <li>Feature count: {modelStatus.featureCount ?? 0}</li>
            </ul>
          ) : (
            <p className="muted">Model status unavailable.</p>
          )}
        </article>
      </section>
    </div>
  );
}
