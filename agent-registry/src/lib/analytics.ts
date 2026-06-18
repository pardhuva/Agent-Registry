import type { Agent, ProtectionStatus, AgentRiskTier, LifecycleStage } from "../types";
import { deriveProtectionStatus } from "./security";

// ── Shared derivations across the Governance & Analytics pages ──────────────

export function protectionOf(a: Agent): ProtectionStatus {
  return a.protectionStatus ?? deriveProtectionStatus(a);
}

export function lastActivityOf(a: Agent): string {
  const times = (a.auditLog ?? []).map((e) => e.at).filter(Boolean);
  if (a.createdAt) times.push(a.createdAt);
  if (times.length === 0) return "";
  return times.reduce((max, t) => (t > max ? t : max), times[0]);
}

export function depList(a: Agent): { models: string[]; tools: string[]; dataSources: string[]; agents: string[] } {
  const d = a.dependencies;
  return {
    models: d?.models ?? [],
    tools: d?.tools ?? [],
    dataSources: d?.dataSources ?? [],
    agents: d?.agents ?? [],
  };
}

export function depCount(a: Agent): number {
  const d = depList(a);
  return d.models.length + d.tools.length + d.dataSources.length + d.agents.length;
}

export function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export const RISK_CHIP: Record<AgentRiskTier, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-rose-50 text-rose-700 border-rose-200",
};

export const LIFECYCLE_CHIP: Record<LifecycleStage, string> = {
  dev: "bg-slate-100 text-slate-600 border-slate-200",
  staging: "bg-blue-50 text-blue-700 border-blue-200",
  prod: "bg-emerald-50 text-emerald-700 border-emerald-200",
  deprecated: "bg-gray-100 text-gray-500 border-gray-200",
};

export const PROTECTION_CHIP: Record<ProtectionStatus, string> = {
  unprotected: "bg-gray-100 text-gray-600 border-gray-200",
  awaiting_event: "bg-amber-50 text-amber-700 border-amber-200",
  protected: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export const PROTECTION_LABEL: Record<ProtectionStatus, string> = {
  unprotected: "Unprotected",
  awaiting_event: "Awaiting event",
  protected: "Protected",
};
