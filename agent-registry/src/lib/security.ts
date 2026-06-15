import { Shield, Activity, Brain, Coins, Eraser, ChartBar } from "lucide-react";
import type { Agent, PolicySchema, SecurityControlId, ProtectionStatus } from "../types";

export type ControlOwnership = "build" | "integrate" | "consume";

export interface SecurityControlSpec {
  id: SecurityControlId;
  num: string;
  label: string;
  eyebrow: string;
  description: string;
  ownership: ControlOwnership[];
  mode: "detect-only" | "detect-or-block" | "consume";
  capturePathRequired: boolean;
  icon: typeof Shield;
}

export const SECURITY_CONTROLS: SecurityControlSpec[] = [
  {
    id: "firewall",
    num: "S1",
    label: "LLM Firewall",
    eyebrow: "PROMPT/RESPONSE INSPECTION",
    description: "Inspects prompts and responses inline. We orchestrate a guardrail engine (LLM Guard, Lakera, NeMo, Azure Content Safety) — pluggable provider behind one interface.",
    ownership: ["integrate"],
    mode: "detect-or-block",
    capturePathRequired: true,
    icon: Shield,
  },
  {
    id: "model_theft",
    num: "S2",
    label: "Model Theft",
    eyebrow: "EXTRACTION-PATTERN DETECTION",
    description: "Fleet analytics over query telemetry to flag systematic probing: abnormal volume, boundary-mapping, enumeration. Works read-only — no client code.",
    ownership: ["build"],
    mode: "detect-only",
    capturePathRequired: false,
    icon: Brain,
  },
  {
    id: "jailbreak",
    num: "S3",
    label: "Jailbreak Attempts",
    eyebrow: "ATTEMPT DETECTION + AGGREGATION",
    description: "Per-call detection integrated from guardrail engines; the build is the cross-agent intelligence — shared attack signatures + repeat-offender tracking.",
    ownership: ["build", "integrate"],
    mode: "detect-or-block",
    capturePathRequired: true,
    icon: Activity,
  },
  {
    id: "coherency",
    num: "S4",
    label: "Coherency",
    eyebrow: "OUTPUT QUALITY",
    description: "Output quality, hallucination, relevance scoring is core observability territory. Consume the scores the connected platform already computes.",
    ownership: ["consume"],
    mode: "consume",
    capturePathRequired: false,
    icon: ChartBar,
  },
  {
    id: "token_overuse",
    num: "S5",
    label: "Token Overuse",
    eyebrow: "COST & QUOTA",
    description: "Tracking is consumed; enforcement is the build — per-agent budgets with throttle / alert / hard-cut on breach.",
    ownership: ["consume", "build"],
    mode: "detect-or-block",
    capturePathRequired: true,
    icon: Coins,
  },
  {
    id: "pii",
    num: "S6",
    label: "PII Exfiltration",
    eyebrow: "DATA LEAK PREVENTION",
    description: "Per-call detection/redaction integrated; the build is exfiltration-pattern detection across sessions, tied to data classification for compliance mapping.",
    ownership: ["build", "integrate"],
    mode: "detect-or-block",
    capturePathRequired: true,
    icon: Eraser,
  },
];

export const OWNERSHIP_CHIP: Record<ControlOwnership, string> = {
  build: "bg-orange-100 text-orange-800 border-orange-200",
  integrate: "bg-blue-100 text-blue-800 border-blue-200",
  consume: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export const OWNERSHIP_LABEL: Record<ControlOwnership, string> = {
  build: "Build",
  integrate: "Integrate",
  consume: "Consume",
};

export const PROTECTION_LABEL: Record<ProtectionStatus, string> = {
  unprotected: "Unprotected",
  awaiting_event: "Awaiting first event",
  protected: "Protected",
};

export const PROTECTION_CHIP: Record<ProtectionStatus, string> = {
  unprotected: "bg-gray-100 text-gray-700 border-gray-200",
  awaiting_event: "bg-amber-100 text-amber-800 border-amber-200",
  protected: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export function policyOf(a: Agent): PolicySchema {
  return a.policy ?? {
    firewall: { enabled: false, onViolation: "log" },
    jailbreak: { detect: true, action: "log" },
    pii: { classes: [], action: "log" },
    tokenBudget: { window: "day", onExceed: "alert" },
    modelTheft: { detection: true, threshold: "medium" },
    coherency: { gatePromotion: false },
    failMode: "fail_open",
  };
}

export function isControlEnforcing(p: PolicySchema, id: SecurityControlId): boolean {
  switch (id) {
    case "firewall": return p.firewall.enabled && p.firewall.onViolation !== "log";
    case "jailbreak": return p.jailbreak.detect && (p.jailbreak.action === "block" || p.jailbreak.action === "quarantine");
    case "pii": return p.pii.classes.length > 0 && (p.pii.action === "block" || p.pii.action === "redact");
    case "token_overuse": return !!p.tokenBudget.limit && (p.tokenBudget.onExceed === "cutoff" || p.tokenBudget.onExceed === "throttle");
    case "model_theft": return false; // detect-only
    case "coherency": return false; // consume-only
  }
}

export function isControlDetecting(p: PolicySchema, id: SecurityControlId): boolean {
  switch (id) {
    case "firewall": return p.firewall.enabled;
    case "jailbreak": return p.jailbreak.detect;
    case "pii": return p.pii.classes.length > 0;
    case "token_overuse": return !!p.tokenBudget.limit;
    case "model_theft": return p.modelTheft.detection;
    case "coherency": return true; // always read-only
  }
}

export function deriveProtectionStatus(a: Agent): ProtectionStatus {
  const p = policyOf(a);
  const anyEnforcing = SECURITY_CONTROLS.some((c) => isControlEnforcing(p, c.id));
  if (!anyEnforcing) return "unprotected";
  return a.firstInstrumentedAt ? "protected" : "awaiting_event";
}

export function snippetSDK(agentSlug: string): string {
  return `# existing Langfuse/LangSmith tracing stays exactly as-is
from ibaseit import register
register(api_key="ib_live_a1b2", agent_id="${agentSlug}")
# every OpenAI / Anthropic / LangChain call is now policy-enforced`;
}

export function snippetGateway(agentSlug: string): string {
  return `client = OpenAI(
    base_url="https://gw.ibaseit.com/v1",   # was api.openai.com
    api_key="...",
    default_headers={"X-IBaseIT-Agent": "${agentSlug}"}
)`;
}
