"use client";

import { useEffect, useMemo, useState } from "react";
import { DataState } from "@/components/ui-state";
import { useAuthContext } from "@/components/auth-context";
import { apiClient, ApiClientError } from "@/lib/frontend/api-client";
import type { AlertListItem } from "@/lib/frontend/types";

const SEVERITY_OPTIONS = ["all", "low", "medium", "high", "critical"] as const;
const REFRESH_OPTIONS = [0, 15, 30, 60] as const;

export default function AlertsPage() {
  const { tenantId } = useAuthContext();
  const [alerts, setAlerts] = useState<AlertListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<(typeof SEVERITY_OPTIONS)[number]>("all");
  const [confidenceMin, setConfidenceMin] = useState(0);
  const [refreshSeconds, setRefreshSeconds] = useState<(typeof REFRESH_OPTIONS)[number]>(0);
  const [fraudTypeFilter, setFraudTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const persistedConfidence = window.localStorage.getItem("ra.alerts.confidenceMin");
    const persistedRefresh = window.localStorage.getItem("ra.alerts.refreshSeconds");
    if (persistedConfidence) {
      const parsed = Number(persistedConfidence);
      if (!Number.isNaN(parsed)) setConfidenceMin(Math.min(95, Math.max(0, parsed)));
    }
    if (persistedRefresh) {
      const parsed = Number(persistedRefresh);
      if (REFRESH_OPTIONS.includes(parsed as (typeof REFRESH_OPTIONS)[number])) {
        setRefreshSeconds(parsed as (typeof REFRESH_OPTIONS)[number]);
      }
    }
  }, []);

  const loadAlerts = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await apiClient.getAlerts(tenantId);
      setAlerts(data.alerts);
      setSelectedId((prev) => prev ?? data.alerts[0]?.id ?? null);
    } catch (err) {
      if (!silent) {
        setAlerts([]);
      }
      setError(err instanceof ApiClientError ? err.message : "Failed to load alerts");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, [tenantId]);

  useEffect(() => {
    if (refreshSeconds === 0) return;
    const timer = window.setInterval(() => {
      void loadAlerts(true);
    }, refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [refreshSeconds, tenantId]);

  useEffect(() => {
    window.localStorage.setItem("ra.alerts.confidenceMin", String(confidenceMin));
  }, [confidenceMin]);

  useEffect(() => {
    window.localStorage.setItem("ra.alerts.refreshSeconds", String(refreshSeconds));
  }, [refreshSeconds]);

  const fraudTypes = useMemo(() => {
    return ["all", ...new Set(alerts.map((item) => item.fraud_type))];
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((item) => {
      const matchesSeverity = severityFilter === "all" ? true : item.severity === severityFilter;
      const matchesConfidence = item.confidence * 100 >= confidenceMin;
      const matchesFraudType = fraudTypeFilter === "all" ? true : item.fraud_type === fraudTypeFilter;
      return matchesSeverity && matchesConfidence && matchesFraudType;
    });
  }, [alerts, severityFilter, confidenceMin, fraudTypeFilter]);

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

      <div className="inline-form">
        <label htmlFor="alert-confidence" className="muted">
          Min confidence %
        </label>
        <input
          id="alert-confidence"
          className="input"
          type="number"
          min={0}
          max={95}
          value={confidenceMin}
          onChange={(event) => setConfidenceMin(Number(event.target.value))}
        />
        <label htmlFor="alert-refresh" className="muted">
          Auto refresh
        </label>
        <select
          id="alert-refresh"
          className="input"
          value={refreshSeconds}
          onChange={(event) => setRefreshSeconds(Number(event.target.value) as (typeof REFRESH_OPTIONS)[number])}
        >
          <option value={0}>off</option>
          <option value={15}>15s</option>
          <option value={30}>30s</option>
          <option value={60}>60s</option>
        </select>
        <label htmlFor="fraud-type-filter" className="muted">
          Fraud type
        </label>
        <select
          id="fraud-type-filter"
          className="input"
          value={fraudTypeFilter}
          onChange={(event) => setFraudTypeFilter(event.target.value)}
        >
          {fraudTypes.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
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
