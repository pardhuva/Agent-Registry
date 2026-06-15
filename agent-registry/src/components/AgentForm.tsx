import { useState } from "react";
import { X } from "lucide-react";
import { useData } from "../context/DataContext";
import type { Agent, Platform, LifecycleStage, RiskTier, AgentRiskTier, DataClass } from "../types";
import { CONNECTORS, CONNECTOR_ORDER } from "../lib/connectors";

const AGENT_RISK_TIERS: AgentRiskTier[] = ["low", "medium", "high"];
const DATA_CLASSES: DataClass[] = ["PII", "PHI", "financial", "public"];

const NATIVE_PLATFORMS: { id: Platform; label: string }[] = [
  { id: "langfuse", label: "Langfuse" },
  { id: "langsmith", label: "LangSmith" },
  { id: "helicone", label: "Helicone" },
  { id: "otel", label: "OpenTelemetry" },
  ...CONNECTOR_ORDER.filter((p) => CONNECTORS[p].category === "native").map((p) => ({
    id: p as Platform,
    label: CONNECTORS[p].label,
  })),
];

const HYPERSCALER_PLATFORMS: { id: Platform; label: string }[] = CONNECTOR_ORDER
  .filter((p) => CONNECTORS[p].category === "hyperscaler")
  .map((p) => ({ id: p as Platform, label: CONNECTORS[p].label }));

function PlatformChip({
  id, label, enabled, selected, onToggle,
}: {
  id: Platform; label: string; enabled: boolean; selected: boolean; onToggle: (p: Platform) => void;
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={() => onToggle(id)}
      title={enabled ? undefined : "No instance configured for this platform"}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
        !enabled
          ? "opacity-40 cursor-not-allowed border-gray-200 text-gray-400"
          : selected
          ? "bg-gray-900 text-white border-gray-900"
          : "border-gray-300 text-gray-700 hover:border-gray-900"
      }`}
    >
      {label}
    </button>
  );
}

const LIFECYCLES: LifecycleStage[] = ["dev", "staging", "prod", "deprecated"];
const RISK_TIERS: RiskTier[] = ["minimal", "limited", "high", "unacceptable"];
const CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"] as const;

export interface AgentFormValue {
  name: string;
  slug: string;
  description: string;
  systemPrompt: string;
  tags: string[];
  platforms: Platform[];
  owner: string;
  team: string;
  oncall: string;
  capability: string;
  version: string;
  lifecycle: LifecycleStage;
  dependencies: {
    models: string[];
    tools: string[];
    dataSources: string[];
    agents: string[];
  };
  accessScope: string[];
  guardrails: string;
  capabilitySpec: {
    inputs: string[];
    outputs: string[];
    examples: string[];
  };
  riskTier: AgentRiskTier;
  dataClassifications: DataClass[];
  compliance: {
    dataClassification: typeof CLASSIFICATIONS[number];
    euAiActTier: RiskTier;
    soc2Scope: boolean;
    notes: string;
  };
}

export function emptyAgentForm(): AgentFormValue {
  return {
    name: "", slug: "", description: "", systemPrompt: "",
    tags: [], platforms: [],
    owner: "", team: "", oncall: "",
    capability: "", version: "0.1.0", lifecycle: "dev",
    dependencies: { models: [], tools: [], dataSources: [], agents: [] },
    accessScope: [], guardrails: "",
    capabilitySpec: { inputs: [], outputs: [], examples: [] },
    riskTier: "medium",
    dataClassifications: [],
    compliance: { dataClassification: "internal", euAiActTier: "limited", soc2Scope: false, notes: "" },
  };
}

export function agentToForm(a: Agent): AgentFormValue {
  return {
    name: a.name,
    slug: a.slug,
    description: a.description,
    systemPrompt: a.systemPrompt,
    tags: [...a.tags],
    platforms: [...a.platforms],
    owner: a.owner ?? "",
    team: a.team ?? "",
    oncall: a.oncall ?? "",
    capability: a.capability ?? "",
    version: a.version ?? "0.1.0",
    lifecycle: a.lifecycle ?? "dev",
    dependencies: {
      models: a.dependencies?.models ?? [],
      tools: a.dependencies?.tools ?? [],
      dataSources: a.dependencies?.dataSources ?? [],
      agents: a.dependencies?.agents ?? [],
    },
    accessScope: a.accessScope ?? [],
    guardrails: a.guardrails ?? "",
    capabilitySpec: {
      inputs: a.capabilitySpec?.inputs ?? [],
      outputs: a.capabilitySpec?.outputs ?? [],
      examples: a.capabilitySpec?.examples ?? [],
    },
    riskTier: a.riskTier ?? "medium",
    dataClassifications: a.dataClassifications ?? [],
    compliance: {
      dataClassification: (a.compliance?.dataClassification as typeof CLASSIFICATIONS[number]) ?? "internal",
      euAiActTier: a.compliance?.euAiActTier ?? "limited",
      soc2Scope: a.compliance?.soc2Scope ?? false,
      notes: a.compliance?.notes ?? "",
    },
  };
}

export function formToAgentPatch(v: AgentFormValue): Partial<Agent> {
  return {
    name: v.name,
    slug: v.slug,
    description: v.description,
    systemPrompt: v.systemPrompt,
    tags: v.tags,
    platforms: v.platforms,
    owner: v.owner,
    team: v.team,
    oncall: v.oncall,
    capability: v.capability,
    version: v.version,
    lifecycle: v.lifecycle,
    dependencies: v.dependencies,
    accessScope: v.accessScope,
    guardrails: v.guardrails,
    capabilitySpec: v.capabilitySpec,
    riskTier: v.riskTier,
    dataClassifications: v.dataClassifications,
    compliance: v.compliance,
  };
}

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function csvToList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

interface Props {
  initial: AgentFormValue;
  mode: "create" | "edit";
  submitLabel: string;
  onSubmit: (v: AgentFormValue) => void;
  onCancel: () => void;
}

export function AgentForm({ initial, mode, submitLabel, onSubmit, onCancel }: Props) {
  const { langfuseInstances, langsmithInstances, heliconeInstances, otelInstances, connectorInstances } = useData();

  const [v, setV] = useState<AgentFormValue>(initial);
  const [tagInput, setTagInput] = useState("");
  const [depModels, setDepModels] = useState(v.dependencies.models.join(", "));
  const [depTools, setDepTools] = useState(v.dependencies.tools.join(", "));
  const [depDataSources, setDepDataSources] = useState(v.dependencies.dataSources.join(", "));
  const [depAgents, setDepAgents] = useState(v.dependencies.agents.join(", "));
  const [accessScope, setAccessScope] = useState(v.accessScope.join(", "));
  const [capInputs, setCapInputs] = useState(v.capabilitySpec.inputs.join(", "));
  const [capOutputs, setCapOutputs] = useState(v.capabilitySpec.outputs.join(", "));
  const [capExamples, setCapExamples] = useState(v.capabilitySpec.examples.join("\n"));
  const [error, setError] = useState("");

  const hasPlatform: Record<Platform, boolean> = {
    langfuse: langfuseInstances.length > 0,
    langsmith: langsmithInstances.length > 0,
    helicone: heliconeInstances.length > 0,
    otel: otelInstances.length > 0,
    bedrock: false,
    "azure-foundry": false,
    vertex: false,
    "azure-monitor": false,
    phoenix: false,
    datadog: false,
    traceloop: false,
  };
  for (const c of connectorInstances) hasPlatform[c.platform] = true;

  const set = <K extends keyof AgentFormValue>(k: K, val: AgentFormValue[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  const setCompliance = (patch: Partial<AgentFormValue["compliance"]>) =>
    setV((prev) => ({ ...prev, compliance: { ...prev.compliance, ...patch } }));

  const handleNameChange = (name: string) => {
    setV((prev) => ({
      ...prev,
      name,
      slug: mode === "create" ? slugify(name) : prev.slug,
    }));
  };

  const addTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
      e.preventDefault();
      const t = tagInput.trim().replace(/,$/, "");
      if (t && !v.tags.includes(t)) set("tags", [...v.tags, t]);
      setTagInput("");
    }
  };

  const togglePlatform = (p: Platform) =>
    set("platforms", v.platforms.includes(p) ? v.platforms.filter((x) => x !== p) : [...v.platforms, p]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return setError("Name is required.");
    if (!v.slug.trim()) return setError("Slug is required.");
    if (!v.owner.trim() || !v.team.trim()) return setError("Owner and team are required — every agent needs an identity.");
    if (!v.systemPrompt.trim()) return setError("System prompt is required.");
    if (mode === "create" && v.lifecycle === "prod") return setError("Agents cannot be created directly in production. Promote through the Lifecycle board.");
    setError("");
    const next: AgentFormValue = {
      ...v,
      dependencies: {
        models: csvToList(depModels),
        tools: csvToList(depTools),
        dataSources: csvToList(depDataSources),
        agents: csvToList(depAgents),
      },
      accessScope: csvToList(accessScope),
      capabilitySpec: {
        inputs: csvToList(capInputs),
        outputs: csvToList(capOutputs),
        examples: capExamples.split("\n").map((x) => x.trim()).filter(Boolean),
      },
    };
    onSubmit(next);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Identity */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Identity</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              value={v.name} onChange={(e) => handleNameChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Refund Agent" required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
            <input
              value={v.slug} onChange={(e) => set("slug", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="refund-agent" required
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input
            value={v.description} onChange={(e) => set("description", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="Short summary shown in listings"
          />
        </div>
      </section>

      {/* Ownership */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Ownership</h2>
          <p className="text-xs text-gray-500 mt-1">Who is paged when this agent misbehaves in production?</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Owner *</label>
            <input value={v.owner} onChange={(e) => set("owner", e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="jane.doe@co.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team *</label>
            <input value={v.team} onChange={(e) => set("team", e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Payments Platform" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">On-call</label>
            <input value={v.oncall} onChange={(e) => set("oncall", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="#payments-oncall" />
          </div>
        </div>
      </section>

      {/* Capability + Lifecycle */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Capability & lifecycle</h2>
          <p className="text-xs text-gray-500 mt-1">Searchable, discoverable description — and where this agent lives today.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Capability statement</label>
          <textarea
            value={v.capability} onChange={(e) => set("capability", e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="Processes customer refund requests by validating the order and issuing a credit via the Payments API."
          />
        </div>

        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
          <p className="text-xs text-gray-600">
            <strong>Structured capability</strong> — discoverable by other agents via standardized inputs/outputs.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Inputs (comma-separated)</label>
              <input value={capInputs} onChange={(e) => setCapInputs(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="order_id: string, reason: string" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Outputs (comma-separated)</label>
              <input value={capOutputs} onChange={(e) => setCapOutputs(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="refund_id: string, status: enum" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Example invocations (one per line)</label>
            <textarea value={capExamples} onChange={(e) => setCapExamples(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder='Refund order ORD-123 — reason: "wrong size"' />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
            <input value={v.version} onChange={(e) => set("version", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="0.1.0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lifecycle stage</label>
            <select
              value={v.lifecycle} onChange={(e) => set("lifecycle", e.target.value as LifecycleStage)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {LIFECYCLES.map((l) => (
                <option key={l} value={l} disabled={mode === "create" && l === "prod"}>
                  {l}{mode === "create" && l === "prod" ? " (promote from Lifecycle board)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">System prompt *</label>
          <textarea
            value={v.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} rows={4} required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 resize-vertical"
            placeholder="You are a helpful assistant that…"
          />
        </div>
      </section>

      {/* Dependencies */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Dependencies</h2>
          <p className="text-xs text-gray-500 mt-1">Comma-separated. Drives the dependency graph and impact analysis.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Models / LLMs</label>
            <input value={depModels} onChange={(e) => setDepModels(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="gpt-4o, claude-opus-4-7" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tools / APIs</label>
            <input value={depTools} onChange={(e) => setDepTools(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Payments API, CRM API" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data sources</label>
            <input value={depDataSources} onChange={(e) => setDepDataSources(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Customer DB, Orders DB" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Calls other agents</label>
            <input value={depAgents} onChange={(e) => setDepAgents(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="kyc-agent, fraud-check" />
          </div>
        </div>
      </section>

      {/* Access scope & guardrails */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Access scope & guardrails</h2>
          <p className="text-xs text-gray-500 mt-1">Exactly what this agent is permitted to touch — and the policy boundaries it must operate within.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Access scope (comma-separated)</label>
          <input value={accessScope} onChange={(e) => setAccessScope(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="payments:write, customer:read, orders:read" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Guardrails</label>
          <textarea value={v.guardrails} onChange={(e) => set("guardrails", e.target.value)} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="Max refund $500 without human escalation. Never expose PII in outputs. Escalate disputes > $2k." />
        </div>
      </section>

      {/* Compliance */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Risk & compliance</h2>
          <p className="text-xs text-gray-500 mt-1">Risk tier drives approval routing and default policy. Data classifications tie to SOC 2 / EU AI Act.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Risk tier *</label>
            <select
              value={v.riskTier} onChange={(e) => set("riskTier", e.target.value as AgentRiskTier)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {AGENT_RISK_TIERS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data classifications (multi-select)</label>
            <div className="flex flex-wrap gap-1.5">
              {DATA_CLASSES.map((d) => {
                const selected = v.dataClassifications.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set("dataClassifications",
                      selected ? v.dataClassifications.filter((x) => x !== d) : [...v.dataClassifications, d]
                    )}
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      selected ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Legacy data classification</label>
            <select
              value={v.compliance.dataClassification}
              onChange={(e) => setCompliance({ dataClassification: e.target.value as typeof CLASSIFICATIONS[number] })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">EU AI Act risk tier</label>
            <select
              value={v.compliance.euAiActTier}
              onChange={(e) => setCompliance({ euAiActTier: e.target.value as RiskTier })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {RISK_TIERS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={v.compliance.soc2Scope}
            onChange={(e) => setCompliance({ soc2Scope: e.target.checked })}
            className="rounded border-gray-300" />
          In SOC 2 audit scope
        </label>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Compliance notes</label>
          <textarea value={v.compliance.notes} onChange={(e) => setCompliance({ notes: e.target.value })} rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="DPA on file. Reviewed by legal 2026-05-12." />
        </div>
      </section>

      {/* Tags & Platforms */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Tags & observability</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
          <div className="flex flex-wrap gap-1.5 border border-gray-300 rounded-lg px-3 py-2 min-h-[40px] focus-within:ring-2 focus-within:ring-gray-900">
            {v.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                {t}
                <button type="button" onClick={() => set("tags", v.tags.filter((x) => x !== t))}>
                  <X size={11} />
                </button>
              </span>
            ))}
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={addTag}
              className="flex-1 outline-none text-sm min-w-20 bg-transparent"
              placeholder={v.tags.length === 0 ? "Add tags (press Enter or ,)" : ""} />
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Native LLM observability</label>
            <div className="flex gap-2 flex-wrap">
              {NATIVE_PLATFORMS.map(({ id, label }) => (
                <PlatformChip key={id} id={id} label={label}
                  enabled={hasPlatform[id]} selected={v.platforms.includes(id)} onToggle={togglePlatform} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Hyperscaler agent platforms</label>
            <div className="flex gap-2 flex-wrap">
              {HYPERSCALER_PLATFORMS.map(({ id, label }) => (
                <PlatformChip key={id} id={id} label={label}
                  enabled={hasPlatform[id]} selected={v.platforms.includes(id)} onToggle={togglePlatform} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-3">
        <button type="submit"
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
