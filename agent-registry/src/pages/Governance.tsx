import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, Copy, ShieldCheck, FileWarning, ScanSearch } from "lucide-react";
import { useData } from "../context/DataContext";
import type { Agent } from "../types";
import { stageOf, LIFECYCLE_LABEL, LIFECYCLE_STYLE } from "../lib/lifecycle";
import { duplicateGroups } from "../lib/duplicates";

// Heuristic: an agent is "over-privileged" if its access scope count is greater than
// what its declared dependencies plausibly justify.
function overPrivilegeScore(a: Agent): { flagged: boolean; reason: string } {
  const scope = a.accessScope ?? [];
  if (!scope.length) return { flagged: false, reason: "" };
  const declaredSurface =
    (a.dependencies?.tools.length ?? 0) +
    (a.dependencies?.dataSources.length ?? 0);
  const writeScopes = scope.filter((s) => /:(write|admin|delete)/i.test(s));
  if (writeScopes.length && stageOf(a) === "prod" && !a.guardrails) {
    return { flagged: true, reason: "Holds write scopes in prod with no guardrails declared." };
  }
  if (scope.length > Math.max(2, declaredSurface) + 2) {
    return { flagged: true, reason: `Holds ${scope.length} scopes but declares only ${declaredSurface} tool/data dependencies.` };
  }
  return { flagged: false, reason: "" };
}


export function Governance() {
  const { agents } = useData();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const totals = { all: agents.length, prod: 0, unowned: 0, unscoped: 0, soc2: 0, highRisk: 0 };
    for (const a of agents) {
      if (stageOf(a) === "prod") totals.prod++;
      if (!a.owner || !a.team) totals.unowned++;
      if (!a.accessScope?.length) totals.unscoped++;
      if (a.compliance?.soc2Scope) totals.soc2++;
      if (a.compliance?.euAiActTier === "high" || a.compliance?.euAiActTier === "unacceptable") totals.highRisk++;
    }
    return totals;
  }, [agents]);

  const overPrivileged = useMemo(
    () => agents.map((a) => ({ a, flag: overPrivilegeScore(a) })).filter((x) => x.flag.flagged),
    [agents]
  );
  const duplicates = useMemo(() => duplicateGroups(agents), [agents]);
  const unowned = useMemo(() => agents.filter((a) => !a.owner || !a.team), [agents]);

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={22} />
          Governance
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          The control plane — discover sprawl, surface over-privilege, audit compliance.
        </p>
      </div>

      {/* Stat callouts */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Stat label="Registered" value={stats.all} />
        <Stat label="In production" value={stats.prod} tone="emerald" />
        <Stat label="Unowned" value={stats.unowned} tone={stats.unowned ? "amber" : "gray"} />
        <Stat label="No access scope" value={stats.unscoped} tone={stats.unscoped ? "amber" : "gray"} />
        <Stat label="SOC 2 scope" value={stats.soc2} />
        <Stat label="EU AI Act high-risk" value={stats.highRisk} tone={stats.highRisk ? "rose" : "gray"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Over-privilege */}
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <ShieldAlert size={15} className="text-rose-600" />
            Over-privilege flags
          </h2>
          {overPrivileged.length === 0 ? (
            <p className="text-sm text-gray-500">No over-privilege flags. Agents hold scopes consistent with their declared dependencies.</p>
          ) : (
            <ul className="space-y-2">
              {overPrivileged.map(({ a, flag }) => (
                <li key={a.id} className="border border-rose-200 bg-rose-50 rounded-lg p-3">
                  <button
                    onClick={() => navigate(`/agents/${a.id}`)}
                    className="text-sm font-semibold text-rose-900 hover:underline"
                  >
                    {a.name} <span className="font-mono text-xs text-rose-700">({a.slug})</span>
                  </button>
                  <p className="text-xs text-rose-800 mt-1">{flag.reason}</p>
                  {a.accessScope?.length ? (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {a.accessScope.map((s) => (
                        <span key={s} className="text-[11px] font-mono bg-white border border-rose-300 text-rose-700 px-1.5 py-0.5 rounded">{s}</span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Duplicates */}
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Copy size={15} className="text-amber-600" />
            Duplicate detection
          </h2>
          {duplicates.length === 0 ? (
            <p className="text-sm text-gray-500">No likely duplicates. Capability statements are unique across the registry.</p>
          ) : (
            <ul className="space-y-2">
              {duplicates.map((g) => (
                <li key={g.key} className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                  <p className="text-xs text-amber-800 mb-1.5">Same capability: <em>“{g.key}…”</em></p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.agents.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => navigate(`/agents/${a.id}`)}
                        className="text-xs font-mono bg-white border border-amber-300 text-amber-800 px-2 py-0.5 rounded hover:bg-amber-100"
                      >
                        {a.slug} <span className="opacity-60">· {a.team || "no team"}</span>
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Unowned */}
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <ScanSearch size={15} className="text-amber-600" />
            Missing ownership
          </h2>
          {unowned.length === 0 ? (
            <p className="text-sm text-gray-500">Every agent has an owner and a team.</p>
          ) : (
            <ul className="space-y-1.5">
              {unowned.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2">
                  <button onClick={() => navigate(`/agents/${a.id}`)} className="text-sm text-gray-800 hover:underline truncate">
                    {a.name} <span className="font-mono text-xs text-gray-500">({a.slug})</span>
                  </button>
                  <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${LIFECYCLE_STYLE[stageOf(a)]}`}>
                    {LIFECYCLE_LABEL[stageOf(a)]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Compliance summary */}
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <FileWarning size={15} className="text-blue-600" />
            Compliance overview
          </h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left py-1.5">Agent</th>
                <th className="text-left">Data class</th>
                <th className="text-left">EU AI Act</th>
                <th className="text-left">SOC 2</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-center text-gray-500">No agents yet.</td></tr>
              ) : agents.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="py-1.5">
                    <button onClick={() => navigate(`/agents/${a.id}`)} className="text-gray-800 hover:underline">{a.name}</button>
                  </td>
                  <td className="text-gray-700">{a.compliance?.dataClassification ?? "—"}</td>
                  <td className="text-gray-700">{a.compliance?.euAiActTier ?? "—"}</td>
                  <td className="text-gray-700">{a.compliance?.soc2Scope ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "gray" }: { label: string; value: number; tone?: "gray" | "emerald" | "amber" | "rose" }) {
  const toneCls: Record<string, string> = {
    gray: "bg-white border-gray-200 text-gray-900",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    rose: "bg-rose-50 border-rose-200 text-rose-900",
  };
  return (
    <div className={`border rounded-xl px-4 py-3 ${toneCls[tone]}`}>
      <div className="text-[11px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
