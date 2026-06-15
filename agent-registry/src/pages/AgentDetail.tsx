import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Tag, Trash2, RefreshCw, Layers, Zap, Activity, Radio,
  Users, Shield, Database, Cpu, Wrench, Bot, FileCheck2, CheckCircle2, AlertTriangle, ArrowRight, Pencil,
  History, Undo2, ArrowUpCircle, ArrowDownCircle, Plus,
} from "lucide-react";
import { useData } from "../context/DataContext";
import { TraceList } from "../components/TraceList";
import {
  fetchLangfuseTraces,
  fetchLangSmithTraces,
  fetchHeliconeTraces,
  fetchOtelTraces,
} from "../lib/tracing";
import type { Trace, Platform, ConnectorPlatform } from "../types";
import { LIFECYCLE_STYLE, LIFECYCLE_LABEL, stageOf, nextStage, checkPromotion } from "../lib/lifecycle";
import { CONNECTORS } from "../lib/connectors";
import { SecurityPanel } from "../components/SecurityPanel";
import { deriveProtectionStatus, PROTECTION_LABEL, PROTECTION_CHIP } from "../lib/security";

const NATIVE_TABS: { id: Platform; label: string; icon: typeof Layers }[] = [
  { id: "langfuse", label: "Langfuse", icon: Layers },
  { id: "langsmith", label: "LangSmith", icon: Zap },
  { id: "helicone", label: "Helicone", icon: Activity },
  { id: "otel", label: "OpenTelemetry", icon: Radio },
];

const CONNECTOR_TABS: { id: Platform; label: string; icon: typeof Layers }[] =
  (Object.keys(CONNECTORS) as ConnectorPlatform[]).map((p) => ({
    id: p as Platform, label: CONNECTORS[p].shortLabel, icon: CONNECTORS[p].icon,
  }));

const ALL_TABS = [...NATIVE_TABS, ...CONNECTOR_TABS];

const TAB_COLORS: Record<Platform, string> = {
  langfuse: "text-purple-600 border-purple-600",
  langsmith: "text-yellow-600 border-yellow-600",
  helicone: "text-blue-600 border-blue-600",
  otel: "text-emerald-600 border-emerald-600",
  bedrock: CONNECTORS.bedrock.color,
  "azure-foundry": CONNECTORS["azure-foundry"].color,
  vertex: CONNECTORS.vertex.color,
  "azure-monitor": CONNECTORS["azure-monitor"].color,
  phoenix: CONNECTORS.phoenix.color,
  datadog: CONNECTORS.datadog.color,
  traceloop: CONNECTORS.traceloop.color,
};

const TAB_LABELS: Record<Platform, string> = {
  langfuse: "Langfuse",
  langsmith: "LangSmith",
  helicone: "Helicone",
  otel: "OpenTelemetry",
  bedrock: CONNECTORS.bedrock.label,
  "azure-foundry": CONNECTORS["azure-foundry"].label,
  vertex: CONNECTORS.vertex.label,
  "azure-monitor": CONNECTORS["azure-monitor"].label,
  phoenix: CONNECTORS.phoenix.label,
  datadog: CONNECTORS.datadog.label,
  traceloop: CONNECTORS.traceloop.label,
};

const NATIVE_IDS: Platform[] = ["langfuse", "langsmith", "helicone", "otel"];
function isConnectorPlatform(p: Platform): p is ConnectorPlatform {
  return !NATIVE_IDS.includes(p);
}

function MetaRow({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon size={14} className="text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
        <div className="text-gray-800 break-words">{value}</div>
      </div>
    </div>
  );
}

function Chips({ items, mono = false }: { items?: string[]; mono?: boolean }) {
  if (!items?.length) return <span className="text-gray-400 text-sm">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((x) => (
        <span key={x} className={`text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded ${mono ? "font-mono" : ""}`}>
          {x}
        </span>
      ))}
    </div>
  );
}

export function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { agents, updateAgent, restoreSnapshot, deleteAgent, langfuseInstances, langsmithInstances, heliconeInstances, otelInstances } = useData();

  const agent = agents.find((a) => a.id === id);
  const [activeTab, setActiveTab] = useState<Platform>("langfuse");
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadTraces = async (platform: Platform) => {
    if (!agent) return;
    if (isConnectorPlatform(platform)) {
      setTraces([]); setError(null); setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setTraces([]);
    try {
      if (platform === "langfuse") {
        if (!langfuseInstances.length) return setError("No Langfuse instance configured.");
        const results = await Promise.all(langfuseInstances.map((i) => fetchLangfuseTraces(i, agent.slug)));
        setTraces(results.flat().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else if (platform === "langsmith") {
        if (!langsmithInstances.length) return setError("No LangSmith instance configured.");
        const results = await Promise.all(langsmithInstances.map((i) => fetchLangSmithTraces(i, agent.slug)));
        setTraces(results.flat().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else if (platform === "helicone") {
        if (!heliconeInstances.length) return setError("No Helicone instance configured.");
        const results = await Promise.all(heliconeInstances.map((i) => fetchHeliconeTraces(i, agent.slug)));
        setTraces(results.flat().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      } else {
        if (!otelInstances.length) return setError("No OpenTelemetry instance configured.");
        const results = await Promise.all(otelInstances.map((i) => fetchOtelTraces(i, agent.slug)));
        setTraces(results.flat().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch traces");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (agent && agent.platforms.includes(activeTab)) loadTraces(activeTab);
    else { setTraces([]); setError(null); setLoading(false); }
  }, [activeTab, agent?.id]);

  if (!agent) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Agent not found.</p>
        <button onClick={() => navigate("/agents")} className="mt-2 text-sm text-blue-600 hover:underline">Back to agents</button>
      </div>
    );
  }

  const stage = stageOf(agent);
  const target = nextStage(stage);
  const check = target ? checkPromotion(agent, target) : null;

  const handleDelete = async () => { await deleteAgent(agent.id); navigate("/agents"); };

  const handlePromote = async () => {
    if (!target || !check?.ok) return;
    await updateAgent(agent.id, {
      lifecycle: target,
      approvedBy: "you@local",
      approvedAt: new Date().toISOString(),
    });
  };

  const auditEntries = [...(agent.auditLog ?? [])].reverse();
  const snapshotById = new Map((agent.snapshots ?? []).map((s) => [s.id, s]));
  const ACTION_ICON = {
    created: Plus,
    updated: Pencil,
    promoted: ArrowUpCircle,
    demoted: ArrowDownCircle,
    restored: Undo2,
  } as const;
  const ACTION_TONE = {
    created: "text-gray-700 bg-gray-100",
    updated: "text-gray-700 bg-gray-100",
    promoted: "text-emerald-700 bg-emerald-100",
    demoted: "text-amber-700 bg-amber-100",
    restored: "text-blue-700 bg-blue-100",
  } as const;

  return (
    <div className="p-8 max-w-6xl">
      <button
        onClick={() => navigate("/agents")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-5 transition-colors"
      >
        <ArrowLeft size={15} />
        All agents
      </button>

      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{agent.name}</h1>
            <span className={`text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${LIFECYCLE_STYLE[stage]}`}>
              {LIFECYCLE_LABEL[stage]}
            </span>
            {agent.version && <span className="text-xs font-mono text-gray-500">v{agent.version}</span>}
            {(() => {
              const ps = agent.protectionStatus ?? deriveProtectionStatus(agent);
              return (
                <span className={`text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${PROTECTION_CHIP[ps]}`}>
                  {PROTECTION_LABEL[ps]}
                </span>
              );
            })()}
            {agent.riskTier && (
              <span className={`text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${
                agent.riskTier === "high" ? "bg-rose-100 text-rose-800 border-rose-200"
                : agent.riskTier === "medium" ? "bg-amber-100 text-amber-800 border-amber-200"
                : "bg-slate-100 text-slate-700 border-slate-200"
              }`}>Risk: {agent.riskTier}</span>
            )}
          </div>
          <p className="text-sm font-mono text-gray-500 mt-0.5">{agent.slug}</p>
          {agent.capability ? (
            <p className="text-sm text-gray-700 mt-2">{agent.capability}</p>
          ) : agent.description ? (
            <p className="text-sm text-gray-600 mt-2">{agent.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate(`/agents/${agent.id}/edit`)}
            className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Pencil size={14} />
            Edit
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div className="mb-6 border border-red-200 bg-red-50 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-red-800">Delete <strong>{agent.name}</strong>?</p>
          <div className="flex gap-2">
            <button onClick={handleDelete} className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700">Delete</button>
            <button onClick={() => setConfirmDelete(false)} className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {/* Lifecycle / Promotion gate */}
      {target && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <FileCheck2 size={15} />
                Promotion gate
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Promote {LIFECYCLE_LABEL[stage]} <ArrowRight size={11} className="inline" /> {LIFECYCLE_LABEL[target]} once required metadata is in place.
              </p>
            </div>
            <button
              onClick={handlePromote}
              disabled={!check?.ok}
              className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
                check?.ok ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              Promote to {LIFECYCLE_LABEL[target]}
            </button>
          </div>
          {check && !check.ok && (
            <div className="mt-3 flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>Missing required metadata: <strong>{check.missing.join(", ")}</strong></span>
            </div>
          )}
          {check?.ok && (
            <div className="mt-3 flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle2 size={14} />
              All required metadata present.
            </div>
          )}
          {agent.approvedBy && agent.approvedAt && (
            <p className="text-xs text-gray-500 mt-2">
              Last approval: {agent.approvedBy} · {new Date(agent.approvedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Identity & ownership */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Identity & ownership</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MetaRow icon={Users} label="Team" value={agent.team || "—"} />
            <MetaRow icon={Users} label="Owner" value={agent.owner || "—"} />
            <MetaRow icon={Activity} label="On-call" value={agent.oncall || "—"} />
            <MetaRow icon={Tag} label="Created" value={new Date(agent.createdAt).toLocaleDateString()} />
          </div>
        </div>

        {/* Dependencies */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Dependencies</h2>
          <div className="space-y-3">
            <MetaRow icon={Cpu} label="Models / LLMs" value={<Chips items={agent.dependencies?.models} mono />} />
            <MetaRow icon={Wrench} label="Tools / APIs" value={<Chips items={agent.dependencies?.tools} />} />
            <MetaRow icon={Database} label="Data sources" value={<Chips items={agent.dependencies?.dataSources} />} />
            <MetaRow icon={Bot} label="Calls agents" value={<Chips items={agent.dependencies?.agents} mono />} />
          </div>
        </div>

        {/* Access scope & guardrails */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Shield size={14} /> Access scope & guardrails
          </h2>
          <MetaRow icon={Shield} label="Access scope" value={<Chips items={agent.accessScope} mono />} />
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Guardrails</div>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{agent.guardrails || "—"}</p>
          </div>
        </div>

        {/* Compliance */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Compliance</h2>
          <div className="grid grid-cols-2 gap-3">
            <MetaRow icon={FileCheck2} label="Data classification" value={agent.compliance?.dataClassification || "—"} />
            <MetaRow icon={FileCheck2} label="EU AI Act tier" value={agent.compliance?.euAiActTier || "—"} />
            <MetaRow icon={FileCheck2} label="SOC 2 scope" value={agent.compliance?.soc2Scope ? "In scope" : "Out of scope"} />
            <MetaRow icon={FileCheck2} label="Notes" value={agent.compliance?.notes || "—"} />
          </div>
        </div>
      </div>

      {(agent.capabilitySpec?.inputs.length || agent.capabilitySpec?.outputs.length || agent.capabilitySpec?.examples.length) ? (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Structured capability</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Inputs</div>
              <Chips items={agent.capabilitySpec?.inputs} mono />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Outputs</div>
              <Chips items={agent.capabilitySpec?.outputs} mono />
            </div>
          </div>
          {agent.capabilitySpec?.examples?.length ? (
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Example invocations</div>
              <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">
                {agent.capabilitySpec.examples.map((ex, i) => (
                  <li key={i} className="font-mono text-xs">{ex}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">System Prompt</h2>
        <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-48 overflow-auto">
          {agent.systemPrompt}
        </pre>
        {agent.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {agent.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                <Tag size={10} />
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Security & enforcement */}
      <div className="mb-6">
        <SecurityPanel agent={agent} />
      </div>

      {/* Audit log */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <History size={15} />
          Audit log
          <span className="text-xs font-normal text-gray-500">({auditEntries.length})</span>
        </h2>
        {auditEntries.length === 0 ? (
          <p className="text-sm text-gray-500">No events recorded.</p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-auto">
            {auditEntries.map((ev) => {
              const Icon = ACTION_ICON[ev.action];
              const tone = ACTION_TONE[ev.action];
              const snap = ev.snapshotId ? snapshotById.get(ev.snapshotId) : undefined;
              const canRestore = !!snap && ev.action !== "created";
              return (
                <li key={ev.id} className="flex items-start gap-3 text-sm border-b border-gray-100 last:border-b-0 pb-2 last:pb-0">
                  <span className={`mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full ${tone}`}>
                    <Icon size={12} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 capitalize">{ev.action}</span>
                      {ev.summary && <span className="text-gray-600">— {ev.summary}</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {ev.actor} · {new Date(ev.at).toLocaleString()}
                    </div>
                  </div>
                  {canRestore && (
                    <button
                      onClick={async () => {
                        if (confirm(`Restore agent to snapshot from ${new Date(snap!.at).toLocaleString()}? Current state will be saved as a new snapshot.`)) {
                          await restoreSnapshot(agent.id, snap!.id);
                        }
                      }}
                      className="text-xs flex items-center gap-1 text-blue-700 hover:text-blue-900 border border-blue-200 hover:border-blue-300 px-2 py-1 rounded transition-colors"
                      title="Roll back to the state just before this event"
                    >
                      <Undo2 size={11} />
                      Restore
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mb-4">
        {(() => {
          const linkedTabs = ALL_TABS.filter((t) => agent.platforms.includes(t.id));
          if (linkedTabs.length === 0) {
            return (
              <div className="text-center py-12 text-sm text-gray-500 bg-white border border-gray-200 rounded-xl">
                Not linked to any observability platform. Edit the agent to enable tracing.
              </div>
            );
          }
          const currentTab = linkedTabs.find((t) => t.id === activeTab) ?? linkedTabs[0];
          const isConnector = isConnectorPlatform(currentTab.id);
          return (
            <>
              <div className="flex items-center justify-between mb-1">
                <div className="flex border-b border-gray-200 gap-0 overflow-x-auto">
                  {linkedTabs.map(({ id: tabId, label, icon: Icon }) => {
                    const active = currentTab.id === tabId;
                    return (
                      <button
                        key={tabId}
                        onClick={() => setActiveTab(tabId)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                          active ? `${TAB_COLORS[tabId]} -mb-px` : "border-transparent text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        <Icon size={14} />
                        {label}
                      </button>
                    );
                  })}
                </div>
                {!isConnector && (
                  <button
                    onClick={() => loadTraces(currentTab.id)}
                    disabled={loading}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                )}
              </div>

              <div className="pt-4">
                {isConnector ? (
                  <div className="bg-white border border-gray-200 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">
                      {TAB_LABELS[currentTab.id]} ingestion
                    </h3>
                    <p className="text-sm text-gray-600 mb-3">
                      {CONNECTORS[currentTab.id as ConnectorPlatform].ingestionNote}
                    </p>
                    <p className="text-xs text-gray-500">
                      Traces from this platform surface in the registry once the connector forwards spans tagged with
                      <code className="mx-1 text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">{agent.slug}</code>.
                    </p>
                  </div>
                ) : (
                  <TraceList
                    traces={traces}
                    loading={loading}
                    error={error}
                    emptyMsg={`No traces found for "${agent.slug}" on this platform.`}
                  />
                )}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
