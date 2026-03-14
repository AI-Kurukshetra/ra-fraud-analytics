"use client";

import { useEffect, useMemo, useState } from "react";
import { DataState } from "@/components/ui-state";
import { useAuthContext } from "@/components/auth-context";
import { apiClient, ApiClientError } from "@/lib/frontend/api-client";
import type { AlertListItem } from "@/lib/frontend/types";

const SEVERITY_OPTIONS = ["all", "low", "medium", "high", "critical"] as const;

export default function AlertsPage() {
  const { tenantId } = useAuthContext();
  const [alerts, setAlerts] = useState<AlertListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<(typeof SEVERITY_OPTIONS)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.getAlerts(tenantId);
        setAlerts(data.alerts);
        setSelectedId(data.alerts[0]?.id ?? null);
      } catch (err) {
        setAlerts([]);
        setError(err instanceof ApiClientError ? err.message : "Failed to load alerts");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [tenantId]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((item) => (severityFilter === "all" ? true : item.severity === severityFilter));
  }, [alerts, severityFilter]);

  const selected = filteredAlerts.find((item) => item.id === selectedId) ?? filteredAlerts[0] ?? null;

  const updateStatus = async (status: "new" | "acknowledged" | "closed") => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const data = await apiClient.updateAlertStatus(tenantId, { id: selected.id, status });
      setAlerts((prev) => prev.map((item) => (item.id === data.alert.id ? data.alert : item)));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to update alert");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack-lg">
      <div>
        <h2 className="page-title">Alarm Management</h2>
        <p className="muted">Filter by severity, inspect details, and run operator acknowledgment workflows.</p>
      </div>

      <div className="chip-row">
        {SEVERITY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`chip ${severityFilter === option ? "active" : ""}`.trim()}
            onClick={() => setSeverityFilter(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <DataState
        loading={loading}
        error={error}
        isEmpty={!loading && !error && filteredAlerts.length === 0}
        emptyTitle="No alerts for this filter"
        emptyDescription="Adjust severity filters or ingest additional CDR data."
      >
        <section className="grid-two">
          <article className="panel">
            <h3>Alert queue</h3>
            <ul className="list">
              {filteredAlerts.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`list-item button-reset ${selected?.id === item.id ? "selected" : ""}`.trim()}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div>
                      <p className="list-title">{item.title}</p>
                      <p className="muted">{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`badge ${item.severity}`}>{item.severity}</span>
                  </button>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel">
            <h3>Alert detail</h3>
            {selected ? (
              <div className="stack-md">
                <p className="list-title">{selected.title}</p>
                <p className="muted">{selected.description}</p>
                <div className="chip-row">
                  <span className={`badge ${selected.severity}`}>{selected.severity}</span>
                  <span className="badge neutral">{selected.status}</span>
                  <span className="badge neutral">confidence {Math.round(selected.confidence * 100)}%</span>
                </div>

                <div className="actions-row">
                  <button
                    className="button"
                    type="button"
                    onClick={() => void updateStatus("acknowledged")}
                    disabled={saving || selected.status === "acknowledged" || selected.status === "closed"}
                  >
                    {saving ? "Saving..." : "Acknowledge"}
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => void updateStatus("closed")}
                    disabled={saving || selected.status === "closed"}
                  >
                    Close Alert
                  </button>
                </div>
              </div>
            ) : (
              <p className="muted">Select an alert from the queue.</p>
            )}
          </article>
        </section>
      </DataState>
    </div>
  );
}
