import { useState } from "react";
import { Radio, Plus, Trash2, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useData } from "../context/DataContext";
import type { OtelInstance } from "../types";

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  raw.split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k && v) out[k] = v;
    }
  });
  return out;
}

async function testOtel(inst: Omit<OtelInstance, "id" | "userId">): Promise<string> {
  const headers = { "Content-Type": "application/json", ...parseHeaders(inst.headers) };
  const base = inst.queryUrl.replace(/\/$/, "");
  let url = base;
  if (inst.backend === "jaeger") url = `${base}/api/services`;
  else if (inst.backend === "tempo") url = `${base}/api/echo`;
  else url = `${base}/v1/traces?limit=1`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return "Connected successfully";
}

export function OtelPage() {
  const { otelInstances, addOtel, removeOtel } = useData();

  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("http://localhost:4318");
  const [backend, setBackend] = useState<OtelInstance["backend"]>("jaeger");
  const [queryUrl, setQueryUrl] = useState("http://localhost:16686");
  const [serviceName, setServiceName] = useState("agent-registry");
  const [headersText, setHeadersText] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setEndpoint("http://localhost:4318");
    setBackend("jaeger");
    setQueryUrl("http://localhost:16686");
    setServiceName("agent-registry");
    setHeadersText("");
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await testOtel({ name, endpoint, backend, queryUrl, serviceName, headers: headersText });
      setTestResult({ ok: true, msg });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : "Connection failed" });
    } finally {
      setTesting(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      await testOtel({ name, endpoint, backend, queryUrl, serviceName, headers: headersText });
      await addOtel({
        name: name || "OpenTelemetry",
        endpoint,
        backend,
        queryUrl,
        serviceName,
        headers: headersText,
      });
      reset();
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : "Connection failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Radio size={20} className="text-emerald-600" />
        <h1 className="text-2xl font-bold text-gray-900">OpenTelemetry instances</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Configure an OTLP exporter endpoint and connect a query backend (Jaeger, Tempo, or any OTLP-HTTP service) to view spans per agent.
      </p>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-1.5">
          <span className="text-base">⚡</span> Add instance
        </h2>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Production OTel"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Backend</label>
              <select
                value={backend}
                onChange={(e) => setBackend(e.target.value as OtelInstance["backend"])}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="jaeger">Jaeger</option>
                <option value="tempo">Grafana Tempo</option>
                <option value="otlp-http">Generic OTLP-HTTP</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">OTLP exporter endpoint</label>
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="http://localhost:4318"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Query URL</label>
              <input
                value={queryUrl}
                onChange={(e) => setQueryUrl(e.target.value)}
                placeholder="http://localhost:16686"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Service name</label>
            <input
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="agent-registry"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Headers (optional, one per line)</label>
            <textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              rows={2}
              placeholder="Authorization: Bearer …&#10;X-Org-ID: …"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
            <strong>Tracing setup:</strong> Configure your agent's OTLP exporter to point at the endpoint above and set the span name to the agent slug.
            Spans will be queryable per agent here.
          </div>

          {testResult && (
            <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${testResult.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {testResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {testResult.msg}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add &amp; test
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !queryUrl}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {testing && <Loader2 size={14} className="animate-spin" />}
              Test only
            </button>
          </div>
        </form>
      </div>

      <h2 className="text-sm font-semibold text-gray-900 mb-3">Connected</h2>
      {otelInstances.length === 0 ? (
        <div className="border border-gray-200 rounded-2xl bg-white px-5 py-8 text-center text-sm text-gray-500">
          No instances yet.
        </div>
      ) : (
        <div className="space-y-2">
          {otelInstances.map((inst) => (
            <div key={inst.id} className="bg-white border border-gray-200 rounded-2xl px-5 py-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">{inst.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {inst.backend} · service: <span className="font-mono">{inst.serviceName}</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{inst.endpoint} → {inst.queryUrl}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={11} /> Connected
                </span>
                <button
                  onClick={async () => await removeOtel(inst.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
