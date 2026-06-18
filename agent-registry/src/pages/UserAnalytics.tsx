import { useMemo } from "react";
import { Users, Activity, Crown, Boxes, ShieldQuestion } from "lucide-react";
import { useData } from "../context/DataContext";
import type { AuditAction } from "../types";
import { fmtDate, lastActivityOf, RISK_CHIP, LIFECYCLE_CHIP } from "../lib/analytics";
import { PageHeader, KpiCard, SectionTitle, EmptyState } from "../components/AnalyticsUI";

const ACTION_CHIP: Record<AuditAction, string> = {
  created: "bg-emerald-50 text-emerald-700 border-emerald-200",
  updated: "bg-blue-50 text-blue-700 border-blue-200",
  promoted: "bg-violet-50 text-violet-700 border-violet-200",
  demoted: "bg-amber-50 text-amber-700 border-amber-200",
  restored: "bg-slate-50 text-slate-600 border-slate-200",
};

interface ActorRow {
  actor: string;
  eventCount: number;
  agentsModified: number;
  lastActivity: string;
  breakdown: Record<AuditAction, number>;
}

export function UserAnalytics() {
  const { agents } = useData();

  const { actors, totalEvents } = useMemo(() => {
    const map = new Map<string, ActorRow>();
    let total = 0;
    for (const a of agents) {
      for (const e of a.auditLog ?? []) {
        total++;
        let row = map.get(e.actor);
        if (!row) {
          row = { actor: e.actor, eventCount: 0, agentsModified: 0, lastActivity: "", breakdown: { created: 0, updated: 0, promoted: 0, demoted: 0, restored: 0 } };
          map.set(e.actor, row);
        }
        row.eventCount++;
        row.breakdown[e.action] = (row.breakdown[e.action] ?? 0) + 1;
        if (e.at > row.lastActivity) row.lastActivity = e.at;
      }
    }
    // agents modified per actor
    for (const [actor, row] of map) {
      const touched = new Set<string>();
      for (const a of agents) {
        if ((a.auditLog ?? []).some((e) => e.actor === actor)) touched.add(a.id);
      }
      row.agentsModified = touched.size;
    }
    const list = [...map.values()].sort((a, b) => b.eventCount - a.eventCount);
    return { actors: list, totalEvents: total };
  }, [agents]);

  const mostActive = actors[0];
  const agentsTouched = useMemo(
    () => agents.filter((a) => (a.auditLog?.length ?? 0) > 0).length,
    [agents]
  );

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      <PageHeader
        icon={Users}
        title="User-Level Analytics"
        subtitle="Invocation patterns, cost attribution, and access intelligence"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard icon={Users} label="Unique Actors" value={actors.length} tone="indigo" />
        <KpiCard icon={Activity} label="Total Audit Events" value={totalEvents} tone="emerald" />
        <KpiCard
          icon={Crown}
          label="Most Active User"
          tone="violet"
          value={
            <span className="text-base font-bold text-violet-700 break-all">
              {mostActive ? mostActive.actor : "—"}
              {mostActive && <span className="block text-[11px] font-medium text-slate-400 mt-0.5">{mostActive.eventCount} events</span>}
            </span>
          }
        />
        <KpiCard icon={Boxes} label="Agents Touched" value={agentsTouched} tone="amber" />
      </div>

      {/* Actor activity */}
      <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-5 mb-6">
        <SectionTitle icon={Users} count={actors.length}>Actor activity</SectionTitle>
        {actors.length === 0 ? (
          <EmptyState>No audit activity recorded yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-gray-100">
                  <th className="px-3 py-2 font-semibold">Actor</th>
                  <th className="px-3 py-2 font-semibold text-right">Event count</th>
                  <th className="px-3 py-2 font-semibold text-right">Agents modified</th>
                  <th className="px-3 py-2 font-semibold">Last activity</th>
                  <th className="px-3 py-2 font-semibold">Actions breakdown</th>
                  <th className="px-3 py-2 font-semibold">Risk level</th>
                </tr>
              </thead>
              <tbody>
                {actors.map((r) => {
                  const risk = r.eventCount > 40 ? "High Activity" : r.eventCount > 15 ? "Active" : "Normal";
                  const riskChip = r.eventCount > 40 ? "bg-rose-50 text-rose-700 border-rose-200" : r.eventCount > 15 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200";
                  return (
                    <tr key={r.actor} className="border-b border-gray-50 last:border-0 align-top">
                      <td className="px-3 py-3 font-medium text-slate-800 break-all">{r.actor}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-slate-700">{r.eventCount}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{r.agentsModified}</td>
                      <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.lastActivity)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(Object.keys(r.breakdown) as AuditAction[])
                            .filter((k) => r.breakdown[k] > 0)
                            .map((k) => (
                              <span key={k} className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${ACTION_CHIP[k]}`}>
                                {k} · {r.breakdown[k]}
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${riskChip}`}>{risk}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Agent ownership & access */}
      <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-5">
        <SectionTitle icon={ShieldQuestion} count={agents.length}>Agent ownership &amp; access</SectionTitle>
        {agents.length === 0 ? (
          <EmptyState>No agents registered yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-gray-100">
                  <th className="px-3 py-2 font-semibold">Agent</th>
                  <th className="px-3 py-2 font-semibold">Owner</th>
                  <th className="px-3 py-2 font-semibold">Team</th>
                  <th className="px-3 py-2 font-semibold">On-call</th>
                  <th className="px-3 py-2 font-semibold">Lifecycle</th>
                  <th className="px-3 py-2 font-semibold">Risk tier</th>
                  <th className="px-3 py-2 font-semibold">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-3">
                      <span className="font-medium text-slate-800">{a.name}</span>{" "}
                      <span className="font-mono text-[11px] text-slate-400">({a.slug})</span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{a.owner ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-3 text-slate-600">{a.team ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-3 text-slate-600">{a.oncall ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-md border ${LIFECYCLE_CHIP[a.lifecycle ?? "dev"]}`}>
                        {(a.lifecycle ?? "dev")[0].toUpperCase() + (a.lifecycle ?? "dev").slice(1)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {a.riskTier ? (
                        <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-md border ${RISK_CHIP[a.riskTier]}`}>
                          {a.riskTier}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(lastActivityOf(a))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
