import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radar, Brain, Activity, Eraser, AlertTriangle, ShieldX, RefreshCw, Search, Loader2 } from "lucide-react";
import { useData } from "../context/DataContext";
import { api } from "../lib/api";
import type { SecurityControlId, ThreatFinding } from "../types";
import { SECURITY_CONTROLS } from "../lib/security";

const CONTROL_ICON: Partial<Record<SecurityControlId, typeof Brain>> = {
  model_theft: Brain,
  jailbreak: Activity,
  pii: Eraser,
  firewall: ShieldX,
};

const SEV_CHIP: Record<ThreatFinding["severity"], string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-rose-100 text-rose-800",
};

export function Threats() {
  const { agents } = useData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<SecurityControlId | "all">("all");
  const [query, setQuery] = useState("");
  const [findings, setFindings] = useState<ThreatFinding[]>([]);
  const [scanning, setScanning] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadFindings = useCallback(async () => {
    try {
      const data = await api.threats.list();
      setFindings(data);
    } catch {
      // ignore
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadFindings();
  }, [loadFindings]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const data = await api.threats.scan();
      setFindings(data);
    } catch {
      // fall back to loading existing
      await loadFindings();
    } finally {
      setScanning(false);
    }
  };

  const agentById = new Map(agents.map((a) => [a.id, a]));

  const filtered = findings.filter((f) => {
    if (filter !== "all" && f.control !== filter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    const a = agentById.get(f.agentId);
    return (
      f.summary.toLowerCase().includes(q) ||
      (f.detail ?? "").toLowerCase().includes(q) ||
      (a?.name ?? "").toLowerCase().includes(q) ||
      (a?.slug ?? "").toLowerCase().includes(q)
    );
  });

  const counts = useMemo(() => {
    const c = { all: findings.length, model_theft: 0, jailbreak: 0, pii: 0, firewall: 0 };
    for (const f of findings) (c as Record<string, number>)[f.control] = ((c as Record<string, number>)[f.control] ?? 0) + 1;
    return c;
  }, [findings]);

  const sev = {
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Radar size={22} />
            Threats
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
            Fleet-wide runtime findings — model-theft probing, jailbreak signatures, PII exfiltration trends. The cross-agent view no single observability tool has.
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-1.5 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {scanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {scanning ? "Scanning…" : "Rescan fleet"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Critical" value={sev.critical} tone={sev.critical ? "rose" : "gray"} />
        <Stat label="High" value={sev.high} tone={sev.high ? "orange" : "gray"} />
        <Stat label="Medium" value={sev.medium} tone={sev.medium ? "amber" : "gray"} />
        <Stat label="Low" value={sev.low} />
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search findings or agents"
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        {(["all", "model_theft", "jailbreak", "pii", "firewall"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              filter === c ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {c === "all" ? "All" : SECURITY_CONTROLS.find((sc) => sc.id === c)?.label ?? c}
            <span className="ml-1.5 opacity-60">{(counts as Record<string, number>)[c] ?? 0}</span>
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-500">
          Loading findings…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-500">
          {findings.length === 0
            ? "No threats found. The fleet looks clean — protect agents to keep it that way."
            : "No findings match the current filters."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((f) => {
            const Icon = CONTROL_ICON[f.control] ?? AlertTriangle;
            const a = agentById.get(f.agentId);
            const control = SECURITY_CONTROLS.find((c) => c.id === f.control);
            return (
              <li key={f.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3">
                <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${SEV_CHIP[f.severity]} shrink-0`}>
                  <Icon size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${SEV_CHIP[f.severity]}`}>
                      {f.severity}
                    </span>
                    <span className="text-xs text-gray-500 uppercase tracking-wider">{control?.label ?? f.control}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{f.summary}</p>
                  {f.detail && <p className="text-xs text-gray-600 mt-1">{f.detail}</p>}
                  <div className="text-[11px] text-gray-500 mt-1 flex flex-wrap items-center gap-3">
                    <span>{new Date(f.detectedAt).toLocaleString()}</span>
                    {f.principal && <span>principal: <span className="font-mono">{f.principal}</span></span>}
                    {a && (
                      <button
                        onClick={() => navigate(`/agents/${a.id}`)}
                        className="font-mono text-gray-700 hover:underline"
                      >
                        agent: {a.slug}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "gray" }: { label: string; value: number; tone?: "gray" | "amber" | "orange" | "rose" }) {
  const cls: Record<string, string> = {
    gray: "bg-white border-gray-200 text-gray-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    orange: "bg-orange-50 border-orange-200 text-orange-900",
    rose: "bg-rose-50 border-rose-200 text-rose-900",
  };
  return (
    <div className={`border rounded-xl px-4 py-3 ${cls[tone]}`}>
      <div className="text-[11px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
