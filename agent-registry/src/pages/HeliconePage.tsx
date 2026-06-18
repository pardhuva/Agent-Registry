import { useState } from "react";
import { Activity, Plus, Trash2, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useData } from "../context/DataContext";
import type { HeliconeInstance } from "../types";

async function testHelicone(inst: Omit<HeliconeInstance, "id" | "userId">): Promise<string> {
  const res = await fetch("https://www.helicone.ai/api/v1/request?limit=1", {
    headers: {
      Authorization: `Bearer ${inst.apiKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return "Connected successfully";
}

export function HeliconePage() {
  const { heliconeInstances, addHelicone, removeHelicone } = useData();

  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setApiKey("");
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await testHelicone({ name, apiKey });
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
      await testHelicone({ name, apiKey });
      await addHelicone({ name: name || "Helicone", apiKey });
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
        <Activity size={20} className="text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Helicone instances</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">Connect your Helicone account to monitor LLM costs, latency, and request traces.</p>

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
                placeholder="My Helicone"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-helicone-…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
            <strong>Tracing setup:</strong> When using an agent registered here, pass the <code className="bg-white px-1 rounded">Helicone-Property-Agent</code> header with the agent slug in your LLM calls.
            Helicone will automatically group and trace requests by agent.
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
              disabled={testing || !apiKey}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {testing && <Loader2 size={14} className="animate-spin" />}
              Test only
            </button>
          </div>
        </form>
      </div>

      <h2 className="text-sm font-semibold text-gray-900 mb-3">Connected</h2>
      {heliconeInstances.length === 0 ? (
        <div className="border border-gray-200 rounded-2xl bg-white px-5 py-8 text-center text-sm text-gray-500">
          No instances yet.
        </div>
      ) : (
        <div className="space-y-2">
          {heliconeInstances.map((inst) => (
            <div key={inst.id} className="bg-white border border-gray-200 rounded-2xl px-5 py-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 text-sm">{inst.name || "Helicone"}</p>
                <p className="text-xs text-gray-500 mt-0.5">helicone.ai</p>
                <p className="text-xs font-mono text-gray-400 mt-0.5">{inst.apiKey.slice(0, 12)}…</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={11} /> Connected
                </span>
                <button
                  onClick={async () => await removeHelicone(inst.id)}
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
