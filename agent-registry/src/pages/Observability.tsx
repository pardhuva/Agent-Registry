import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, Boxes, ShieldCheck, AlertTriangle, Rocket, Search, BarChart3,
  Layers, Zap, ChevronRight,
} from "lucide-react";
import { useData } from "../context/DataContext";
import type { LifecycleStage } from "../types";
import {
  protectionOf, lastActivityOf, depCount, fmtDate,
  RISK_CHIP, LIFECYCLE_CHIP, PROTECTION_CHIP, PROTECTION_LABEL,
} from "../lib/analytics";
import { PageHeader, KpiCard, FilterPill, SectionTitle, useSort, SortHeader } from "../components/AnalyticsUI";

const LIFECYCLES: (LifecycleStage | "all")[] = ["all", "dev", "staging", "prod", "deprecated"];

const RISK_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

export function Observability() {
  const { agents, langfuseInstances, langsmithInstances, heliconeInstances } = useData();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [lifecycle, setLifecycle] = useState<LifecycleStage | "all">("all");

  const stats = useMemo(() => {
    const total = agents.length;
    const prot = agents.filter((a) => protectionOf(a) === "protected").length;
    const withThreats = agents.filter((a) => (a.threats?.length ?? 0) > 0).length;
    const inProd = agents.filter((a) => a.lifecycle === "prod").length;
    return { total, prot, withThreats, inProd };
  }, [agents]);

  const filtered = useMemo(() => {
    return agents
      .filter((a) => lifecycle === "all" || a.lifecycle === lifecycle)
      .filter((a) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q);
      })
      .sort((a, b) => lastActivityOf(b).localeCompare(lastActivityOf(a)));
  }, [agents, lifecycle, query]);

  const { sorted, key: sortKey, dir, toggle } = useSort(
    filtered, "lastActivity", "desc",
    (a, k) => {
      switch (k) {
        case "name": return a.name.toLowerCase();
        case "lifecycle": return a.lifecycle ?? "dev";
        case "protection": return protectionOf(a);
        case "risk": return a.riskTier ? RISK_RANK[a.riskTier] : 0;
        case "audit": return a.auditLog?.length ?? 0;
        case "deps": return depCount(a);
        case "threats": return a.threats?.length ?? 0;
        default: return lastActivityOf(a);
      }
    }
  );

  const liveConnected = langfuseInstances.length + langsmithInstances.length + heliconeInstances.length > 0;

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      <PageHeader
        icon={Activity}
        title="Live Agent Observability"
        subtitle="Track every agent invocation, health, and telemetry."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard icon={Boxes} label="Total Agents" value={stats.total} tone="indigo" />
        <KpiCard icon={ShieldCheck} label="Protected" value={stats.prot} tone="emerald" />
        <KpiCard icon={AlertTriangle} label="With Threats" value={stats.withThreats} tone={stats.withThreats ? "rose" : "slate"} />
        <KpiCard icon={Rocket} label="In Production" value={stats.inProd} tone="indigo" />
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or slug…"
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        {LIFECYCLES.map((l) => (
          <FilterPill key={l} active={lifecycle === l} onClick={() => setLifecycle(l)}>
            {l === "all" ? "All" : l[0].toUpperCase() + l.slice(1)}
          </FilterPill>
        ))}
      </div>

      <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-gray-100">
                <SortHeader label="Agent name" sortKey="name" activeKey={sortKey} dir={dir} onSort={toggle} pad="px-4 py-3" />
                <th className="px-4 py-3 font-semibold">Slug</th>
                <SortHeader label="Lifecycle" sortKey="lifecycle" activeKey={sortKey} dir={dir} onSort={toggle} pad="px-4 py-3" />
                <SortHeader label="Protection" sortKey="protection" activeKey={sortKey} dir={dir} onSort={toggle} pad="px-4 py-3" />
                <SortHeader label="Risk tier" sortKey="risk" activeKey={sortKey} dir={dir} onSort={toggle} pad="px-4 py-3" />
                <SortHeader label="Audit events" sortKey="audit" activeKey={sortKey} dir={dir} onSort={toggle} align="right" pad="px-4 py-3" />
                <SortHeader label="Last activity" sortKey="lastActivity" activeKey={sortKey} dir={dir} onSort={toggle} pad="px-4 py-3" />
                <SortHeader label="Deps" sortKey="deps" activeKey={sortKey} dir={dir} onSort={toggle} align="right" pad="px-4 py-3" />
                <SortHeader label="Threats" sortKey="threats" activeKey={sortKey} dir={dir} onSort={toggle} align="right" pad="px-4 py-3" />
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => {
                const prot = protectionOf(a);
                const threats = a.threats?.length ?? 0;
                return (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold text-slate-800">{a.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.slug}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-md border ${LIFECYCLE_CHIP[a.lifecycle ?? "dev"]}`}>
                        {(a.lifecycle ?? "dev")[0].toUpperCase() + (a.lifecycle ?? "dev").slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-md border ${PROTECTION_CHIP[prot]}`}>
                        {PROTECTION_LABEL[prot]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {a.riskTier ? (
                        <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-md border ${RISK_CHIP[a.riskTier]}`}>
                          {a.riskTier[0].toUpperCase() + a.riskTier.slice(1)}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{a.auditLog?.length ?? 0}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(lastActivityOf(a))}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{depCount(a)}</td>
                    <td className="px-4 py-3 text-right">
                      {threats > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-rose-100 text-rose-700 text-[11px] font-bold px-1.5">
                          {threats}
                        </span>
                      ) : <span className="text-slate-400 tabular-nums">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => navigate(`/agents/${a.id}`)}
                        className="text-xs font-medium border border-gray-200 rounded-lg px-3 py-1 hover:bg-slate-50 hover:border-indigo-200 text-slate-600"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500">
                    No agents match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live telemetry */}
      <SectionTitle icon={BarChart3}>Live telemetry</SectionTitle>
      <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-6">
        <div className="flex items-start gap-3 mb-5">
          <span className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <BarChart3 size={20} className="text-indigo-500" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {liveConnected ? "Telemetry providers connected" : "Connect Langfuse, LangSmith, or Helicone for live data"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {liveConnected
                ? "Open a provider to view traces, runs, and gateway metrics."
                : "No live telemetry is wired into the registry data model. Connect a provider to unlock:"}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {["Request counts", "Success/failure rates", "Average latency", "Token usage", "Cost per agent", "Active user sessions"].map((c) => (
                <span key={c} className="text-[11px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-gray-100">
          {[
            { to: "/langfuse", icon: Layers, name: "Langfuse", desc: "Tracing & evals", n: langfuseInstances.length },
            { to: "/langsmith", icon: Zap, name: "LangSmith", desc: "Runs & datasets", n: langsmithInstances.length },
            { to: "/helicone", icon: Activity, name: "Helicone", desc: "Gateway metrics", n: heliconeInstances.length },
          ].map((p) => (
            <button
              key={p.to}
              onClick={() => navigate(p.to)}
              className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl p-4 hover:border-indigo-200 hover:bg-slate-50/60 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                  <p.icon size={18} className="text-slate-600" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.desc}{p.n > 0 ? ` · ${p.n} connected` : ""}</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
