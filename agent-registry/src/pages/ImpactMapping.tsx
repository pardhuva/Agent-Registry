import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Network, AlertTriangle, ShieldAlert, GitFork, Users, ArrowUpDown, Layers3 } from "lucide-react";
import { useData } from "../context/DataContext";
import type { Agent, LifecycleStage } from "../types";
import { policyOf } from "../lib/security";
import { depCount, depList, protectionOf, PROTECTION_LABEL } from "../lib/analytics";
import { PageHeader, KpiCard, SectionTitle, EmptyState, useSort, SortHeader } from "../components/AnalyticsUI";

type ImpactTier = "critical" | "high" | "medium" | "low";

const LC_RISK: Record<LifecycleStage, number> = { dev: 20, staging: 12, prod: 6, deprecated: 16 };

const TIER_META: Record<ImpactTier, { label: string; chip: string; head: string; bar: string }> = {
  critical: { label: "Critical", chip: "bg-rose-50 text-rose-700 border-rose-200", head: "border-t-rose-400", bar: "bg-rose-500" },
  high: { label: "High", chip: "bg-orange-50 text-orange-700 border-orange-200", head: "border-t-orange-400", bar: "bg-orange-500" },
  medium: { label: "Medium", chip: "bg-amber-50 text-amber-700 border-amber-200", head: "border-t-amber-400", bar: "bg-amber-500" },
  low: { label: "Low", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", head: "border-t-emerald-400", bar: "bg-emerald-500" },
};

interface Metrics {
  agent: Agent;
  deps: number;
  callers: Agent[];
  lifecycleRisk: number;
  securityRisk: number;
  threats: number;
  overall: number;
  tier: ImpactTier;
  auditActivity: number;
}

function securityRisk(a: Agent): number {
  const prot = protectionOf(a);
  let s = prot === "unprotected" ? 20 : prot === "awaiting_event" ? 10 : 0;
  const exposed = depCount(a) > 0 && !policyOf(a).firewall.enabled;
  if (prot !== "protected" && exposed) s += 10;
  return s;
}

function tierOf(score: number): ImpactTier {
  if (score >= 80) return "critical";
  if (score >= 50) return "high";
  if (score >= 20) return "medium";
  return "low";
}

export function ImpactMapping() {
  const { agents } = useData();
  const navigate = useNavigate();

  const metrics = useMemo<Metrics[]>(() => {
    const callersOf = (target: Agent) =>
      agents.filter((a) =>
        a.id !== target.id &&
        depList(a).agents.some(
          (dep) => dep === target.slug || dep === target.name || dep.toLowerCase() === target.name.toLowerCase()
        )
      );
    return agents
      .map((a) => {
        const deps = depCount(a);
        const callers = callersOf(a);
        const lifecycleRisk = LC_RISK[a.lifecycle ?? "dev"];
        const secRisk = securityRisk(a);
        const threats = a.threats?.length ?? 0;
        const overall = Math.min(100, deps * 4 + callers.length * 10 + lifecycleRisk + secRisk + threats * 6);
        return {
          agent: a, deps, callers, lifecycleRisk, securityRisk: secRisk, threats,
          overall, tier: tierOf(overall), auditActivity: a.auditLog?.length ?? 0,
        };
      })
      .sort((x, y) => y.overall - x.overall);
  }, [agents]);

  const totalEdges = useMemo(() => agents.reduce((s, a) => s + depCount(a), 0), [agents]);
  const critical = metrics.filter((m) => m.tier === "critical").length;
  const high = metrics.filter((m) => m.tier === "high").length;
  const mostDepended = useMemo(
    () => [...metrics].sort((x, y) => y.callers.length - x.callers.length)[0],
    [metrics]
  );
  const chains = useMemo(
    () => metrics.filter((m) => m.callers.length > 0 && (m.agent.lifecycle === "dev" || m.agent.lifecycle === "staging")),
    [metrics]
  );

  const byTier = (t: ImpactTier) => metrics.filter((m) => m.tier === t);

  const { sorted, key: sortKey, dir, toggle } = useSort<Metrics>(
    metrics, "overall", "desc",
    (m, k) => {
      switch (k) {
        case "name": return m.agent.name.toLowerCase();
        case "deps": return m.deps;
        case "callers": return m.callers.length;
        case "lifecycleRisk": return m.lifecycleRisk;
        case "securityRisk": return m.securityRisk;
        case "threats": return m.threats;
        case "auditActivity": return m.auditActivity;
        default: return m.overall;
      }
    }
  );

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      <PageHeader
        icon={Network}
        title="Impact Mapping"
        subtitle="Business and technical impact analysis for every agent, tool, model, and dependency"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard icon={AlertTriangle} label="Critical Impact Agents" value={critical} tone={critical ? "rose" : "slate"} highlight={critical > 0} />
        <KpiCard icon={ShieldAlert} label="High Impact Agents" value={high} tone={high ? "amber" : "slate"} highlight={high > 0} />
        <KpiCard icon={GitFork} label="Total Dependency Edges" value={totalEdges} tone="indigo" />
        <KpiCard
          icon={Users}
          label="Most Depended Upon"
          tone="violet"
          value={mostDepended && mostDepended.callers.length > 0
            ? <span className="text-base font-bold font-mono">{mostDepended.agent.slug}<span className="block text-[11px] font-medium text-slate-400 mt-0.5">{mostDepended.callers.length} callers</span></span>
            : "—"}
        />
      </div>

      <div className="bg-indigo-50/60 border border-indigo-200/60 rounded-2xl p-3.5 mb-6 flex items-start gap-2.5">
        <Network size={15} className="text-indigo-500 mt-0.5 shrink-0" />
        <p className="text-xs text-indigo-700 leading-relaxed">
          Scores are derived from the agent registry (dependencies, lifecycle, threats, audit log). Connect Langfuse / LangSmith for live invocation-volume and latency-weighted impact.
        </p>
      </div>

      {/* Impact analysis table */}
      <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-5 mb-6">
        <SectionTitle icon={ArrowUpDown} count={metrics.length}>Impact analysis</SectionTitle>
        {metrics.length === 0 ? (
          <EmptyState>No agents registered yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-gray-100">
                  <SortHeader label="Agent" sortKey="name" activeKey={sortKey} dir={dir} onSort={toggle} />
                  <SortHeader label="Impact tier" sortKey="overall" activeKey={sortKey} dir={dir} onSort={toggle} />
                  <SortHeader label="Dependency impact" sortKey="deps" activeKey={sortKey} dir={dir} onSort={toggle} align="right" />
                  <SortHeader label="Caller impact" sortKey="callers" activeKey={sortKey} dir={dir} onSort={toggle} align="right" />
                  <SortHeader label="Lifecycle risk" sortKey="lifecycleRisk" activeKey={sortKey} dir={dir} onSort={toggle} />
                  <SortHeader label="Security risk" sortKey="securityRisk" activeKey={sortKey} dir={dir} onSort={toggle} />
                  <SortHeader label="Threats" sortKey="threats" activeKey={sortKey} dir={dir} onSort={toggle} align="right" />
                  <SortHeader label="Overall score" sortKey="overall" activeKey={sortKey} dir={dir} onSort={toggle} align="right" />
                  <SortHeader label="Audit activity" sortKey="auditActivity" activeKey={sortKey} dir={dir} onSort={toggle} align="right" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr key={m.agent.id} className="border-b border-gray-50 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={() => navigate(`/agents/${m.agent.id}`)}>
                    <td className="px-3 py-3">
                      <span className="font-medium text-slate-800">{m.agent.name}</span>{" "}
                      <span className="font-mono text-[11px] text-slate-400">({m.agent.slug})</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md border ${TIER_META[m.tier].chip}`}>
                        {TIER_META[m.tier].label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">{m.deps}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">{m.callers.length}</td>
                    <td className="px-3 py-3 text-xs text-slate-500"><span className="font-bold text-slate-700 tabular-nums">{m.lifecycleRisk}</span> · {m.agent.lifecycle ?? "dev"}</td>
                    <td className="px-3 py-3 text-xs"><span className={`font-bold tabular-nums ${m.securityRisk >= 20 ? "text-rose-600" : "text-slate-700"}`}>{m.securityRisk}</span> <span className="text-slate-500">· {PROTECTION_LABEL[protectionOf(m.agent)].toLowerCase()}</span></td>
                    <td className="px-3 py-3 text-right">
                      {m.threats > 0 ? <span className="font-bold text-rose-600 tabular-nums">{m.threats}</span> : <span className="text-slate-400 tabular-nums">0</span>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-bold tabular-nums ${m.tier === "critical" ? "text-rose-600" : m.tier === "high" ? "text-orange-600" : "text-slate-700"}`}>{m.overall}</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-500">{m.auditActivity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Impact hierarchy */}
      <SectionTitle icon={Layers3}>Impact hierarchy</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {(["critical", "high", "medium", "low"] as ImpactTier[]).map((t) => {
          const list = byTier(t);
          const meta = TIER_META[t];
          return (
            <div key={t} className={`bg-white border border-gray-200/80 border-t-4 ${meta.head} rounded-2xl shadow-card p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-bold text-slate-800">{meta.label} impact</h3>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{list.length}</span>
              </div>
              {list.length === 0 ? (
                <p className="text-xs text-slate-400">None.</p>
              ) : (
                <ul className="space-y-2.5">
                  {list.map((m) => (
                    <li key={m.agent.id}>
                      <button onClick={() => navigate(`/agents/${m.agent.id}`)} className="text-left w-full hover:opacity-80">
                        <p className="text-[13px] font-semibold text-slate-700 leading-tight">{m.agent.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          score {m.overall}{m.callers.length ? ` · +${m.callers.length} caller${m.callers.length > 1 ? "s" : ""}` : ""}{m.deps ? ` · →${m.deps} deps` : ""}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Dependency chains */}
      <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-5">
        <SectionTitle icon={GitFork} count={chains.length}>Dependency chains</SectionTitle>
        {chains.length === 0 ? (
          <EmptyState>No risky dependency chains — no dev/staging agent has downstream dependents.</EmptyState>
        ) : (
          <div className="space-y-2.5">
            {chains.map((m) => (
              <div key={m.agent.id} className="bg-amber-50/60 border-l-4 border-l-amber-400 border border-amber-200/60 rounded-xl p-3.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold">{m.callers.length}</span> agent{m.callers.length > 1 ? "s" : ""} depend on{" "}
                      <span className="font-semibold">{m.agent.name}</span>{" "}
                      <span className="text-slate-500">(still in {m.agent.lifecycle ?? "dev"})</span>:
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.callers.map((c) => (
                        <button key={c.id} onClick={() => navigate(`/agents/${c.id}`)} className="text-[11px] font-mono bg-white border border-amber-200 text-amber-800 px-2 py-0.5 rounded-md hover:bg-amber-100">
                          {c.slug}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-amber-700/80 mt-2">
                      Warning: a {m.agent.lifecycle ?? "dev"}-stage agent has downstream dependents — promotion or removal will ripple to {m.callers.length} caller{m.callers.length > 1 ? "s" : ""}.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
