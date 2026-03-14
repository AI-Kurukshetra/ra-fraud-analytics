"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { DataState } from "@/components/ui-state";
import { useAuthContext } from "@/components/auth-context";
import { apiClient, ApiClientError } from "@/lib/frontend/api-client";
import type { CaseListItem, MembershipUser } from "@/lib/frontend/types";

const STATUS_FLOW: Array<CaseListItem["status"]> = ["open", "investigating", "resolved", "closed"];

export default function CasesPage() {
  const { tenantId } = useAuthContext();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<MembershipUser[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [draftAssignee, setDraftAssignee] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftImpact, setDraftImpact] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCases = async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersData, casesRes] = await Promise.all([
        apiClient.getUsers(tenantId),
        fetch("/api/v1/cases", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-id": tenantId,
          },
          cache: "no-store",
        }),
      ]);

      const casesJson = (await casesRes.json().catch(() => null)) as
        | { success: true; data: { cases: CaseListItem[]; summary?: { statusBreakdown?: Record<string, number> } } }
        | { success: false; error: { message: string } }
        | null;

      if (!casesRes.ok || !casesJson || !casesJson.success) {
        const message = casesJson && "error" in casesJson ? casesJson.error.message : "Failed to load cases";
        throw new ApiClientError(message, "REQUEST_FAILED", casesRes.status);
      }

      setMembers(membersData.users);
      setCases(casesJson.data.cases);
      setSummary(casesJson.data.summary?.statusBreakdown ?? {});
      setSelectedId(casesJson.data.cases[0]?.id ?? null);
    } catch (err) {
      setCases([]);
      setMembers([]);
      setSummary({});
      setError(err instanceof ApiClientError ? err.message : "Failed to load cases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCases();
  }, [tenantId]);

  const selected = useMemo(() => {
    return cases.find((item) => item.id === selectedId) ?? cases[0] ?? null;
  }, [cases, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setDraftAssignee(selected.assignee_user_id ?? "");
    setDraftNotes(selected.notes ?? "");
    setDraftImpact(String(selected.revenue_impact ?? 0));
  }, [selected?.id]);

  const createCase = async (event: FormEvent) => {
    event.preventDefault();
    if (!newTitle.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const created = await apiClient.createCase(tenantId, {
        title: newTitle,
        assigneeUserId: newAssignee || undefined,
      });
      setCases((prev) => [created.case, ...prev]);
      setSelectedId(created.case.id);
      setNewTitle("");
      setNewAssignee("");
      setSummary((prev) => ({ ...prev, open: (prev.open ?? 0) + 1 }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to create case");
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async () => {
    if (!selected) return;

    const currentIndex = STATUS_FLOW.indexOf(selected.status);
    const next = STATUS_FLOW[currentIndex + 1];
    if (!next) return;

    setSaving(true);
    setError(null);
    try {
      const updated = await apiClient.updateCase(tenantId, {
        id: selected.id,
        status: next,
      });
      setCases((prev) => prev.map((item) => (item.id === updated.case.id ? updated.case : item)));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to update case");
    } finally {
      setSaving(false);
    }
  };

  const saveDetails = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiClient.updateCase(tenantId, {
        id: selected.id,
        assigneeUserId: draftAssignee || undefined,
        notes: draftNotes,
        revenueImpact: Number(draftImpact),
      });
      setCases((prev) => prev.map((item) => (item.id === updated.case.id ? updated.case : item)));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to save case details");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack-lg">
      <div>
        <h2 className="page-title">Case Management</h2>
        <p className="muted">Assign, investigate, resolve, and track impact with timeline and evidence views.</p>
      </div>

      <section className="metrics-grid">
        <article className="metric-card">
          <p className="muted">Open</p>
          <h3>{summary.open ?? 0}</h3>
        </article>
        <article className="metric-card">
          <p className="muted">Investigating</p>
          <h3>{summary.investigating ?? 0}</h3>
        </article>
        <article className="metric-card">
          <p className="muted">Resolved</p>
          <h3>{summary.resolved ?? 0}</h3>
        </article>
        <article className="metric-card">
          <p className="muted">Closed</p>
          <h3>{summary.closed ?? 0}</h3>
        </article>
      </section>

      <form className="inline-form" onSubmit={createCase}>
        <input
          className="input"
          placeholder="New case title"
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
        />
        <select className="input" value={newAssignee} onChange={(event) => setNewAssignee(event.target.value)}>
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.user_id} ({member.role})
            </option>
          ))}
        </select>
        <button className="button" type="submit" disabled={saving}>
          {saving ? "Saving..." : "Create case"}
        </button>
      </form>

      <DataState
        loading={loading}
        error={error}
        isEmpty={!loading && !error && cases.length === 0}
        emptyTitle="No active cases"
        emptyDescription="Cases appear here when alerts are investigated or manually created."
      >
        <section className="grid-two">
          <article className="panel">
            <h3>Case queue</h3>
            <ul className="list">
              {cases.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`list-item button-reset ${selected?.id === item.id ? "selected" : ""}`.trim()}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div>
                      <p className="list-title">{item.title}</p>
                      <p className="muted">Impact ${item.revenue_impact.toLocaleString()}</p>
                    </div>
                    <span className={`badge ${item.status}`}>{item.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel">
            <h3>Case detail</h3>
            {selected ? (
              <div className="stack-md">
                <div className="actions-row">
                  <span className={`badge ${selected.status}`}>{selected.status}</span>
                  <button className="button" type="button" onClick={() => void advanceStatus()} disabled={saving}>
                    Advance status
                  </button>
                </div>
                <label className="muted" htmlFor="assignee-user">
                  Assignee
                </label>
                <select
                  id="assignee-user"
                  className="input"
                  value={draftAssignee}
                  onChange={(event) => setDraftAssignee(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.user_id} ({member.role})
                    </option>
                  ))}
                </select>
                <label className="muted" htmlFor="case-impact">
                  Revenue Impact
                </label>
                <input
                  id="case-impact"
                  className="input"
                  value={draftImpact}
                  onChange={(event) => setDraftImpact(event.target.value)}
                />
                <label className="muted" htmlFor="case-notes">
                  Notes
                </label>
                <textarea
                  id="case-notes"
                  className="input"
                  rows={4}
                  value={draftNotes}
                  onChange={(event) => setDraftNotes(event.target.value)}
                />
                <button className="button button-secondary" type="button" onClick={() => void saveDetails()} disabled={saving}>
                  Save details
                </button>

                <div className="panel soft">
                  <h4>Timeline</h4>
                  <ul className="list compact">
                    <li>Created: {new Date(selected.created_at).toLocaleString()}</li>
                    <li>Last update: {new Date(selected.updated_at).toLocaleString()}</li>
                    <li>Current owner: {selected.assignee_user_id ?? "Unassigned"}</li>
                  </ul>
                </div>

                <div className="panel soft">
                  <h4>Evidence panel</h4>
                  <ul className="list compact">
                    <li>Linked alert: {selected.alert_id ?? "Not linked"}</li>
                    <li>Revenue impact: ${selected.revenue_impact.toLocaleString()}</li>
                    <li>Recommended action: Validate billing adjustments and block repeat pattern.</li>
                  </ul>
                </div>
              </div>
            ) : (
              <p className="muted">Select a case from the queue.</p>
            )}
          </article>
        </section>
      </DataState>
    </div>
  );
}
