import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GitMerge, ArrowRight, ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useData } from "../context/DataContext";
import type { Agent, LifecycleStage } from "../types";
import {
  LIFECYCLE_ORDER, LIFECYCLE_STYLE, LIFECYCLE_LABEL,
  stageOf, nextStage, prevStage, checkPromotion,
} from "../lib/lifecycle";

const COL_HINT: Record<LifecycleStage, string> = {
  dev: "Anything in flight. No gating yet.",
  staging: "Pre-prod validation. Owner + capability required.",
  prod: "Live agents. Promotion fully gated.",
  deprecated: "Retired. Dependents should be notified before delete.",
};

function AgentMini({ agent, onMove }: { agent: Agent; onMove: (target: LifecycleStage) => void }) {
  const navigate = useNavigate();
  const stage = stageOf(agent);
  const next = nextStage(stage);
  const prev = prevStage(stage);
  const check = next ? checkPromotion(agent, next) : null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <button
          onClick={() => navigate(`/agents/${agent.id}`)}
          className="text-sm font-semibold text-gray-900 hover:underline text-left min-w-0 truncate"
        >
          {agent.name}
        </button>
        {agent.version && <span className="text-[10px] font-mono text-gray-500 shrink-0">v{agent.version}</span>}
      </div>
      <p className="text-xs font-mono text-gray-500 mb-1.5 truncate">{agent.slug}</p>
      {agent.team && <p className="text-xs text-gray-600 mb-2 truncate">{agent.team}</p>}

      {check && !check.ok && next && (
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1 mb-2 flex items-start gap-1">
          <AlertTriangle size={10} className="mt-0.5 shrink-0" />
          <span className="break-words">Missing: {check.missing.slice(0, 3).join(", ")}{check.missing.length > 3 ? "…" : ""}</span>
        </div>
      )}
      {check?.ok && next && (
        <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-1 mb-2 flex items-center gap-1">
          <CheckCircle2 size={10} /> Ready to promote
        </div>
      )}

      <div className="flex items-center gap-1">
        {prev && (
          <button
            onClick={() => onMove(prev)}
            className="text-[11px] flex items-center gap-1 px-1.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
            title={`Move to ${LIFECYCLE_LABEL[prev]}`}
          >
            <ArrowLeft size={10} />
            {LIFECYCLE_LABEL[prev]}
          </button>
        )}
        {next && (
          <button
            onClick={() => onMove(next)}
            disabled={!check?.ok}
            className={`text-[11px] flex items-center gap-1 px-1.5 py-1 rounded font-medium ml-auto ${
              check?.ok
                ? "bg-gray-900 text-white hover:bg-gray-800"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
            title={check?.ok ? `Promote to ${LIFECYCLE_LABEL[next]}` : `Missing: ${check?.missing.join(", ")}`}
          >
            {LIFECYCLE_LABEL[next]}
            <ArrowRight size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

export function Lifecycle() {
  const { agents, updateAgent } = useData();

  const grouped = useMemo(() => {
    const g: Record<LifecycleStage, Agent[]> = { dev: [], staging: [], prod: [], deprecated: [] };
    for (const a of agents) g[stageOf(a)].push(a);
    return g;
  }, [agents]);

  async function move(a: Agent, target: LifecycleStage) {
    const isPromotion = LIFECYCLE_ORDER.indexOf(target) > LIFECYCLE_ORDER.indexOf(stageOf(a));
    if (isPromotion) {
      const check = checkPromotion(a, target);
      if (!check.ok) {
        alert(`Cannot promote — missing: ${check.missing.join(", ")}`);
        return;
      }
    }
    await updateAgent(a.id, {
      lifecycle: target,
      approvedBy: isPromotion ? "you@local" : a.approvedBy,
      approvedAt: isPromotion ? new Date().toISOString() : a.approvedAt,
    });
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <GitMerge size={22} />
          Lifecycle
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Dev → Staging → Prod → Deprecated. Each promotion is a gated checkpoint, not an unmonitored push.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {LIFECYCLE_ORDER.map((stage) => (
          <div key={stage} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className={`text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${LIFECYCLE_STYLE[stage]}`}>
                {LIFECYCLE_LABEL[stage]}
              </span>
              <span className="text-xs text-gray-500">{grouped[stage].length}</span>
            </div>
            <p className="text-[11px] text-gray-500 px-1 mb-3">{COL_HINT[stage]}</p>
            <div className="space-y-2 min-h-[60px]">
              {grouped[stage].length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No agents</p>
              ) : (
                grouped[stage].map((a) => (
                  <AgentMini key={a.id} agent={a} onMove={(t) => move(a, t)} />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
