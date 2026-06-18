import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Eraser, ScanSearch, FileWarning, ShieldCheck, Database } from "lucide-react";
import { useData } from "../context/DataContext";
import type { Agent } from "../types";
import { PageHeader, KpiCard, EmptyState } from "../components/AnalyticsUI";

// ── PII pattern scanner over agent configuration text ──────────────────────

interface Pattern {
  type: string;
  re: RegExp;
  confidence: "High" | "Medium";
  risk: "high" | "medium" | "low";
  weight: number;
  recommendation: string;
}

const PATTERNS: Pattern[] = [
  { type: "US SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g, confidence: "High", risk: "high", weight: 35, recommendation: "Remove SSN from config; never embed identifiers in prompts." },
  { type: "Credit card", re: /\b(?:\d[ -]?){15,16}\b/g, confidence: "High", risk: "high", weight: 35, recommendation: "Strip card numbers; route payment data through a tokenization service." },
  { type: "Email address", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, confidence: "High", risk: "medium", weight: 15, recommendation: "Redact emails or replace with a placeholder variable." },
  { type: "Phone number", re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, confidence: "Medium", risk: "medium", weight: 12, recommendation: "Redact phone numbers from the agent configuration." },
  { type: "API key / secret", re: /\b(?:sk|pk|ib|api)[-_][A-Za-z0-9]{12,}\b/g, confidence: "High", risk: "high", weight: 30, recommendation: "Move secrets to an environment store; never commit to config." },
];

type TextField = "systemPrompt" | "description" | "guardrails" | "capability";
const FIELDS: { key: TextField; label: string }[] = [
  { key: "systemPrompt", label: "System prompt" },
  { key: "description", label: "Description" },
  { key: "guardrails", label: "Guardrails" },
  { key: "capability", label: "Capability" },
];

interface ScanRow {
  agent: Agent;
  field: string;
  match: string;
  type: string;
  confidence: string;
  risk: "high" | "medium" | "low";
  recommendation: string;
}

function mask(s: string): string {
  if (s.length <= 4) return "•".repeat(s.length);
  return s.slice(0, 2) + "•".repeat(Math.max(3, s.length - 4)) + s.slice(-2);
}

const RISK_TEXT: Record<string, string> = {
  high: "bg-rose-50 text-rose-700 border-rose-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

const CLASS_CHIP: Record<string, string> = {
  public: "bg-emerald-50 text-emerald-700",
  internal: "bg-blue-50 text-blue-700",
  confidential: "bg-amber-50 text-amber-700",
  restricted: "bg-rose-50 text-rose-700",
};

function scanAgent(a: Agent): { rows: ScanRow[]; score: number } {
  const rows: ScanRow[] = [];
  let score = 0;
  for (const f of FIELDS) {
    const text = a[f.key] ?? "";
    if (!text) continue;
    for (const p of PATTERNS) {
      const re = new RegExp(p.re.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        rows.push({ agent: a, field: f.label, match: mask(m[0]), type: p.type, confidence: p.confidence, risk: p.risk, recommendation: p.recommendation });
        score += p.weight;
      }
    }
  }
  const cls = a.compliance?.dataClassification;
  if (cls === "confidential") score += 10;
  if (cls === "restricted") score += 20;
  return { rows, score: Math.min(100, score) };
}

export function PiiDetection() {
  const { agents } = useData();
  const navigate = useNavigate();

  const { rows, perAgent } = useMemo(() => {
    const allRows: ScanRow[] = [];
    const map = new Map<string, { agent: Agent; findings: number; score: number }>();
    for (const a of agents) {
      const { rows: r, score } = scanAgent(a);
      allRows.push(...r);
      map.set(a.id, { agent: a, findings: r.length, score });
    }
    return { rows: allRows, perAgent: [...map.values()] };
  }, [agents]);

  const highRisk = perAgent.filter((p) => p.score >= 40).length;
  const sensitive = agents.filter((a) => {
    const c = a.compliance?.dataClassification;
    return c === "confidential" || c === "restricted";
  }).length;

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      <PageHeader
        icon={Eraser}
        title="PII Detection"
        subtitle="Configuration scanning, sensitive-data classification, and compliance posture"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard icon={ScanSearch} label="Agents Scanned" value={agents.length} tone="indigo" />
        <KpiCard icon={FileWarning} label="Config Findings" value={rows.length} tone={rows.length ? "rose" : "slate"} highlight={rows.length > 0} />
        <KpiCard icon={Database} label="High-Risk Agents" value={highRisk} tone={highRisk ? "amber" : "slate"} highlight={highRisk > 0} />
        <KpiCard icon={ShieldCheck} label="Confidential / Restricted" value={sensitive} tone="violet" />
      </div>

      {/* Config scan */}
      <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-gray-100">
                <th className="px-4 py-3 font-semibold">Agent</th>
                <th className="px-4 py-3 font-semibold">Field scanned</th>
                <th className="px-4 py-3 font-semibold">Match</th>
                <th className="px-4 py-3 font-semibold">Pattern type</th>
                <th className="px-4 py-3 font-semibold">Confidence</th>
                <th className="px-4 py-3 font-semibold">Risk level</th>
                <th className="px-4 py-3 font-semibold">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    No PII patterns detected in any agent configuration.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3">
                      <button onClick={() => navigate(`/agents/${r.agent.id}`)} className="font-mono text-[12px] text-indigo-600 hover:underline">{r.agent.slug}</button>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.field}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.match}</td>
                    <td className="px-4 py-3 text-slate-700">{r.type}</td>
                    <td className="px-4 py-3 text-slate-600">{r.confidence}</td>
                    <td className="px-4 py-3"><span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md border ${RISK_TEXT[r.risk]}`}>{r.risk}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-xs">{r.recommendation}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Compliance & risk grid */}
      <h2 className="text-sm font-bold text-slate-800 mb-3">Agent Compliance &amp; Risk Grid</h2>
      {perAgent.length === 0 ? (
        <EmptyState>No agents registered yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {perAgent.map(({ agent, findings, score }) => {
            const cls = agent.compliance?.dataClassification ?? "public";
            const soc2 = agent.compliance?.soc2Scope;
            const scoreColor = score === 0 ? "text-emerald-600" : score >= 40 ? "text-rose-600" : "text-amber-600";
            const barColor = score === 0 ? "bg-emerald-400" : score >= 40 ? "bg-rose-500" : "bg-amber-500";
            return (
              <button
                key={agent.id}
                onClick={() => navigate(`/agents/${agent.id}`)}
                className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-4 text-left hover:border-indigo-200"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="text-sm font-bold text-slate-800">{agent.name}</h3>
                  <span className={`text-2xl font-bold leading-none ${scoreColor}`}>{score}</span>
                </div>
                <p className="text-[11px] text-slate-500 mb-3">PII risk score · {findings} finding{findings === 1 ? "" : "s"}</p>
                <div className="h-1 rounded-full bg-slate-100 overflow-hidden mb-3">
                  <div className={`h-full ${barColor}`} style={{ width: `${score}%` }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${CLASS_CHIP[cls]}`}>{cls}</span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">SOC 2: {soc2 ? "in" : "out"}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
