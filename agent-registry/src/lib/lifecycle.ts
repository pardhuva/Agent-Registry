import type { Agent, LifecycleStage } from "../types";

export const LIFECYCLE_ORDER: LifecycleStage[] = ["dev", "staging", "prod", "deprecated"];

export const LIFECYCLE_STYLE: Record<LifecycleStage, string> = {
  dev: "bg-slate-100 text-slate-700 border-slate-200",
  staging: "bg-amber-100 text-amber-800 border-amber-200",
  prod: "bg-emerald-100 text-emerald-800 border-emerald-200",
  deprecated: "bg-rose-100 text-rose-800 border-rose-200",
};

export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  dev: "Dev",
  staging: "Staging",
  prod: "Prod",
  deprecated: "Deprecated",
};

export function stageOf(a: Agent): LifecycleStage {
  return a.lifecycle ?? "dev";
}

export function nextStage(s: LifecycleStage): LifecycleStage | null {
  const i = LIFECYCLE_ORDER.indexOf(s);
  if (i < 0 || i >= LIFECYCLE_ORDER.length - 1) return null;
  return LIFECYCLE_ORDER[i + 1];
}

export function prevStage(s: LifecycleStage): LifecycleStage | null {
  const i = LIFECYCLE_ORDER.indexOf(s);
  if (i <= 0) return null;
  return LIFECYCLE_ORDER[i - 1];
}

export interface PromotionCheck {
  ok: boolean;
  missing: string[];
}

export function checkPromotion(a: Agent, target: LifecycleStage): PromotionCheck {
  const missing: string[] = [];
  if (!a.owner) missing.push("owner");
  if (!a.team) missing.push("team");
  if (!a.capability) missing.push("capability statement");
  if (target === "prod") {
    if (!a.oncall) missing.push("on-call contact");
    if (!a.guardrails) missing.push("guardrails");
    if (!a.compliance?.dataClassification) missing.push("data classification");
    if (!a.platforms.length) missing.push("linked observability platform");
    // Per spec: "no prod agent without a firewall policy"
    if (!a.policy?.firewall.enabled) missing.push("firewall policy enabled");
    if (!a.riskTier) missing.push("risk tier");
    // Coherency gate (S4): if gatePromotion is on, require a min score baseline
    if (a.policy?.coherency.gatePromotion && a.policy.coherency.minScore == null) {
      missing.push("coherency min score (gate is active)");
    }
    // PII-handling agents must have a PII policy
    const handlesPII = (a.dataClassifications ?? []).includes("PII") ||
                       (a.dataClassifications ?? []).includes("PHI");
    if (handlesPII && !(a.policy?.pii?.classes?.length)) {
      missing.push("PII policy (agent handles PII/PHI)");
    }
  }
  return { ok: missing.length === 0, missing };
}
