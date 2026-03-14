"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { DataState } from "@/components/ui-state";
import { useAuthContext } from "@/components/auth-context";
import { apiClient, ApiClientError } from "@/lib/frontend/api-client";
import type { CaseListItem } from "@/lib/frontend/types";

const STATUS_FLOW: Array<CaseListItem["status"]> = ["open", "investigating", "resolved", "closed"];

export default function CasesPage() {
  const { tenantId } = useAuthContext();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCases = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getCases(tenantId);
      setCases(data.cases);
      setSelectedId(data.cases[0]?.id ?? null);
    } catch (err) {
      setCases([]);
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

  const createCase = async (event: FormEvent) => {
    event.preventDefault();
    if (!newTitle.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const created = await apiClient.createCase(tenantId, {
        title: newTitle,
      });
      setCases((prev) => [created.case, ...prev]);
      setSelectedId(created.case.id);
      setNewTitle("");
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

  return (
    <div className="stack-lg">
      <div>
        <h2 className="page-title">Case Management</h2>
        <p className="muted">Assign, investigate, resolve, and track impact with timeline and evidence views.</p>
      </div>

      <form className="inline-form" onSubmit={createCase}>
        <input
          className="input"
          placeholder="New case title"
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
        />
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
                <p className="muted">{selected.notes ?? "No notes yet."}</p>

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
