import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScanSearch, RefreshCw, AlertTriangle, Plus, CheckCircle2, Layers, Zap, Activity, Radio, Download, Loader2 } from "lucide-react";
import { useData } from "../context/DataContext";
import { api } from "../lib/api";
import {
  discoverLangfuseAgents, discoverLangSmithAgents, discoverHeliconeAgents, discoverOtelAgents,
  type DiscoveredAgent,
} from "../lib/tracing";
import type { Platform } from "../types";
import { CONNECTORS } from "../lib/connectors";

const PLATFORM_ICON: Record<Platform, typeof Layers> = {
  langfuse: Layers, langsmith: Zap, helicone: Activity, otel: Radio,
  bedrock: CONNECTORS.bedrock.icon,
  "azure-foundry": CONNECTORS["azure-foundry"].icon,
  vertex: CONNECTORS.vertex.icon,
  "azure-monitor": CONNECTORS["azure-monitor"].icon,
  phoenix: CONNECTORS.phoenix.icon,
  datadog: CONNECTORS.datadog.icon,
  traceloop: CONNECTORS.traceloop.icon,
};
const PLATFORM_STYLE: Record<Platform, string> = {
  langfuse: "bg-purple-100 text-purple-700",
  langsmith: "bg-yellow-100 text-yellow-700",
  helicone: "bg-blue-100 text-blue-700",
  otel: "bg-emerald-100 text-emerald-700",
  bedrock: CONNECTORS.bedrock.chip,
  "azure-foundry": CONNECTORS["azure-foundry"].chip,
  vertex: CONNECTORS.vertex.chip,
  "azure-monitor": CONNECTORS["azure-monitor"].chip,
  phoenix: CONNECTORS.phoenix.chip,
  datadog: CONNECTORS.datadog.chip,
  traceloop: CONNECTORS.traceloop.chip,
};

export function Discover() {
  const navigate = useNavigate();
  const { agents, langfuseInstances, langsmithInstances, heliconeInstances, otelInstances } = useData();
  const { refreshAgents } = useData();
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<any>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [results, setResults] = useState<DiscoveredAgent[]>([]);
  const [ran, setRan] = useState(false);

  const noPlatforms =
    !langfuseInstances.length && !langsmithInstances.length &&
    !heliconeInstances.length && !otelInstances.length;

  async function run() {
    setLoading(true);
    setErrors([]);
    const collected: DiscoveredAgent[] = [];
    const errs: string[] = [];

    const tasks: Array<Promise<void>> = [];
    for (const inst of langfuseInstances)
      tasks.push(discoverLangfuseAgents(inst).then((r) => { collected.push(...r); }).catch((e) => { errs.push(`Langfuse / ${inst.name}: ${e.message}`); }));
    for (const inst of langsmithInstances)
      tasks.push(discoverLangSmithAgents(inst).then((r) => { collected.push(...r); }).catch((e) => { errs.push(`LangSmith / ${inst.name}: ${e.message}`); }));
    for (const inst of heliconeInstances)
      tasks.push(discoverHeliconeAgents(inst).then((r) => { collected.push(...r); }).catch((e) => { errs.push(`Helicone / ${inst.name}: ${e.message}`); }));
    for (const inst of otelInstances)
      tasks.push(discoverOtelAgents(inst).then((r) => { collected.push(...r); }).catch((e) => { errs.push(`OTel / ${inst.name}: ${e.message}`); }));

    await Promise.all(tasks);

    setResults(collected);
    setErrors(errs);
    setLoading(false);
    setRan(true);
  }

  async function pullAndReconcile() {
    setPulling(true);
    setPullResult(null);
    try {
      const data = await api.ingestion.pullAll();
      setPullResult(data);
      await refreshAgents();
    } catch (e: any) {
      setErrors((prev) => [...prev, `Ingestion: ${e.message}`]);
    } finally {
      setPulling(false);
    }
  }

  const registeredSlugs = new Set(agents.map((a) => a.slug));
  const unknown = results.filter((r) => !registeredSlugs.has(r.slug));
  const known = results.filter((r) => registeredSlugs.has(r.slug));

  return (
    <div className="p-8 max-w-5xl animate-fade-in">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ScanSearch size={22} />
            Discover unregistered agents
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
            Scan your observability platforms for trace names that don't match any registered agent — the agents that bypassed the registry. Register them to bring them under governance.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={pullAndReconcile}
            disabled={pulling || noPlatforms}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {pulling ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {pulling ? "Pulling…" : "Pull & reconcile"}
          </button>
          <button
            onClick={run}
            disabled={loading || noPlatforms}
            className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {loading ? "Scanning…" : "Scan now"}
          </button>
        </div>
      </div>

      {noPlatforms && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 text-sm text-amber-800">
          Connect a Langfuse, LangSmith, Helicone, or OpenTelemetry instance to enable discovery.
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-4 border border-amber-200 bg-amber-50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 mb-2">
            <AlertTriangle size={14} />
            Some sources errored
          </div>
          <ul className="text-xs text-amber-800 list-disc pl-5 space-y-0.5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {pullResult && (
        <div className="mt-4 border border-emerald-200 bg-emerald-50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 mb-2">
            <CheckCircle2 size={14} />
            Telemetry ingestion complete
          </div>
          <div className="text-xs text-emerald-800 space-y-1">
            {Object.entries(pullResult.platforms || {}).map(([platform, data]: [string, any]) => (
              <div key={platform}>
                <strong className="capitalize">{platform}:</strong>{" "}
                {data.error
                  ? <span className="text-amber-700">{data.error}</span>
                  : <>
                      {data.created?.length || 0} new agents created,{" "}
                      {data.updated?.length || 0} updated,{" "}
                      {data.unchanged?.length || 0} unchanged
                    </>
                }
              </div>
            ))}
          </div>
        </div>
      )}

      {ran && !loading && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <Stat label="Distinct trace names seen" value={results.length} />
          <Stat label="Unregistered (sprawl)" value={unknown.length} tone={unknown.length ? "rose" : "gray"} />
          <Stat label="Already registered" value={known.length} tone="emerald" />
        </div>
      )}

      {ran && !loading && results.length > 0 && (
        <section className="bg-white border border-gray-200/80 rounded-2xl shadow-card">
          <div className="p-5 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Unregistered trace names</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              These slugs are flowing through your platforms but have no registry entry — no owner, no scope, no audit trail.
            </p>
          </div>
          {unknown.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-600" />
              Every trace name in your platforms is registered.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase tracking-wider bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-2">Slug</th>
                  <th className="text-left px-2">Platform</th>
                  <th className="text-left px-2">Source</th>
                  <th className="text-right px-2">Traces</th>
                  <th className="text-left px-2">Last seen</th>
                  <th className="px-5"></th>
                </tr>
              </thead>
              <tbody>
                {unknown.map((d) => {
                  const Icon = PLATFORM_ICON[d.platform];
                  return (
                    <tr key={`${d.platform}:${d.source}:${d.slug}`} className="border-t border-gray-100">
                      <td className="px-5 py-2 font-mono text-gray-900">{d.slug}</td>
                      <td className="px-2">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_STYLE[d.platform]}`}>
                          <Icon size={11} />
                          {d.platform}
                        </span>
                      </td>
                      <td className="px-2 text-gray-600">{d.source}</td>
                      <td className="px-2 text-right text-gray-700">{d.count}</td>
                      <td className="px-2 text-gray-500 text-xs">{new Date(d.lastSeen).toLocaleString()}</td>
                      <td className="px-5 py-2 text-right">
                        <button
                          onClick={() => navigate(`/agents/new?slug=${encodeURIComponent(d.slug)}&platform=${d.platform}`)}
                          className="inline-flex items-center gap-1 text-xs bg-gray-900 text-white px-2.5 py-1 rounded hover:bg-gray-800"
                        >
                          <Plus size={11} />
                          Register
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {!ran && !loading && !noPlatforms && (
        <div className="mt-8 text-center text-sm text-gray-500">
          Click <strong>Scan now</strong> to query your connected platforms.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "gray" }: { label: string; value: number; tone?: "gray" | "emerald" | "rose" }) {
  const toneCls: Record<string, string> = {
    gray: "bg-white border-gray-200 text-gray-900",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
    rose: "bg-rose-50 border-rose-200 text-rose-900",
  };
  return (
    <div className={`border rounded-2xl px-4 py-3 shadow-card ${toneCls[tone]}`}>
      <div className="text-[11px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
