import { useState } from "react";
import {
  Shield, ShieldCheck, ShieldOff, Eye, Route, Plug, Copy, Check, X, AlertTriangle,
} from "lucide-react";
import { useData } from "../context/DataContext";
import type { Agent, SecurityControlId, ViolationAction, GuardrailProvider, PolicySchema } from "../types";
import {
  SECURITY_CONTROLS, OWNERSHIP_CHIP, OWNERSHIP_LABEL,
  policyOf, isControlEnforcing, isControlDetecting,
  deriveProtectionStatus, snippetSDK, snippetGateway,
} from "../lib/security";

const PROVIDERS: GuardrailProvider[] = ["llm-guard", "lakera", "nemo", "azure-content-safety"];

function clone<T>(o: T): T { return JSON.parse(JSON.stringify(o)) as T; }

function defaultEnforce(id: SecurityControlId, p: PolicySchema): PolicySchema {
  const next = clone(p);
  switch (id) {
    case "firewall":
      next.firewall.enabled = true;
      next.firewall.provider = next.firewall.provider ?? "llm-guard";
      next.firewall.onViolation = "block";
      break;
    case "jailbreak":
      next.jailbreak.detect = true;
      next.jailbreak.action = "block";
      break;
    case "pii":
      if (next.pii.classes.length === 0) next.pii.classes = ["PII"];
      next.pii.action = "redact";
      break;
    case "token_overuse":
      next.tokenBudget.limit = next.tokenBudget.limit ?? 1_000_000;
      next.tokenBudget.onExceed = "cutoff";
      break;
    case "model_theft":
      next.modelTheft.detection = true;
      break;
    case "coherency":
      next.coherency.gatePromotion = true;
      break;
  }
  return next;
}

function defaultDisable(id: SecurityControlId, p: PolicySchema): PolicySchema {
  const next = clone(p);
  switch (id) {
    case "firewall":
      next.firewall.onViolation = "log";
      next.firewall.enabled = false;
      break;
    case "jailbreak":
      next.jailbreak.action = "log";
      break;
    case "pii":
      next.pii.action = "log";
      break;
    case "token_overuse":
      next.tokenBudget.onExceed = "alert";
      break;
    case "model_theft":
      // detect-only; toggle still controls
      next.modelTheft.detection = false;
      break;
    case "coherency":
      next.coherency.gatePromotion = false;
      break;
  }
  return next;
}

export function SecurityPanel({ agent }: { agent: Agent }) {
  const { updateAgent } = useData();
  const policy = policyOf(agent);
  const protection = agent.protectionStatus ?? deriveProtectionStatus(agent);
  const [snippetFor, setSnippetFor] = useState<SecurityControlId | null>(null);
  const [snippetStyle, setSnippetStyle] = useState<"sdk" | "gateway">("sdk");
  const [copied, setCopied] = useState(false);

  function setPolicy(next: PolicySchema, summary: string) {
    const newProtection = (() => {
      const anyEnforce = SECURITY_CONTROLS.some((c) => isControlEnforcing(next, c.id));
      if (!anyEnforce) return "unprotected" as const;
      return agent.firstInstrumentedAt ? "protected" as const : "awaiting_event" as const;
    })();
    updateAgent(agent.id, { policy: next, protectionStatus: newProtection }, { summary });
  }

  function enableBlocking(id: SecurityControlId) {
    setPolicy(defaultEnforce(id, policy), `Enabled enforcement for ${id}`);
    const spec = SECURITY_CONTROLS.find((c) => c.id === id);
    if (spec?.capturePathRequired) setSnippetFor(id);
  }

  function disableBlocking(id: SecurityControlId) {
    setPolicy(defaultDisable(id, policy), `Disabled enforcement for ${id}`);
  }

  function copySnippet() {
    const code = snippetStyle === "sdk" ? snippetSDK(agent.slug) : snippetGateway(agent.slug);
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function simulateInstall() {
    updateAgent(agent.id, {
      firstInstrumentedAt: new Date().toISOString(),
      protectionStatus: "protected",
      captureStyle: snippetStyle === "sdk" ? "sdk" : "gateway",
    }, { summary: `Confirmed first instrumented call via ${snippetStyle.toUpperCase()}` });
    setSnippetFor(null);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Shield size={15} />
            Security & enforcement
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Six runtime controls. Detection is read-only; enforcement requires a capture adapter (SDK or gateway).
          </p>
        </div>
        <ProtectionBadge protection={protection} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {SECURITY_CONTROLS.map((c) => {
          const detecting = isControlDetecting(policy, c.id);
          const enforcing = isControlEnforcing(policy, c.id);
          const Icon = c.icon;
          return (
            <div key={c.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-[10px] font-mono font-bold text-gray-500 mt-0.5">{c.num}</span>
                  <Icon size={14} className="text-gray-700 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">{c.eyebrow}</p>
                    <p className="text-sm font-semibold text-gray-900">{c.label}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 shrink-0 justify-end">
                  {c.ownership.map((o) => (
                    <span key={o} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${OWNERSHIP_CHIP[o]}`}>
                      {OWNERSHIP_LABEL[o]}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-600 mb-2 line-clamp-2">{c.description}</p>

              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${detecting ? "bg-blue-100 text-blue-800" : "bg-gray-200 text-gray-500"}`}>
                  <Eye size={10} /> {detecting ? "Detecting" : "Off"}
                </span>
                {c.mode === "detect-or-block" && (
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${enforcing ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-500"}`}>
                    <ShieldCheck size={10} /> {enforcing ? "Enforcing" : "Not blocking"}
                  </span>
                )}
                {c.capturePathRequired && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    <Route size={10} /> Capture required
                  </span>
                )}
                {!c.capturePathRequired && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    <Plug size={10} /> Zero client code
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                {c.mode === "detect-or-block" ? (
                  enforcing ? (
                    <button
                      onClick={() => disableBlocking(c.id)}
                      className="text-[11px] flex items-center gap-1 px-2 py-1 rounded bg-white border border-rose-200 text-rose-700 hover:bg-rose-50"
                    >
                      <ShieldOff size={11} />
                      Disable blocking
                    </button>
                  ) : (
                    <button
                      onClick={() => enableBlocking(c.id)}
                      className="text-[11px] flex items-center gap-1 px-2 py-1 rounded bg-gray-900 text-white hover:bg-gray-800"
                    >
                      <ShieldCheck size={11} />
                      Enable blocking
                    </button>
                  )
                ) : c.mode === "detect-only" ? (
                  <button
                    onClick={() => {
                      const next = clone(policy);
                      next.modelTheft.detection = !next.modelTheft.detection;
                      setPolicy(next, `Toggled ${c.id} detection`);
                    }}
                    className="text-[11px] flex items-center gap-1 px-2 py-1 rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    {detecting ? "Pause detection" : "Resume detection"}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const next = clone(policy);
                      next.coherency.gatePromotion = !next.coherency.gatePromotion;
                      setPolicy(next, `Toggled coherency promotion gate`);
                    }}
                    className="text-[11px] flex items-center gap-1 px-2 py-1 rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    {policy.coherency.gatePromotion ? "Ungate promotion" : "Gate promotion"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t border-gray-200 pt-3 flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-gray-700">Fail mode</label>
        <select
          value={policy.failMode}
          onChange={(e) => setPolicy({ ...policy, failMode: e.target.value as PolicySchema["failMode"] }, "Updated fail mode")}
          className="text-xs border border-gray-300 rounded px-2 py-1"
        >
          <option value="fail_open">fail_open — allow if core unreachable</option>
          <option value="fail_closed">fail_closed — block if core unreachable</option>
        </select>

        {policy.firewall.enabled && (
          <>
            <label className="text-xs font-medium text-gray-700">Firewall provider</label>
            <select
              value={policy.firewall.provider ?? "llm-guard"}
              onChange={(e) => setPolicy({ ...policy, firewall: { ...policy.firewall, provider: e.target.value as GuardrailProvider } }, "Updated firewall provider")}
              className="text-xs border border-gray-300 rounded px-2 py-1"
            >
              {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </>
        )}

        {policy.pii.classes.length > 0 && (
          <>
            <label className="text-xs font-medium text-gray-700">PII action</label>
            <select
              value={policy.pii.action}
              onChange={(e) => setPolicy({ ...policy, pii: { ...policy.pii, action: e.target.value as ViolationAction } }, "Updated PII action")}
              className="text-xs border border-gray-300 rounded px-2 py-1"
            >
              <option value="log">log</option>
              <option value="redact">redact</option>
              <option value="block">block</option>
              <option value="alert">alert</option>
            </select>
          </>
        )}

        {policy.tokenBudget.limit && (
          <>
            <label className="text-xs font-medium text-gray-700">Budget</label>
            <input
              type="number"
              value={policy.tokenBudget.limit}
              onChange={(e) => setPolicy({ ...policy, tokenBudget: { ...policy.tokenBudget, limit: Number(e.target.value) || 0 } }, "Updated token budget")}
              className="text-xs border border-gray-300 rounded px-2 py-1 w-24 font-mono"
            />
            <select
              value={policy.tokenBudget.window}
              onChange={(e) => setPolicy({ ...policy, tokenBudget: { ...policy.tokenBudget, window: e.target.value as "hour" | "day" | "month" } }, "Updated budget window")}
              className="text-xs border border-gray-300 rounded px-2 py-1"
            >
              <option value="hour">/ hour</option>
              <option value="day">/ day</option>
              <option value="month">/ month</option>
            </select>
          </>
        )}
      </div>

      {snippetFor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSnippetFor(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Install snippet — required for enforcement</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Detection works without it; <strong>blocking requires sitting in the request path</strong>. Pick a capture style:
                </p>
              </div>
              <button onClick={() => setSnippetFor(null)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setSnippetStyle("sdk")}
                className={`text-xs px-3 py-1.5 rounded border ${snippetStyle === "sdk" ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-300 text-gray-700"}`}
              >
                Style 1 — Sidecar SDK (Python)
              </button>
              <button
                onClick={() => setSnippetStyle("gateway")}
                className={`text-xs px-3 py-1.5 rounded border ${snippetStyle === "gateway" ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-300 text-gray-700"}`}
              >
                Style 2 — Gateway base-URL
              </button>
            </div>

            <pre className="bg-gray-900 text-gray-100 text-xs font-mono p-3 rounded-lg overflow-auto whitespace-pre">
              {snippetStyle === "sdk" ? snippetSDK(agent.slug) : snippetGateway(agent.slug)}
            </pre>

            <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
              <button
                onClick={copySnippet}
                className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy snippet</>}
              </button>
              {!agent.firstInstrumentedAt ? (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  <AlertTriangle size={12} />
                  <span>Awaiting first event — badge will flip to <strong>Protected</strong> on first instrumented call.</span>
                  <button
                    onClick={simulateInstall}
                    className="ml-2 text-xs font-medium underline hover:no-underline"
                  >
                    Simulate first call
                  </button>
                </div>
              ) : (
                <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 flex items-center gap-1">
                  <ShieldCheck size={12} /> Already protected — first event seen {new Date(agent.firstInstrumentedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProtectionBadge({ protection }: { protection: "unprotected" | "awaiting_event" | "protected" }) {
  const map = {
    unprotected: { label: "Unprotected", cls: "bg-gray-100 text-gray-700 border-gray-200", Icon: ShieldOff },
    awaiting_event: { label: "Awaiting first event", cls: "bg-amber-100 text-amber-800 border-amber-200", Icon: AlertTriangle },
    protected: { label: "Protected", cls: "bg-emerald-100 text-emerald-800 border-emerald-200", Icon: ShieldCheck },
  }[protection];
  const Icon = map.Icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${map.cls}`}>
      <Icon size={11} />
      {map.label}
    </span>
  );
}
