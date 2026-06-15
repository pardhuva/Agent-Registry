import { useState } from "react";
import { Plus, Trash2, Info, CheckCircle2 } from "lucide-react";
import { useData } from "../context/DataContext";
import type { ConnectorPlatform } from "../types";
import { CONNECTORS } from "../lib/connectors";

export function ConnectorPage({ platform }: { platform: ConnectorPlatform }) {
  const spec = CONNECTORS[platform];
  const { connectorInstances, addConnector, removeConnector } = useData();
  const instances = connectorInstances.filter((c) => c.platform === platform);

  const [name, setName] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const Icon = spec.icon;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Instance name is required.");
    for (const f of spec.fields) {
      if (f.required && !(fields[f.key] ?? "").trim()) {
        return setError(`${f.label} is required.`);
      }
    }
    setError("");
    await addConnector({ platform, name: name.trim(), fields });
    setName("");
    setFields({});
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${spec.chip}`}>
          <Icon size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{spec.label}</h1>
          <p className="text-xs uppercase tracking-wider text-gray-500">
            {spec.category === "hyperscaler" ? "Hyperscaler agent platform" : "Native LLM observability"}
          </p>
        </div>
      </div>
      <p className="text-sm text-gray-600 mt-3 mb-6 max-w-2xl">{spec.description}</p>

      <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 mb-6 flex items-start gap-2">
        <Info size={15} className="text-blue-700 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-900">
          <strong>How ingestion works.</strong> {spec.ingestionNote}
        </p>
      </div>

      <section className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Add a connection</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instance name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder={`${spec.shortLabel} prod`}
              required
            />
          </div>
          {spec.fields.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {f.label} {f.required ? "*" : ""}
              </label>
              <input
                type={f.type ?? "text"}
                value={fields[f.key] ?? ""}
                onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder={f.placeholder}
                required={f.required}
              />
            </div>
          ))}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          {savedFlash && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <CheckCircle2 size={14} />
              Connection saved.
            </p>
          )}

          <button
            type="submit"
            className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            <Plus size={15} />
            Add connection
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Configured connections <span className="font-normal text-gray-500">({instances.length})</span>
        </h2>
        {instances.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
            No {spec.shortLabel} connections yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {instances.map((inst) => (
              <li key={inst.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{inst.name}</p>
                  <div className="text-xs text-gray-500 mt-1 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5">
                    {spec.fields.map((f) => {
                      const v = inst.fields[f.key];
                      if (!v) return null;
                      const display = f.type === "password" ? "•".repeat(Math.min(12, v.length)) : v;
                      return (
                        <div key={f.key} className="truncate">
                          <span className="text-gray-400">{f.label}:</span>{" "}
                          <span className="font-mono">{display}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (confirm(`Remove "${inst.name}"?`)) await removeConnector(inst.id);
                  }}
                  className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 px-2 py-1 rounded-lg transition-colors shrink-0"
                >
                  <Trash2 size={12} />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
