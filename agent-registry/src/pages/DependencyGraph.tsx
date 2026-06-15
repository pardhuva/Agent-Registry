import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GitBranch, AlertTriangle, Cpu, Wrench, Database, Bot } from "lucide-react";
import { useData } from "../context/DataContext";
import type { Agent } from "../types";

type NodeKind = "agent" | "model" | "tool" | "data";
interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  agentId?: string;
  x: number;
  y: number;
}
interface GraphEdge {
  from: string;
  to: string;
  kind: NodeKind;
}

const NODE_STYLE: Record<NodeKind, { fill: string; stroke: string; text: string; icon: typeof Cpu }> = {
  agent: { fill: "#1f2937", stroke: "#111827", text: "#ffffff", icon: Bot },
  model: { fill: "#ede9fe", stroke: "#7c3aed", text: "#5b21b6", icon: Cpu },
  tool: { fill: "#dbeafe", stroke: "#2563eb", text: "#1e40af", icon: Wrench },
  data: { fill: "#dcfce7", stroke: "#16a34a", text: "#166534", icon: Database },
};

const KIND_LABEL: Record<NodeKind, string> = {
  agent: "Agent",
  model: "Model / LLM",
  tool: "Tool / API",
  data: "Data source",
};

function buildGraph(agents: Agent[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const cols: Record<NodeKind, string[]> = { agent: [], model: [], tool: [], data: [] };
  for (const a of agents) {
    cols.agent.push(a.slug);
    for (const m of a.dependencies?.models ?? []) if (!cols.model.includes(m)) cols.model.push(m);
    for (const t of a.dependencies?.tools ?? []) if (!cols.tool.includes(t)) cols.tool.push(t);
    for (const d of a.dependencies?.dataSources ?? []) if (!cols.data.includes(d)) cols.data.push(d);
  }

  const colX: Record<NodeKind, number> = { agent: 120, model: 480, tool: 760, data: 1040 };
  const rowH = 56;

  const nodes: GraphNode[] = [];
  (Object.keys(cols) as NodeKind[]).forEach((kind) => {
    cols[kind].forEach((label, i) => {
      const agentId = kind === "agent" ? agents.find((a) => a.slug === label)?.id : undefined;
      nodes.push({
        id: `${kind}:${label}`,
        label,
        kind,
        agentId,
        x: colX[kind],
        y: 80 + i * rowH,
      });
    });
  });

  const edges: GraphEdge[] = [];
  for (const a of agents) {
    const from = `agent:${a.slug}`;
    for (const m of a.dependencies?.models ?? []) edges.push({ from, to: `model:${m}`, kind: "model" });
    for (const t of a.dependencies?.tools ?? []) edges.push({ from, to: `tool:${t}`, kind: "tool" });
    for (const d of a.dependencies?.dataSources ?? []) edges.push({ from, to: `data:${d}`, kind: "data" });
    for (const c of a.dependencies?.agents ?? []) edges.push({ from, to: `agent:${c}`, kind: "agent" });
  }
  return { nodes, edges };
}

export function DependencyGraph() {
  const { agents } = useData();
  const navigate = useNavigate();
  const [focus, setFocus] = useState<string>("");

  const { nodes, edges } = useMemo(() => buildGraph(agents), [agents]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Impact analysis — which agents depend (transitively) on the focused node?
  const impacted = useMemo(() => {
    if (!focus) return new Set<string>();
    const reverse = new Map<string, string[]>();
    for (const e of edges) {
      if (!reverse.has(e.to)) reverse.set(e.to, []);
      reverse.get(e.to)!.push(e.from);
    }
    const seen = new Set<string>();
    const stack = [focus];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const p of reverse.get(cur) ?? []) {
        if (!seen.has(p)) {
          seen.add(p);
          stack.push(p);
        }
      }
    }
    return seen;
  }, [focus, edges]);

  const directHits = useMemo(() => {
    if (!focus) return [];
    return edges.filter((e) => e.to === focus).map((e) => e.from);
  }, [focus, edges]);

  const height = Math.max(600, 80 + Math.max(...Object.values({
    a: agents.length,
    m: new Set(agents.flatMap((a) => a.dependencies?.models ?? [])).size,
    t: new Set(agents.flatMap((a) => a.dependencies?.tools ?? [])).size,
    d: new Set(agents.flatMap((a) => a.dependencies?.dataSources ?? [])).size,
  })) * 56);

  const depOptions = nodes.filter((n) => n.kind !== "agent");

  const focusedAgentsList = focus
    ? agents.filter((a) => impacted.has(`agent:${a.slug}`) || directHits.includes(`agent:${a.slug}`))
    : [];

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <GitBranch size={22} />
          Dependency graph
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Every agent and what it depends on — models, tools, data, and other agents. Pick a node to run impact analysis.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-gray-700">Impact analysis:</label>
          <select
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">— Select a model, tool, or data source —</option>
            {(["model", "tool", "data"] as NodeKind[]).map((k) => {
              const items = depOptions.filter((n) => n.kind === k);
              if (!items.length) return null;
              return (
                <optgroup key={k} label={KIND_LABEL[k]}>
                  {items.map((n) => (
                    <option key={n.id} value={n.id}>{n.label}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {focus && (
            <button onClick={() => setFocus("")} className="text-xs text-gray-500 hover:text-gray-900">Clear</button>
          )}
        </div>

        {focus && (
          <div className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              Deprecating <strong>{nodeById.get(focus)?.label}</strong>: <strong>{directHits.length}</strong> agent{directHits.length === 1 ? "" : "s"} directly affected
              {impacted.size > directHits.length && <>, <strong>{impacted.size}</strong> impacted transitively</>}.
              <div className="mt-1 flex flex-wrap gap-1.5">
                {focusedAgentsList.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/agents/${a.id}`)}
                    className="text-xs font-mono bg-white border border-amber-300 text-amber-800 px-2 py-0.5 rounded hover:bg-amber-100"
                  >
                    {a.slug}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-auto">
        {nodes.length === 0 ? (
          <div className="p-16 text-center text-gray-500 text-sm">
            No agents registered yet. Register agents with dependencies to see the graph.
          </div>
        ) : (
          <svg width={1200} height={height} className="block">
            {/* Column headers */}
            <g fontSize={11} fontFamily="ui-sans-serif, system-ui" fill="#6b7280" fontWeight={600}>
              <text x={120} y={40} textAnchor="middle">AGENTS</text>
              <text x={480} y={40} textAnchor="middle">MODELS</text>
              <text x={760} y={40} textAnchor="middle">TOOLS / APIS</text>
              <text x={1040} y={40} textAnchor="middle">DATA SOURCES</text>
            </g>

            {/* Edges */}
            {edges.map((e, idx) => {
              const from = nodeById.get(e.from);
              const to = nodeById.get(e.to);
              if (!from || !to) return null;
              const dim = focus && !(impacted.has(e.from) || e.to === focus);
              const accent = focus && e.to === focus;
              return (
                <line
                  key={idx}
                  x1={from.x + 60} y1={from.y}
                  x2={to.x - 60} y2={to.y}
                  stroke={accent ? "#dc2626" : "#cbd5e1"}
                  strokeWidth={accent ? 2 : 1}
                  opacity={dim ? 0.15 : 1}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((n) => {
              const s = NODE_STYLE[n.kind];
              const focused = focus === n.id;
              const dim = focus && !focused && !impacted.has(n.id) && n.id !== focus;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x - 60}, ${n.y - 18})`}
                  opacity={dim ? 0.25 : 1}
                  style={{ cursor: n.agentId ? "pointer" : "default" }}
                  onClick={() => {
                    if (n.agentId) navigate(`/agents/${n.agentId}`);
                    else setFocus(n.id === focus ? "" : n.id);
                  }}
                >
                  <rect width={120} height={36} rx={8} ry={8}
                    fill={s.fill}
                    stroke={focused ? "#dc2626" : s.stroke}
                    strokeWidth={focused ? 2 : 1}
                  />
                  <text
                    x={60} y={22} textAnchor="middle"
                    fontSize={11} fontFamily="ui-monospace, monospace"
                    fill={s.text}
                  >
                    {n.label.length > 16 ? n.label.slice(0, 15) + "…" : n.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-gray-600 flex-wrap">
        <Legend kind="agent" />
        <Legend kind="model" />
        <Legend kind="tool" />
        <Legend kind="data" />
      </div>
    </div>
  );
}

function Legend({ kind }: { kind: NodeKind }) {
  const s = NODE_STYLE[kind];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-3 h-3 rounded" style={{ background: s.fill, border: `1px solid ${s.stroke}` }} />
      {KIND_LABEL[kind]}
    </span>
  );
}
