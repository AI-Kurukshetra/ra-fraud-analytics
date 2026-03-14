"use client";

import { useEffect, useState } from "react";
import { useAuthContext } from "@/components/auth-context";
import { apiClient, ApiClientError } from "@/lib/frontend/api-client";
import type {
  InterconnectResult,
  NetworkElementItem,
  PartnerItem,
  ReconciliationHistoryItem,
  ReconciliationResult,
  RecoveryMetrics,
  RoamingResult,
} from "@/lib/frontend/types";
import type { ReconciliationItem } from "@/lib/backend/types";

const SAMPLE_ITEMS: ReconciliationItem[] = [
  {
    recordKey: "cdr-2001",
    tenantId: "placeholder",
    billedAmount: 15,
    mediatedAmount: 15,
    collectedAmount: 14,
  },
  {
    recordKey: "cdr-2002",
    tenantId: "placeholder",
    billedAmount: 21,
    mediatedAmount: 19,
    collectedAmount: 19,
  },
  {
    recordKey: "cdr-2003",
    tenantId: "placeholder",
    billedAmount: 7,
    mediatedAmount: 7,
    collectedAmount: 7,
  },
];

export default function RevenueAssurancePage() {
  const { tenantId } = useAuthContext();
  const [results, setResults] = useState<ReconciliationResult[]>([]);
  const [history, setHistory] = useState<ReconciliationHistoryItem[]>([]);
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [networkElements, setNetworkElements] = useState<NetworkElementItem[]>([]);
  const [interconnect, setInterconnect] = useState<InterconnectResult | null>(null);
  const [roaming, setRoaming] = useState<RoamingResult | null>(null);
  const [recovery, setRecovery] = useState<RecoveryMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [partnerId, setPartnerId] = useState("");
  const [routeCode, setRouteCode] = useState("INTL-VOICE-01");
  const [expectedTariff, setExpectedTariff] = useState("0.12");
  const [actualTariff, setActualTariff] = useState("0.15");
  const [minutes, setMinutes] = useState("1200");

  const [subscriberId, setSubscriberId] = useState("sub-001");
  const [homeCountry, setHomeCountry] = useState("IN");
  const [visitedCountry, setVisitedCountry] = useState("US");
  const [billedAmount, setBilledAmount] = useState("180");
  const [expectedAmount, setExpectedAmount] = useState("130");
  const [usageMb, setUsageMb] = useState("1600");

  const [estimatedLoss, setEstimatedLoss] = useState("50000");
  const [recoveredAmount, setRecoveredAmount] = useState("18000");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [historyData, partnerData, networkData] = await Promise.all([
          apiClient.getReconciliationHistory(tenantId),
          apiClient.getPartners(tenantId),
          apiClient.getNetworkElements(tenantId),
        ]);
        setHistory(historyData.reconciliation);
        setPartners(partnerData.partners);
        setNetworkElements(networkData.networkElements);
        setPartnerId((prev) => prev || partnerData.partners[0]?.id || "");
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Failed to load RA data");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [tenantId]);

  const runReconciliation = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.runReconciliation(
        tenantId,
        SAMPLE_ITEMS.map((item) => ({ ...item, tenantId })),
      );
      setResults(data.results);
      const historyData = await apiClient.getReconciliationHistory(tenantId);
      setHistory(historyData.reconciliation);
    } catch (err) {
      setResults([]);
      setError(err instanceof ApiClientError ? err.message : "Failed to run reconciliation");
    } finally {
      setLoading(false);
    }
  };

  const runInterconnectCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.validateInterconnect(tenantId, {
        partnerId,
        routeCode,
        expectedTariff: Number(expectedTariff),
        actualTariff: Number(actualTariff),
        minutes: Number(minutes),
      });
      setInterconnect(data.result);
    } catch (err) {
      setInterconnect(null);
      setError(err instanceof ApiClientError ? err.message : "Failed interconnect validation");
    } finally {
      setLoading(false);
    }
  };

  const runRoamingValidation = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.validateRoaming(tenantId, {
        subscriberId,
        homeCountry,
        visitedCountry,
        billedAmount: Number(billedAmount),
        expectedAmount: Number(expectedAmount),
        usageMb: Number(usageMb),
      });
      setRoaming(data.result);
    } catch (err) {
      setRoaming(null);
      setError(err instanceof ApiClientError ? err.message : "Failed roaming validation");
    } finally {
      setLoading(false);
    }
  };

  const runRecovery = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.calculateRecovery(tenantId, {
        estimatedLoss: Number(estimatedLoss),
        recoveredAmount: Number(recoveredAmount),
      });
      setRecovery(data.metrics);
    } catch (err) {
      setRecovery(null);
      setError(err instanceof ApiClientError ? err.message : "Failed recovery analysis");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stack-lg">
      <div>
        <h2 className="page-title">Revenue Assurance Analysis</h2>
        <p className="muted">Reconciliation, interconnect, roaming, and recovery workflows wired to live APIs.</p>
      </div>

      {error ? <p className="banner error">{error}</p> : null}

      <section className="grid-two">
        <article className="panel">
          <h3>Reconciliation mismatch drilldown</h3>
          <p className="muted">Use sample records to validate `/api/v1/revenue-assurance/reconcile`.</p>
          <button className="button" type="button" onClick={() => void runReconciliation()} disabled={loading}>
            {loading ? "Running..." : "Run reconciliation"}
          </button>

          <ul className="list">
            {results.map((item) => (
              <li key={item.recordKey} className="list-item">
                <div>
                  <p className="list-title">{item.recordKey}</p>
                  <p className="muted">
                    Mismatch ${item.mismatchAmount.toFixed(2)} • Leakage ${item.leakageAmount.toFixed(2)}
                  </p>
                </div>
                <span className={`badge ${item.severity}`}>{item.severity}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h3>Recent reconciliation history</h3>
          <ul className="list">
            {history.slice(0, 8).map((item) => (
              <li key={item.id} className="list-item">
                <div>
                  <p className="list-title">{item.record_key}</p>
                  <p className="muted">
                    Leakage ${Number(item.leakage_amount).toFixed(2)} • {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <span className={`badge ${item.severity}`}>{item.status}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid-two">
        <article className="panel">
          <h3>Interconnect tariff validation</h3>
          <div className="inline-form">
            <select className="input" value={partnerId} onChange={(event) => setPartnerId(event.target.value)}>
              <option value="">Select partner</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </select>
            <input className="input" value={routeCode} onChange={(event) => setRouteCode(event.target.value)} placeholder="Route code" />
            <input className="input" value={expectedTariff} onChange={(event) => setExpectedTariff(event.target.value)} placeholder="Expected tariff" />
            <input className="input" value={actualTariff} onChange={(event) => setActualTariff(event.target.value)} placeholder="Actual tariff" />
            <input className="input" value={minutes} onChange={(event) => setMinutes(event.target.value)} placeholder="Minutes" />
            <button className="button" type="button" onClick={() => void runInterconnectCheck()} disabled={loading || !partnerId}>
              Validate
            </button>
          </div>

          {interconnect ? (
            <div className="panel soft">
              <p className="list-title">Result: {interconnect.status}</p>
              <p className="muted">
                Variance {interconnect.variance.toFixed(4)} • Revenue impact ${interconnect.revenueImpact.toFixed(2)}
              </p>
            </div>
          ) : null}
        </article>

        <article className="panel">
          <h3>Roaming validation</h3>
          <div className="inline-form">
            <input className="input" value={subscriberId} onChange={(event) => setSubscriberId(event.target.value)} placeholder="Subscriber ID" />
            <input className="input" value={homeCountry} onChange={(event) => setHomeCountry(event.target.value)} placeholder="Home country" />
            <input className="input" value={visitedCountry} onChange={(event) => setVisitedCountry(event.target.value)} placeholder="Visited country" />
            <input className="input" value={billedAmount} onChange={(event) => setBilledAmount(event.target.value)} placeholder="Billed amount" />
            <input className="input" value={expectedAmount} onChange={(event) => setExpectedAmount(event.target.value)} placeholder="Expected amount" />
            <input className="input" value={usageMb} onChange={(event) => setUsageMb(event.target.value)} placeholder="Usage MB" />
            <button className="button" type="button" onClick={() => void runRoamingValidation()} disabled={loading}>
              Validate
            </button>
          </div>

          {roaming ? (
            <div className="panel soft">
              <p className="list-title">Result: {roaming.status}</p>
              <p className="muted">
                Deviation ${roaming.deviationAmount.toFixed(2)}
                {roaming.reason ? ` • ${roaming.reason}` : ""}
              </p>
            </div>
          ) : null}
        </article>
      </section>

      <section className="grid-two">
        <article className="panel">
          <h3>Recovery impact simulation</h3>
          <div className="inline-form">
            <input className="input" value={estimatedLoss} onChange={(event) => setEstimatedLoss(event.target.value)} placeholder="Estimated loss" />
            <input className="input" value={recoveredAmount} onChange={(event) => setRecoveredAmount(event.target.value)} placeholder="Recovered amount" />
            <button className="button" type="button" onClick={() => void runRecovery()} disabled={loading}>
              Calculate
            </button>
          </div>
          {recovery ? (
            <ul className="list compact">
              <li>Estimated loss: ${recovery.estimatedLoss.toLocaleString()}</li>
              <li>Recovered amount: ${recovery.recoveredAmount.toLocaleString()}</li>
              <li>Prevented loss: ${recovery.preventedLoss.toLocaleString()}</li>
              <li>Recovery rate: {recovery.recoveryRate.toFixed(2)}%</li>
            </ul>
          ) : null}
        </article>

        <article className="panel">
          <h3>Network anomaly monitoring</h3>
          <ul className="list">
            {networkElements.slice(0, 8).map((item) => (
              <li key={item.id} className="list-item">
                <div>
                  <p className="list-title">
                    {item.element_code} ({item.element_type})
                  </p>
                  <p className="muted">
                    Region {item.region} • impact ${Number(item.revenue_impact).toFixed(2)}
                  </p>
                </div>
                <span className="badge warning">{Number(item.anomaly_score).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
