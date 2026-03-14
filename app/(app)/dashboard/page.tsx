"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient, ApiClientError } from "@/lib/frontend/api-client";
import { useAuthContext } from "@/components/auth-context";
import { DataState } from "@/components/ui-state";
import type { AlertListItem, AnalyticsKpis, CaseListItem, DashboardCard } from "@/lib/frontend/types";

export default function DashboardPage() {
  const { tenantId } = useAuthContext();
  const [mode, setMode] = useState<"operational" | "executive">("operational");
  const [hoursBack, setHoursBack] = useState(24);
  const [kpis, setKpis] = useState<AnalyticsKpis | null>(null);
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [alerts, setAlerts] = useState<AlertListItem[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [analyticsResponse, dashboardResponse, alertResponse, caseResponse] = await Promise.all([
          apiClient.getAnalytics(tenantId),
          apiClient.getDashboards(tenantId),
          apiClient.getAlerts(tenantId),
          apiClient.getCases(tenantId),
        ]);
        setKpis(analyticsResponse.kpis);
        setCards(dashboardResponse.cards);
        setAlerts(alertResponse.alerts);
        setCases(caseResponse.cases);
      } catch (err) {
        setKpis(null);
        setCards([]);
        setAlerts([]);
        setCases([]);
        setError(err instanceof ApiClientError ? err.message : "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [tenantId]);

  const metrics = useMemo(() => {
    const criticalAlerts = alerts.filter((item) => item.severity === "critical").length;
    const openCases = cases.filter((item) => item.status === "open" || item.status === "investigating").length;
    const recovered = cases
      .filter((item) => item.status === "resolved" || item.status === "closed")
      .reduce((sum, item) => sum + item.revenue_impact, 0);

    const recentAlerts = alerts.filter((item) => {
      return Date.now() - new Date(item.created_at).getTime() <= hoursBack * 3600 * 1000;
    });
    const recentCases = cases.filter((item) => {
      return Date.now() - new Date(item.updated_at).getTime() <= hoursBack * 3600 * 1000;
    });

    return {
      totalAlerts: kpis?.alertCount ?? alerts.length,
      criticalAlerts: mode === "executive" ? criticalAlerts : recentAlerts.filter((item) => item.severity === "critical").length,
      openCases: mode === "executive" ? openCases : recentCases.filter((item) => item.status === "open" || item.status === "investigating").length,
      recovered,
      cdrCount: kpis?.cdrCount ?? 0,
    };
  }, [alerts, cases, kpis, mode, hoursBack]);

  return (
    <div className="stack-lg">
      <div>
        <h2 className="page-title">Operational & Executive Dashboards</h2>
        <p className="muted">Real-time fraud, leakage, recovery impact, and investigation throughput.</p>
      </div>

      <div className="inline-form">
        <label htmlFor="dash-mode" className="muted">
          View
        </label>
        <select
          id="dash-mode"
          className="input"
          value={mode}
          onChange={(event) => setMode(event.target.value as "operational" | "executive")}
        >
          <option value="operational">Operational</option>
          <option value="executive">Executive</option>
        </select>
        <label htmlFor="dash-window" className="muted">
          Window
        </label>
        <select
          id="dash-window"
          className="input"
          value={hoursBack}
          onChange={(event) => setHoursBack(Number(event.target.value))}
          disabled={mode === "executive"}
        >
          <option value={6}>Last 6h</option>
          <option value={24}>Last 24h</option>
          <option value={72}>Last 72h</option>
        </select>
      </div>

      <DataState
        loading={loading}
        error={error}
        isEmpty={!loading && !error && alerts.length === 0 && cases.length === 0}
        emptyTitle="No dashboard data"
        emptyDescription="Ingest CDRs and create cases to populate live operational metrics."
      >
        <section className="metrics-grid">
          <article className="metric-card">
            <p className="muted">Active Alerts</p>
            <h3>{metrics.totalAlerts}</h3>
          </article>
          <article className="metric-card">
            <p className="muted">Critical Alerts</p>
            <h3>{metrics.criticalAlerts}</h3>
          </article>
          <article className="metric-card">
            <p className="muted">Open Cases</p>
            <h3>{metrics.openCases}</h3>
          </article>
          <article className="metric-card">
            <p className="muted">Recovered Revenue</p>
            <h3>${metrics.recovered.toLocaleString()}</h3>
          </article>
          <article className="metric-card">
            <p className="muted">CDR Count</p>
            <h3>{metrics.cdrCount.toLocaleString()}</h3>
          </article>
        </section>

        <article className="panel">
          <h3>Dashboard widgets</h3>
          <ul className="list compact">
            {cards.map((card) => (
              <li key={card.id} className="list-item">
                <div>
                  <p className="list-title">{card.title}</p>
                  <p className="muted">Widget: {card.widget}</p>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <section className="grid-two">
          <article className="panel">
            <h3>Latest high-risk alerts</h3>
            <ul className="list">
              {alerts.slice(0, 6).map((alert) => (
                <li key={alert.id} className="list-item">
                  <div>
                    <p className="list-title">{alert.title}</p>
                    <p className="muted">{alert.fraud_type.replace(/_/g, " ")}</p>
                  </div>
                  <span className={`badge ${alert.severity}`}>{alert.severity}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel">
            <h3>Case SLA watch</h3>
            <ul className="list">
              {cases.slice(0, 6).map((item) => (
                <li key={item.id} className="list-item">
                  <div>
                    <p className="list-title">{item.title}</p>
                    <p className="muted">Updated {new Date(item.updated_at).toLocaleString()}</p>
                  </div>
                  <span className={`badge ${item.status}`}>{item.status}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>
      </DataState>
    </div>
  );
}
