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
  const [reportType, setReportType] = useState("operational");
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
      setReports(reportData.reports);
      setAuditEvents(complianceData.auditEvents);
      setQualityEvents(complianceData.qualityEvents);
      setLineageEvents(complianceData.lineageEvents);
    } catch (err) {
      setReports([]);
      setAuditEvents([]);
      setQualityEvents([]);
      setLineageEvents([]);
      setError(err instanceof ApiClientError ? err.message : "Failed to load report center data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [tenantId]);

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
            <ul className="list compact">
              <li>Audit events: {auditEvents.length}</li>
              <li>Quality runs: {qualityEvents.length}</li>
              <li>Lineage events: {lineageEvents.length}</li>
              <li>
                Last quality score:{" "}
                {qualityEvents[0] ? `${Number(qualityEvents[0].quality_score).toFixed(2)}%` : "n/a"}
              </li>
            </ul>
          </article>
        </section>

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
