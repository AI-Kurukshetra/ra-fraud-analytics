"use client";

import { useEffect, useState } from "react";
import { DataState } from "@/components/ui-state";
import { useAuthContext } from "@/components/auth-context";
import { apiClient, ApiClientError } from "@/lib/frontend/api-client";
import type { BillingConnector, ConnectorSyncResult, QualityEvent } from "@/lib/frontend/types";

const EXPECTED_CONNECTORS = ["amdocs", "oracle", "ericsson", "huawei"] as const;

export default function IntegrationsPage() {
  const { tenantId } = useAuthContext();
  const [connectors, setConnectors] = useState<BillingConnector[]>([]);
  const [syncResults, setSyncResults] = useState<ConnectorSyncResult[]>([]);
  const [qualityEvents, setQualityEvents] = useState<QualityEvent[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const connectorMap = new Map(connectors.map((item) => [item.name.toLowerCase(), item]));
  const expectedCoverage = EXPECTED_CONNECTORS.map((name) => ({
    name,
    available: connectorMap.has(name),
  }));

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [connectorData, complianceData] = await Promise.all([
          apiClient.getBillingSystems(tenantId),
          apiClient.getCompliance(tenantId),
        ]);
        setConnectors(connectorData.connectors);
        setQualityEvents(complianceData.qualityEvents);
      } catch (err) {
        setConnectors([]);
        setQualityEvents([]);
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

  return (
    <div className="stack-lg">
      <div>
        <h2 className="page-title">Integrations & Platform Health</h2>
        <p className="muted">Connector setup, status diagnostics, error traces, and ingestion/API health indicators.</p>
      </div>

      <section className="grid-two">
        <article className="panel">
          <h3>Billing connectors</h3>
          <ul className="list compact">
            {expectedCoverage.map((item) => (
              <li key={item.name} className="list-item">
                <p className="list-title">{item.name}</p>
                <span className={`badge ${item.available ? "connected" : "warning"}`}>
                  {item.available ? "available" : "not configured"}
                </span>
              </li>
            ))}
          </ul>
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
    </div>
  );
}
