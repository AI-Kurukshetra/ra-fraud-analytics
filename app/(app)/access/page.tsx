"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@/components/auth-context";
import { DataState } from "@/components/ui-state";
import { apiClient, ApiClientError } from "@/lib/frontend/api-client";
import type { MembershipUser, RuleItem, WorkflowItem } from "@/lib/frontend/types";

export default function AccessPage() {
  const { tenantId } = useAuthContext();
  const [users, setUsers] = useState<MembershipUser[]>([]);
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [userData, ruleData, workflowData] = await Promise.all([
          apiClient.getUsers(tenantId),
          apiClient.getRules(tenantId),
          apiClient.getWorkflows(tenantId),
        ]);
        setUsers(userData.users);
        setRules(ruleData.rules);
        setWorkflows(workflowData.workflows);
      } catch (err) {
        setUsers([]);
        setRules([]);
        setWorkflows([]);
        setError(err instanceof ApiClientError ? err.message : "Unable to load access data");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [tenantId]);

  const roleCounts = useMemo(() => {
    return users.reduce<Record<string, number>>((acc, item) => {
      acc[item.role] = (acc[item.role] ?? 0) + 1;
      return acc;
    }, {});
  }, [users]);

  const activeMembershipCount = useMemo(
    () => users.filter((item) => item.is_active).length,
    [users],
  );

  return (
    <div className="stack-lg">
      <div>
        <h2 className="page-title">Access Management</h2>
        <p className="muted">Role and permission visibility, tenant users, and audit-focused governance controls.</p>
      </div>

      <DataState
        loading={loading}
        error={error}
        isEmpty={!loading && !error && users.length === 0}
        emptyTitle="No memberships found"
        emptyDescription="Tenant memberships must exist before role assignments can be managed."
      >
        <section className="grid-two">
          <article className="panel">
            <h3>Tenant users and roles</h3>
            <ul className="list">
              {users.map((item) => (
                <li key={`${item.user_id}-${item.role}`} className="list-item">
                  <div>
                    <p className="list-title">{item.user_id}</p>
                    <p className="muted">Active: {item.is_active ? "yes" : "no"}</p>
                  </div>
                  <span className="badge neutral">{item.role}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel">
            <h3>Role permissions</h3>
            <ul className="list">
              {Object.keys(roleCounts)
                .sort()
                .map((role) => (
                <li key={role} className="list-item">
                  <div>
                    <p className="list-title">
                      {role} ({roleCounts[role] ?? 0})
                    </p>
                    <p className="muted">Role assignments loaded from live tenant membership data.</p>
                  </div>
                </li>
                ))}
            </ul>
            <h3>Rule governance</h3>
            <ul className="list compact">
              <li>Active rules: {rules.filter((item) => item.is_active).length}</li>
              <li>Total rules: {rules.length}</li>
              <li>Active workflows: {workflows.filter((item) => item.is_active).length}</li>
              <li>Total workflows: {workflows.length}</li>
            </ul>
            <h3>Security posture</h3>
            <ul className="list compact">
              <li>Active memberships: {activeMembershipCount}</li>
              <li>RBAC roles enforced: owner, admin, analyst, viewer</li>
              <li>Audit logging: enabled on privileged API actions</li>
              <li>Mobile monitoring feed: available via dashboard mobile channel</li>
            </ul>
          </article>
        </section>
      </DataState>
    </div>
  );
}
