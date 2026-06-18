import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, Brain, AlertTriangle, ShieldOff, Activity, Target,
  GitFork, ShieldAlert, Coins, FileWarning, Wrench,
} from "lucide-react";
import { useData } from "../context/DataContext";
import type { Agent } from "../types";
import { policyOf } from "../lib/security";
import { protectionOf, depList } from "../lib/analytics";
import { PageHeader, KpiCard, EmptyState } from "../components/AnalyticsUI";

type Severity = "low" | "medium" | "high" | "critical";
type Category = "Stability" | "Security" | "Cost" | "Compliance" | "Governance";

interface Prediction {
  id: string;
  category: Category;
  severity: Severity;
  confidence: number;
  title: string;
  description: string;
  affected: Agent[];
  recommendation: string;
  source: string;
}

const SEV_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

const SEV_META: Record<Severity, { label: string; chip: string; accent: string; bar: string }> = {
  critical: { label: "Critical", chip: "bg-rose-50 text-rose-700 border-rose-200", accent: "border-l-rose-500", bar: "bg-rose-500" },
  high: { label: "High", chip: "bg-orange-50 text-orange-700 border-orange-200", accent: "border-l-orange-500", bar: "bg-orange-500" },
  medium: { label: "Medium", chip: "bg-amber-50 text-amber-700 border-amber-200", accent: "border-l-amber-400", bar: "bg-amber-500" },
  low: { label: "Low", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", accent: "border-l-emerald-400", bar: "bg-emerald-500" },
};

const CAT_META: Record<Category, { icon: typeof GitFork; chip: string }> = {
  Stability: { icon: GitFork, chip: "bg-amber-50 text-amber-700" },
  Security: { icon: ShieldAlert, chip: "bg-rose-50 text-rose-700" },
  Cost: { icon: Coins, chip: "bg-violet-50 text-violet-700" },
  Compliance: { icon: FileWarning, chip: "bg-blue-50 text-blue-700" },
  Governance: { icon: Wrench, chip: "bg-slate-100 text-slate-600" },
};

function generatePredictions(agents: Agent[]): Prediction[] {
  const preds: Prediction[] = [];
  const isDependedUpon = (t: Agent) =>
    agents.some((a) => a.id !== t.id && depList(a).agents.some(
      (d) => d === t.slug || d === t.name || d.toLowerCase() === t.name.toLowerCase()
    ));

  const devDepended = agents.filter((a) => (a.lifecycle === "dev" || a.lifecycle === "staging") && isDependedUpon(a));
  if (devDepended.length) preds.push({
    id: "dev-dependents", category: "Stability", severity: "high", confidence: 85,
    title: "Dev-Stage Agents With Many Dependents",
    description: `${devDepended.length} agent(s) are still in the dev stage yet are listed as dependencies by other agents. Downstream agents may break or behave unpredictably as these immature agents change.`,
    affected: devDepended,
    recommendation: "Either promote these agents through staging to prod with a stable contract, or decouple downstream agents from dev-stage dependencies until they are hardened.",
    source: "useData() agents — dependencies.agents & lifecycle fields",
  });

  const withThreats = agents.filter((a) => (a.threats?.length ?? 0) > 0);
  if (withThreats.length) {
    const total = withThreats.reduce((s, a) => s + (a.threats?.length ?? 0), 0);
    let maxSev: Severity = "low";
    for (const a of withThreats) for (const t of a.threats ?? []) if (SEV_RANK[t.severity] > SEV_RANK[maxSev]) maxSev = t.severity;
    preds.push({
      id: "active-threats", category: "Security", severity: maxSev, confidence: 85,
      title: "Agents With Active Threat Findings",
      description: `${withThreats.length} agent(s) carry ${total} open security threat finding(s). Highest observed severity is "${SEV_META[maxSev].label}". These represent confirmed detections, not just configuration risk.`,
      affected: withThreats,
      recommendation: "Triage the highest-severity findings first, apply the indicated guardrail or policy action, and re-scan to confirm resolution.",
      source: "useData() agents — threats[] findings (max severity)",
    });
  }

  const unprotHigh = agents.filter((a) => a.riskTier === "high" && protectionOf(a) === "unprotected");
  if (unprotHigh.length) preds.push({
    id: "unprot-high", category: "Security", severity: "high", confidence: 80,
    title: "Unprotected High-Risk Agents",
    description: `${unprotHigh.length} high-risk agent(s) have no enforcing controls enabled. A single malicious prompt could pass straight through to the model.`,
    affected: unprotHigh,
    recommendation: "Enable firewall and jailbreak blocking on these agents, then instrument them via the SDK or gateway so the controls take effect.",
    source: "useData() agents — riskTier & policy enforcement state",
  });

  const noBudget = agents.filter((a) => !policyOf(a).tokenBudget.limit && (a.lifecycle === "prod" || a.lifecycle === "staging"));
  if (noBudget.length) preds.push({
    id: "no-budget", category: "Cost", severity: "medium", confidence: 75,
    title: "Cost Overrun Risk — No Token Budget",
    description: `${noBudget.length} staging/production agent(s) run without a token budget cap. A runaway loop or prompt-injection amplification could spike spend with no automatic cutoff.`,
    affected: noBudget,
    recommendation: "Set a per-window token budget with throttle or hard-cut on breach for each of these agents.",
    source: "useData() agents — policy.tokenBudget & lifecycle",
  });

  const sensNoPii = agents.filter((a) => {
    const cls = a.compliance?.dataClassification;
    const sensitive = cls === "confidential" || cls === "restricted" || (a.dataClassifications ?? []).some((c) => c !== "public");
    return sensitive && policyOf(a).pii.classes.length === 0;
  });
  if (sensNoPii.length) preds.push({
    id: "sens-no-pii", category: "Compliance", severity: "high", confidence: 82,
    title: "Sensitive Data Without PII Policy",
    description: `${sensNoPii.length} agent(s) handle confidential or restricted data but have no PII detection/redaction policy configured. This is a data-leak and compliance exposure.`,
    affected: sensNoPii,
    recommendation: "Configure PII classes with redact or block actions, mapped to each agent's data classification for audit evidence.",
    source: "useData() agents — compliance & policy.pii",
  });

  const noGuard = agents.filter((a) => !a.guardrails);
  if (noGuard.length) preds.push({
    id: "no-guard", category: "Governance", severity: "medium", confidence: 78,
    title: "Agents Missing Guardrails",
    description: `${noGuard.length} agent(s) have no guardrail expectations declared. Without a documented contract, drift and misuse are hard to detect.`,
    affected: noGuard,
    recommendation: "Document guardrail expectations for each agent so policy and reviews have a baseline to enforce against.",
    source: "useData() agents — guardrails field",
  });

  return preds.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.confidence - a.confidence);
}

const IMPACT_LABELS = ["Low", "Medium", "High", "Critical"]; // index = impact tier 0..3
const LIKELIHOOD_LABELS = ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"];

function zoneClass(impactRow: number, col: number): string {
  const r = impactRow + col;
  if (r >= 6) return "bg-rose-100/70 border-rose-200";
  if (r >= 4) return "bg-orange-100/60 border-orange-200";
  if (r >= 2) return "bg-amber-50 border-amber-200";
  return "bg-emerald-50 border-emerald-200";
}

export function PredictiveAnalytics() {
  const { agents } = useData();
  const navigate = useNavigate();

  const predictions = useMemo(() => generatePredictions(agents), [agents]);

  const heatmap = useMemo(() => {
    const callersOf = (t: Agent) => agents.filter((a) => a.id !== t.id &&
      depList(a).agents.some((d) => d === t.slug || d === t.name || d.toLowerCase() === t.name.toLowerCase())).length;
    const impactTier = (a: Agent) => {
      const d = depList(a);
      let s = callersOf(a) * 2 + d.models.length + d.tools.length + d.dataSources.length + d.agents.length;
      s += a.lifecycle === "prod" ? 2 : a.lifecycle === "staging" ? 1 : 0;
      return s >= 6 ? 3 : s >= 4 ? 2 : s >= 2 ? 1 : 0;
    };
    const likelihood = (a: Agent) => {
      let s = 0;
      if ((a.threats?.length ?? 0) > 0) s += 2;
      if (protectionOf(a) === "unprotected") s += 1;
      if (!a.guardrails) s += 1;
      const cls = a.compliance?.dataClassification;
      const sensitive = cls === "confidential" || cls === "restricted" || (a.dataClassifications ?? []).some((c) => c !== "public");
      if (sensitive && policyOf(a).pii.classes.length === 0) s += 1;
      if (a.riskTier === "high") s += 1;
      return Math.min(4, s);
    };
    const grid: Agent[][][] = Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => [] as Agent[]));
    for (const a of agents) grid[impactTier(a)][likelihood(a)].push(a);
    return grid;
  }, [agents]);

  const critical = predictions.filter((p) => p.severity === "critical").length;
  const agentsAtRisk = useMemo(() => {
    const s = new Set<string>();
    predictions.forEach((p) => p.affected.forEach((a) => s.add(a.id)));
    return s.size;
  }, [predictions]);
  const confidence = predictions.length
    ? Math.round(predictions.reduce((s, p) => s + p.confidence, 0) / predictions.length)
    : 0;

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      <PageHeader
        icon={Brain}
        title="Predictive Analytics"
        subtitle="AI-powered risk prediction based on your current agent fleet state"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard icon={TrendingUp} label="Active Predictions" value={predictions.length} tone="violet" />
        <KpiCard icon={AlertTriangle} label="Critical Predictions" value={critical} tone={critical ? "rose" : "slate"} highlight={critical > 0} />
        <KpiCard icon={ShieldOff} label="Agents At Risk" value={agentsAtRisk} tone={agentsAtRisk ? "amber" : "slate"} highlight={agentsAtRisk > 0} />
        <KpiCard icon={Activity} label="Confidence Score" value={<span>{confidence}<span className="text-base text-slate-400">%</span></span>} tone="indigo" />
      </div>

      <h2 className="text-sm font-bold text-slate-800 mb-3">Predictions</h2>
      {predictions.length === 0 ? (
        <EmptyState>No predictive risks detected — the fleet's current state looks healthy.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {predictions.map((p) => {
            const sev = SEV_META[p.severity];
            const cat = CAT_META[p.category];
            const CatIcon = cat.icon;
            return (
              <div key={p.id} className={`bg-white border border-gray-200/80 border-l-4 ${sev.accent} rounded-2xl shadow-card p-5`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${cat.chip}`}>
                      <CatIcon size={15} />
                    </span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${sev.chip}`}>{sev.label}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${cat.chip}`}>{p.category}</span>
                  </div>
                  <span className="text-xs text-slate-500 whitespace-nowrap">{p.confidence}% · {sev.label}</span>
                </div>

                <h3 className="text-sm font-bold text-slate-800 mb-1">{p.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">{p.description}</p>

                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-4">
                  <div className={`h-full ${sev.bar}`} style={{ width: `${p.confidence}%` }} />
                </div>

                <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Affected agents ({p.affected.length})</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {p.affected.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/agents/${a.id}`)}
                      className="text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      {a.name}
                    </button>
                  ))}
                </div>

                <div className="bg-slate-50 rounded-xl p-3 mb-2">
                  <p className="text-[11px] font-semibold text-slate-500 mb-0.5">Recommendation</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{p.recommendation}</p>
                </div>

                <p className="text-[10px] text-slate-400 font-mono">Source: {p.source}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Risk Heatmap */}
      <div className="mt-8 bg-white border border-gray-200/80 rounded-2xl shadow-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target size={16} className="text-violet-500" />
          <h2 className="text-sm font-bold text-slate-800">Risk Heatmap</h2>
          <span className="text-xs text-slate-400">impact × likelihood</span>
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "84px repeat(5, minmax(0, 1fr))" }}>
          {[3, 2, 1, 0].map((row) => (
            <div key={row} className="contents">
              <div className="flex items-center justify-end pr-2 text-[11px] font-semibold text-slate-500">{IMPACT_LABELS[row]}</div>
              {[0, 1, 2, 3, 4].map((col) => {
                const cell = heatmap[row][col];
                return (
                  <div key={col} className={`min-h-[78px] rounded-xl border ${zoneClass(row, col)} p-2 flex flex-col`}>
                    {cell.length > 0 && (
                      <>
                        <span className="text-sm font-bold text-slate-700 tabular-nums">{cell.length}</span>
                        <div className="flex flex-wrap gap-1 mt-1 overflow-hidden">
                          {cell.slice(0, 3).map((a) => (
                            <button key={a.id} onClick={() => navigate(`/agents/${a.id}`)} title={a.name} className="text-[9px] font-medium bg-white/70 text-slate-600 px-1.5 py-0.5 rounded hover:bg-white truncate max-w-full">
                              {a.name}
                            </button>
                          ))}
                          {cell.length > 3 && <span className="text-[9px] text-slate-400">+{cell.length - 3}</span>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {/* x-axis labels */}
          <div />
          {LIKELIHOOD_LABELS.map((l) => (
            <div key={l} className="text-center text-[10px] font-medium text-slate-400 pt-1">{l}</div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3 text-[10px] text-slate-400">
          <span>← lower likelihood</span>
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-200" /> low</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-200" /> moderate</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-orange-100 border border-orange-200" /> elevated</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-100 border border-rose-200" /> critical</span>
          </span>
          <span>higher likelihood →</span>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 mt-4">
        Predictions are heuristic, derived from registry state (dependencies, lifecycle, threats, policy, compliance) — a planning signal, not a guarantee.
      </p>
    </div>
  );
}
