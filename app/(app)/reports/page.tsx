"use client";

import { useEffect, useState } from "react";
import { DataState } from "@/components/ui-state";
import { useAuthContext } from "@/components/auth-context";
import { apiClient, ApiClientError } from "@/lib/frontend/api-client";
import type { AuditEvent, LineageEvent, QualityEvent, ReportRecord } from "@/lib/frontend/types";

export default function ReportsPage() {
  const { tenantId } = useAuthContext();
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [qualityEvents, setQualityEvents] = useState<QualityEvent[]>([]);
  const [lineageEvents, setLineageEvents] = useState<LineageEvent[]>([]);
  const [analyticsTimeline, setAnalyticsTimeline] = useState<
    Array<{ date: string; alerts: number; cases: number; reconciliations: number; leakage: number }>
  >([]);
  const [reconciliationSummary, setReconciliationSummary] = useState<{
    totalLeakageAmount: number;
    totalMismatchAmount: number;
  } | null>(null);
  const [reportType, setReportType] = useState("operational");
  const [days, setDays] = useState("14");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reportData, complianceData] = await Promise.all([
        apiClient.getReports(tenantId),
        apiClient.getCompliance(tenantId),
      ]);
      const [analyticsRes, reconciliationRes] = await Promise.all([
        fetch(`/api/v1/analytics?windowDays=${days}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-id": tenantId,
          },
          cache: "no-store",
        }),
        fetch(`/api/v1/reconciliation?limit=500`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-id": tenantId,
          },
          cache: "no-store",
        }),
      ]);

      const analyticsJson = (await analyticsRes.json().catch(() => null)) as
        | { success: true; data: { timeline?: Array<{ date: string; alerts: number; cases: number; reconciliations: number; leakage: number }> } }
        | { success: false; error: { message: string } }
        | null;
      const reconciliationJson = (await reconciliationRes.json().catch(() => null)) as
        | { success: true; data: { summary?: { totalLeakageAmount?: number; totalMismatchAmount?: number } } }
        | { success: false; error: { message: string } }
        | null;

      if (!analyticsRes.ok || !analyticsJson || !analyticsJson.success) {
        const message = analyticsJson && "error" in analyticsJson ? analyticsJson.error.message : "Failed analytics";
        throw new ApiClientError(message, "REQUEST_FAILED", analyticsRes.status);
      }
      if (!reconciliationRes.ok || !reconciliationJson || !reconciliationJson.success) {
        const message = reconciliationJson && "error" in reconciliationJson ? reconciliationJson.error.message : "Failed reconciliation summary";
        throw new ApiClientError(message, "REQUEST_FAILED", reconciliationRes.status);
      }

      setReports(reportData.reports);
      setAuditEvents(complianceData.auditEvents);
      setQualityEvents(complianceData.qualityEvents);
      setLineageEvents(complianceData.lineageEvents);
      setAnalyticsTimeline(analyticsJson.data.timeline ?? []);
      setReconciliationSummary({
        totalLeakageAmount: reconciliationJson.data.summary?.totalLeakageAmount ?? 0,
        totalMismatchAmount: reconciliationJson.data.summary?.totalMismatchAmount ?? 0,
      });
    } catch (err) {
      setReports([]);
      setAuditEvents([]);
      setQualityEvents([]);
      setLineageEvents([]);
      setAnalyticsTimeline([]);
      setReconciliationSummary(null);
      setError(err instanceof ApiClientError ? err.message : "Failed to load report center data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [tenantId, days]);

  const generateReport = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await apiClient.generateReport(tenantId, { reportType });
      setReports((prev) => [data.report, ...prev]);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to generate report");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack-lg">
      <div>
        <h2 className="page-title">Reporting, Compliance & Data Trust</h2>
        <p className="muted">Automated report center, compliance exports, quality status, and lineage visibility.</p>
      </div>

      <DataState
        loading={loading}
        error={error}
        isEmpty={!loading && !error && reports.length === 0}
        emptyTitle="No reports generated"
        emptyDescription="Run an on-demand report job or configure recurring schedules."
      >
        <section className="grid-two">
          <article className="panel">
            <h3>Report center</h3>
            <div className="actions-row">
              <select className="input" value={reportType} onChange={(event) => setReportType(event.target.value)}>
                <option value="operational">Operational</option>
                <option value="compliance">Compliance</option>
                <option value="fraud">Fraud</option>
                <option value="executive">Executive</option>
              </select>
              <button type="button" className="button" onClick={() => void generateReport()} disabled={saving}>
                {saving ? "Generating..." : "Generate report"}
              </button>
            </div>
            <ul className="list">
              {reports.map((report) => (
                <li key={report.id} className="list-item">
                  <div>
                    <p className="list-title">{report.report_type}</p>
                    <p className="muted">{new Date(report.generated_at).toLocaleString()}</p>
                  </div>
                  <span className="badge completed">{report.status}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel">
            <h3>Compliance dashboard</h3>
            <div className="actions-row">
              <label className="muted" htmlFor="history-days">
                Window
              </label>
              <select id="history-days" className="input" value={days} onChange={(event) => setDays(event.target.value)}>
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </div>
            <ul className="list compact">
              <li>Audit events: {auditEvents.length}</li>
              <li>Quality runs: {qualityEvents.length}</li>
              <li>Lineage events: {lineageEvents.length}</li>
              <li>
                Last quality score:{" "}
                {qualityEvents[0] ? `${Number(qualityEvents[0].quality_score).toFixed(2)}%` : "n/a"}
              </li>
              <li>Total leakage tracked: ${reconciliationSummary?.totalLeakageAmount.toLocaleString() ?? "0"}</li>
              <li>Total mismatch tracked: ${reconciliationSummary?.totalMismatchAmount.toLocaleString() ?? "0"}</li>
            </ul>
          </article>
        </section>

        <article className="panel">
          <h3>Historical analytics</h3>
          <ul className="list">
            {analyticsTimeline.map((item) => (
              <li key={item.date} className="list-item">
                <div>
                  <p className="list-title">{item.date}</p>
                  <p className="muted">
                    Alerts {item.alerts} • Cases {item.cases} • Reconciliations {item.reconciliations}
                  </p>
                </div>
                <span className="badge neutral">${Number(item.leakage).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h3>Data lineage and trust map</h3>
          <ul className="list">
            {lineageEvents.map((node) => (
              <li key={node.id} className="list-item">
                <div>
                  <p className="list-title">{node.dataset}</p>
                  <p className="muted">
                    {node.source_system} • {node.operation} • {node.record_count.toLocaleString()} records
                  </p>
                </div>
                <span className="badge neutral">{new Date(node.processed_at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </article>
      </DataState>
    </div>
  );
}
