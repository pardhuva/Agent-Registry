import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, RefreshCw, Loader2, ShieldX, ShieldOff, Ban, Activity, Wrench, AlertCircle, UserX, Fingerprint, Radar } from "lucide-react";
import { useData } from "../context/DataContext";
import { api } from "../lib/api";
import { policyOf, SECURITY_CONTROLS } from "../lib/security";
import type { Agent, SecurityControlId, ThreatFinding } from "../types";
import { protectionOf, fmtDate, RISK_CHIP, PROTECTION_CHIP, PROTECTION_LABEL } from "../lib/analytics";
import { PageHeader, KpiCard, SectionTitle, FilterPill, EmptyState, useSort, SortHeader } from "../components/AnalyticsUI";

const SEV_CHIP: Record<ThreatFinding["severity"], string> = {
  low: "bg-slate-100 text-slate-600 border-slate-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
};
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

interface Finding extends ThreatFinding {
  agentName: string;
  agentSlug: string;
}
interface Recommendation {
  id: string;
  text: string;
  agentId: string;
  agentSlug: string;
}

function controlLabel(id: SecurityControlId): string {
  return SECURITY_CONTROLS.find((c) => c.id === id)?.label ?? id;
}

function buildRecommendations(agents: Agent[]): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const a of agents) {
    if (!a.guardrails) recs.push({ id: `${a.id}-guard`, text: `Add guardrails to ${a.slug}`, agentId: a.id, agentSlug: a.slug });
    if (!a.accessScope?.length) recs.push({ id: `${a.id}-scope`, text: `Define access scope for ${a.slug}`, agentId: a.id, agentSlug: a.slug });
  }
  for (const a of agents) {
    for (const t of a.threats ?? []) {
      if (t.severity === "high" || t.severity === "critical")
        recs.push({ id: `${a.id}-${t.id}`, text: `Review ${controlLabel(t.control)} finding on ${a.slug}`, agentId: a.id, agentSlug: a.slug });
    }
  }
  return recs;
}

export function SecurityCenter() {
  const { agents, refreshAgents } = useData();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [findingFilter, setFindingFilter] = useState<SecurityControlId | "all">("all");
  const [offenders, setOffenders] = useState<any[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [modelTheft, setModelTheft] = useState<any | null>(null);

  const loadIntel = async () => {
    try { setOffenders((await api.analytics.repeatOffenders()).offenders ?? []); } catch { /* ignore */ }
    try { setSignatures((await api.analytics.jailbreakSignatures()).signatures ?? []); } catch { /* ignore */ }
    try { setModelTheft(await api.analytics.modelTheft()); } catch { /* ignore */ }
  };
  useEffect(() => { loadIntel(); }, [agents.length]);

  const stats = useMemo(() => {
    let critical = 0, high = 0, jailbreak = 0, unprotected = 0, noGuardrails = 0;
    for (const a of agents) {
      for (const t of a.threats ?? []) {
        if (t.severity === "critical") critical++;
        if (t.severity === "high") high++;
        if (t.control === "jailbreak") jailbreak++;
      }
      if (protectionOf(a) === "unprotected") unprotected++;
      if (!a.guardrails) noGuardrails++;
    }
    return { critical, high, jailbreak, unprotected, noGuardrails };
  }, [agents]);

  const findings = useMemo<Finding[]>(
    () =>
      agents
        .flatMap((a) => (a.threats ?? []).map((t) => ({ ...t, agentName: a.name, agentSlug: a.slug })))
        .sort((x, y) => SEV_ORDER[x.severity] - SEV_ORDER[y.severity]),
    [agents]
  );

  const controlCounts = useMemo(() => {
    const c: Record<string, number> = { all: findings.length };
    for (const f of findings) c[f.control] = (c[f.control] ?? 0) + 1;
    return c;
  }, [findings]);

  const presentControls = useMemo(
    () => SECURITY_CONTROLS.filter((c) => (controlCounts[c.id] ?? 0) > 0).map((c) => c.id),
    [controlCounts]
  );

  const filteredFindings = findings.filter((f) => findingFilter === "all" || f.control === findingFilter);
  const recommendations = useMemo(() => buildRecommendations(agents), [agents]);

  const SEV_RANK: Record<ThreatFinding["severity"], number> = { critical: 3, high: 2, medium: 1, low: 0 };
  const { sorted: sortedFindings, key: fKey, dir: fDir, toggle: fToggle } = useSort<Finding>(
    filteredFindings, "severity", "desc",
    (f, k) => {
      switch (k) {
        case "severity": return SEV_RANK[f.severity];
        case "control": return controlLabel(f.control);
        case "agent": return f.agentSlug;
        default: return f.detectedAt;
      }
    }
  );

  const handleScan = async () => {
    setScanning(true);
    try {
      await api.threats.scan(true);
      await refreshAgents();
      await loadIntel();
    } catch {
      // ignore
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      <PageHeader
        icon={ShieldAlert}
        title="Security Center"
        subtitle="Jailbreak detection, model theft analysis, PII risks, and policy enforcement"
        action={
          <button onClick={handleScan} disabled={scanning} className="flex items-center gap-1.5 text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-50">
            {scanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {scanning ? "Scanning…" : "Rescan"}
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard icon={Ban} label="Critical Threats" value={stats.critical} tone={stats.critical ? "rose" : "slate"} highlight={stats.critical > 0} />
        <KpiCard icon={ShieldX} label="High Threats" value={stats.high} tone={stats.high ? "amber" : "slate"} highlight={stats.high > 0} />
        <KpiCard icon={ShieldOff} label="Unprotected Agents" value={stats.unprotected} tone={stats.unprotected ? "amber" : "slate"} highlight={stats.unprotected > 0} />
        <KpiCard icon={ShieldAlert} label="Without Guardrails" value={stats.noGuardrails} tone={stats.noGuardrails ? "amber" : "slate"} highlight={stats.noGuardrails > 0} />
        <KpiCard icon={Activity} label="Jailbreak Findings" value={stats.jailbreak} tone={stats.jailbreak ? "rose" : "slate"} />
      </div>

      {/* Fleet intelligence — the cross-agent view no single tool has */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* Repeat offenders (S3) */}
        <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-5">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-1">
            <UserX size={15} className="text-rose-600" /> Repeat offenders
          </h3>
          <p className="text-[11px] text-slate-400 mb-3">One principal correlated across agents &amp; sessions.</p>
          {offenders.length === 0 ? (
            <p className="text-xs text-slate-500">No correlated offenders yet. Run a scan over real traffic.</p>
          ) : (
            <ul className="space-y-2">
              {offenders.slice(0, 5).map((o) => (
                <li key={o.principal} className={`rounded-lg border p-2.5 ${o.escalate ? "border-rose-200 bg-rose-50" : "border-gray-200"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-700 truncate">{o.principal}</span>
                    {o.escalate && <span className="text-[10px] font-semibold text-rose-700 uppercase">escalate</span>}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {o.attempts} attempt{o.attempts === 1 ? "" : "s"} · {o.agentsTargeted} agent{o.agentsTargeted === 1 ? "" : "s"} · max {o.maxSeverity}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Shared jailbreak signatures (S3) */}
        <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-5">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-1">
            <Fingerprint size={15} className="text-violet-600" /> Shared jailbreak signatures
          </h3>
          <p className="text-[11px] text-slate-400 mb-3">Seen once → distributed to the whole fleet.</p>
          {signatures.length === 0 ? (
            <p className="text-xs text-slate-500">No jailbreak signatures captured yet.</p>
          ) : (
            <ul className="space-y-2">
              {signatures.slice(0, 5).map((s, i) => (
                <li key={i} className="rounded-lg border border-violet-200 bg-violet-50 p-2.5">
                  <p className="font-mono text-[11px] text-violet-800 truncate">“{s.signature}”</p>
                  <p className="text-[11px] text-violet-600 mt-0.5">seen {s.seenCount}× · {s.agentsAffected} agent(s) · fleet-immunised</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Model-theft signals (S2) */}
        <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-5">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-1">
            <Radar size={15} className="text-orange-600" /> Model-theft signals
          </h3>
          <p className="text-[11px] text-slate-400 mb-3">Per-principal volume / enumeration anomalies.</p>
          {!modelTheft || modelTheft.degraded ? (
            <p className="text-xs text-slate-500">
              {modelTheft?.reason === "no_langfuse_connected" ? "Connect Langfuse for query-volume telemetry." : "No anomalies detected over telemetry."}
            </p>
          ) : modelTheft.signals.length === 0 ? (
            <p className="text-xs text-slate-500">No extraction anomalies across {modelTheft.totalQueries} queries.</p>
          ) : (
            <ul className="space-y-2">
              {modelTheft.signals.slice(0, 5).map((s: any, i: number) => (
                <li key={i} className={`rounded-lg border p-2.5 ${s.risk === "high" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-slate-700 truncate">{s.principal}</span>
                    <span className="text-[10px] font-semibold uppercase">{s.anomalyScore}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{s.queries} queries · {s.breadth} targets · {s.pattern}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <SectionTitle icon={ShieldAlert} count={agents.length}>Security status by agent</SectionTitle>
      {agents.length === 0 ? (
        <EmptyState>No agents registered yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {agents.map((a) => {
            const p = policyOf(a);
            const prot = protectionOf(a);
            const threats = a.threats?.length ?? 0;
            const accent = threats > 0 ? "border-l-rose-400" : prot === "protected" ? "border-l-emerald-400" : "border-l-amber-300";
            return (
              <div key={a.id} className={`bg-white border border-gray-200/80 border-l-4 ${accent} rounded-2xl shadow-card p-4`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold text-slate-800">{a.name}</h3>
                  {a.riskTier && <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${RISK_CHIP[a.riskTier]}`}>{a.riskTier} risk</span>}
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${PROTECTION_CHIP[prot]}`}>{PROTECTION_LABEL[prot]}</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${threats ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                    {threats} threat{threats === 1 ? "" : "s"}
                  </span>
                </div>
                <dl className="space-y-1.5 text-xs">
                  <Row label="Guardrails" value={a.guardrails ? <span className="text-emerald-600 font-semibold">✓</span> : <span className="text-slate-400 font-semibold">✗</span>} />
                  <Row label="Access scope" value={<span className="text-slate-600 tabular-nums">{a.accessScope?.length ?? 0}</span>} />
                  <Row label="Firewall" value={p.firewall.enabled ? <span className="text-emerald-600 font-semibold">Enabled</span> : <span className="text-slate-400">Disabled</span>} />
                </dl>
              </div>
            );
          })}
        </div>
      )}

      {/* Threat findings */}
      <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-5 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <SectionTitle icon={Activity} count={findings.length}>Threat findings</SectionTitle>
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterPill active={findingFilter === "all"} onClick={() => setFindingFilter("all")}>All {findings.length}</FilterPill>
            {presentControls.map((id) => (
              <FilterPill key={id} active={findingFilter === id} onClick={() => setFindingFilter(id)}>
                {controlLabel(id)} {controlCounts[id]}
              </FilterPill>
            ))}
          </div>
        </div>
        {filteredFindings.length === 0 ? (
          <EmptyState>No threat findings. Run a rescan or enable controls to populate this list.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-gray-100">
                  <SortHeader label="Severity" sortKey="severity" activeKey={fKey} dir={fDir} onSort={fToggle} />
                  <SortHeader label="Control" sortKey="control" activeKey={fKey} dir={fDir} onSort={fToggle} />
                  <SortHeader label="Agent" sortKey="agent" activeKey={fKey} dir={fDir} onSort={fToggle} />
                  <th className="px-3 py-2 font-semibold">Summary</th>
                  <SortHeader label="Detected at" sortKey="detectedAt" activeKey={fKey} dir={fDir} onSort={fToggle} />
                  <th className="px-3 py-2 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {sortedFindings.map((f) => (
                  <tr key={f.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-3">
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md border ${SEV_CHIP[f.severity]}`}>{f.severity}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{controlLabel(f.control)}</td>
                    <td className="px-3 py-3">
                      <button onClick={() => navigate(`/agents/${f.agentId}`)} className="font-mono text-[12px] text-indigo-600 hover:underline">{f.agentSlug}</button>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{f.summary}</td>
                    <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(f.detectedAt)}</td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => navigate(`/agents/${f.agentId}`)} className="text-xs font-medium text-indigo-600 hover:underline">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-3">
          Findings reflect the latest registry scan. Connect Langfuse / LangSmith for live data on per-call jailbreak, PII, and model-theft telemetry.
        </p>
      </div>

      {/* Security recommendations */}
      <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-5">
        <SectionTitle icon={Wrench} count={recommendations.length}>Security recommendations</SectionTitle>
        {recommendations.length === 0 ? (
          <EmptyState>No outstanding recommendations — every agent has guardrails, scope, and no high-severity findings.</EmptyState>
        ) : (
          <div className="space-y-2.5">
            {recommendations.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/agents/${r.agentId}`)}
                className="w-full flex items-center gap-3 bg-amber-50/60 border-l-4 border-l-amber-400 border border-amber-200/60 rounded-xl p-3.5 text-left hover:bg-amber-50"
              >
                <AlertCircle size={15} className="text-amber-500 shrink-0" />
                <span className="text-sm font-medium text-slate-700">{r.text}</span>
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1.5">
          <AlertCircle size={12} /> Metrics derived from registry policy and scan data — not live runtime telemetry.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
