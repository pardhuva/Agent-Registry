import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, AlertTriangle, RotateCcw, Crosshair, Flag, ZoomIn, ZoomOut, Maximize2,
  X, ArrowDown, ExternalLink, ArrowUpRight, ArrowDownRight, Share2,
} from "lucide-react";
import { useData } from "../context/DataContext";
import type { Agent } from "../types";
import { RISK_CHIP } from "../lib/analytics";

type NodeKind = "agent" | "model" | "tool" | "data";

interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  agentId?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pinned: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
}

const NODE_COLORS: Record<NodeKind, { fill: string; stroke: string; glow: string }> = {
  agent: { fill: "#1f2937", stroke: "#111827", glow: "rgba(31,41,55,0.3)" },
  model: { fill: "#3b5bdb", stroke: "#2b4bc8", glow: "rgba(59,91,219,0.25)" },
  tool: { fill: "#7048e8", stroke: "#5f3dc4", glow: "rgba(112,72,232,0.25)" },
  data: { fill: "#c27830", stroke: "#a36525", glow: "rgba(194,120,48,0.25)" },
};

const BLAST_COLOR = "#e03131";
const SELECT_COLOR = "#f97316";

const KIND_LABEL: Record<NodeKind, string> = {
  agent: "Agent",
  model: "Model",
  tool: "Tool / API",
  data: "Data source",
};
const KINDS: NodeKind[] = ["agent", "model", "tool", "data"];

function buildGraph(agents: Agent[], width: number, height: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const seen = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const cx = width / 2;
  const cy = height / 2;
  const spread = Math.min(width, height) * 0.35;

  function addNode(id: string, label: string, kind: NodeKind, agentId?: string) {
    if (seen.has(id)) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = spread * (0.3 + Math.random() * 0.7);
    const radius = kind === "agent" ? 18 : 12;
    seen.set(id, {
      id, label, kind, agentId,
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      vx: 0, vy: 0, radius, pinned: false,
    });
  }

  for (const a of agents) {
    addNode(`agent:${a.slug}`, a.name, "agent", a.id);
    for (const m of a.dependencies?.models ?? []) { addNode(`model:${m}`, m, "model"); edges.push({ from: `agent:${a.slug}`, to: `model:${m}` }); }
    for (const t of a.dependencies?.tools ?? []) { addNode(`tool:${t}`, t, "tool"); edges.push({ from: `agent:${a.slug}`, to: `tool:${t}` }); }
    for (const d of a.dependencies?.dataSources ?? []) { addNode(`data:${d}`, d, "data"); edges.push({ from: `agent:${a.slug}`, to: `data:${d}` }); }
    for (const c of a.dependencies?.agents ?? []) {
      const t = resolveAgent(agents, c);
      if (t) { addNode(`agent:${t.slug}`, t.name, "agent", t.id); edges.push({ from: `agent:${a.slug}`, to: `agent:${t.slug}` }); }
    }
  }
  return { nodes: Array.from(seen.values()), edges };
}

// reverse-reachable set (who would break if `focusId` is deprecated)
function getBlastRadius(edges: GraphEdge[], focusId: string): Set<string> {
  const reverse = new Map<string, string[]>();
  for (const e of edges) {
    if (!reverse.has(e.to)) reverse.set(e.to, []);
    reverse.get(e.to)!.push(e.from);
  }
  const hit = new Set<string>();
  const stack = [focusId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of reverse.get(cur) ?? []) if (!hit.has(p)) { hit.add(p); stack.push(p); }
  }
  return hit;
}

function getConnected(edges: GraphEdge[], focusId: string): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push(e.to);
    adj.get(e.to)!.push(e.from);
  }
  const seen = new Set<string>();
  const stack = [focusId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of adj.get(cur) ?? []) if (n !== focusId && !seen.has(n)) { seen.add(n); stack.push(n); }
  }
  return seen;
}

// ── Card-data derivations (from agents, not positioned nodes) ────────────────

function resolveAgent(agents: Agent[], ref: string): Agent | undefined {
  return agents.find((a) => a.slug === ref || a.name === ref || a.name.toLowerCase() === ref.toLowerCase());
}
function upstreamAgents(agents: Agent[], target: Agent): Agent[] {
  return agents.filter((a) => a.id !== target.id &&
    (a.dependencies?.agents ?? []).some((d) => d === target.slug || d === target.name || d.toLowerCase() === target.name.toLowerCase()));
}
function downstreamRefs(target: Agent): { label: string; kind: NodeKind }[] {
  const d = target.dependencies;
  const refs: { label: string; kind: NodeKind }[] = [];
  (d?.agents ?? []).forEach((x) => refs.push({ label: x, kind: "agent" }));
  (d?.models ?? []).forEach((x) => refs.push({ label: x, kind: "model" }));
  (d?.tools ?? []).forEach((x) => refs.push({ label: x, kind: "tool" }));
  (d?.dataSources ?? []).forEach((x) => refs.push({ label: x, kind: "data" }));
  return refs;
}
function indirectAgents(agents: Agent[], target: Agent, directIds: Set<string>): Agent[] {
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a)!.add(b); };
  for (const a of agents) {
    for (const dep of a.dependencies?.agents ?? []) {
      const t = resolveAgent(agents, dep);
      if (t) { link(a.id, t.id); link(t.id, a.id); }
    }
  }
  const seen = new Set<string>([target.id]);
  const stack = [target.id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of adj.get(cur) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  }
  return agents.filter((a) => a.id !== target.id && seen.has(a.id) && !directIds.has(a.id));
}
function buildPath(agents: Agent[], target: Agent, upstream: Agent[]): string[] {
  const path: string[] = [];
  if (upstream.length) path.push(upstream[0].name);
  path.push(target.name);
  const depAgents = target.dependencies?.agents ?? [];
  if (depAgents.length) {
    const da = resolveAgent(agents, depAgents[0]);
    path.push(da ? da.name : depAgents[0]);
    const refs = da ? downstreamRefs(da).filter((r) => r.kind !== "agent") : [];
    if (refs.length) path.push(refs[0].label);
  } else {
    const refs = downstreamRefs(target).filter((r) => r.kind !== "agent");
    if (refs.length) path.push(refs[0].label);
  }
  return path;
}

export function DependencyGraph() {
  const { agents } = useData();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [blastNode, setBlastNode] = useState<string | null>(null);
  const [driftEnabled, setDriftEnabled] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [visibleKinds, setVisibleKinds] = useState<Set<NodeKind>>(new Set(KINDS));
  const dragRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const [dims, setDims] = useState({ w: 900, h: 550 });

  const edgeList = useMemo(() => buildGraph(agents, 1, 1).edges, [agents]);

  const blastSet = useMemo(() => (blastNode ? getBlastRadius(edgeList, blastNode) : new Set<string>()), [blastNode, edgeList]);
  const blastAgents = useMemo(() => (blastNode ? agents.filter((a) => blastSet.has(`agent:${a.slug}`)) : []), [blastNode, blastSet, agents]);
  const connectedCount = useMemo(() => (selectedNode ? getConnected(edgeList, selectedNode).size : 0), [selectedNode, edgeList]);

  const graphStats = useMemo(() => {
    const set = new Set<string>();
    const kindCount: Record<NodeKind, number> = { agent: 0, model: 0, tool: 0, data: 0 };
    let edges = 0;
    const add = (id: string, kind: NodeKind) => { if (!set.has(id)) { set.add(id); kindCount[kind]++; } };
    for (const a of agents) {
      add(`agent:${a.slug}`, "agent");
      for (const m of a.dependencies?.models ?? []) { add(`model:${m}`, "model"); edges++; }
      for (const t of a.dependencies?.tools ?? []) { add(`tool:${t}`, "tool"); edges++; }
      for (const d of a.dependencies?.dataSources ?? []) { add(`data:${d}`, "data"); edges++; }
      for (const c of a.dependencies?.agents ?? []) { if (resolveAgent(agents, c)) edges++; }
    }
    return { total: set.size, edges, kindCount };
  }, [agents]);

  // Selected-node card data
  const selectedInfo = useMemo(() => {
    if (!selectedNode) return null;
    const idx = selectedNode.indexOf(":");
    const kind = selectedNode.slice(0, idx) as NodeKind;
    const key = selectedNode.slice(idx + 1);
    if (kind === "agent") {
      const agent = resolveAgent(agents, key);
      if (!agent) return null;
      const upstream = upstreamAgents(agents, agent);
      const downstream = downstreamRefs(agent);
      const downAgents = downstream.filter((r) => r.kind === "agent").map((r) => resolveAgent(agents, r.label)).filter(Boolean) as Agent[];
      const directIds = new Set<string>([...upstream.map((a) => a.id), ...downAgents.map((a) => a.id)]);
      const indirect = indirectAgents(agents, agent, directIds);
      const path = buildPath(agents, agent, upstream);
      return { type: "agent" as const, agent, upstream, downstream, indirect, path };
    }
    const list = (a: Agent) => kind === "model" ? a.dependencies?.models : kind === "tool" ? a.dependencies?.tools : a.dependencies?.dataSources;
    const usedBy = agents.filter((a) => (list(a) ?? []).includes(key));
    return { type: "resource" as const, kind, label: key, usedBy };
  }, [selectedNode, agents]);

  const initGraph = useCallback((resetSelection = false) => {
    const { nodes, edges } = buildGraph(agents, dims.w, dims.h);
    nodesRef.current = nodes;
    edgesRef.current = edges;
    if (resetSelection) {
      setBlastNode(null);
      setHoveredNode(null);
      setSelectedNode(null);
    }
  }, [agents, dims]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { initGraph(); }, [initGraph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    canvas.style.width = dims.w + "px";
    canvas.style.height = dims.h + "px";

    function simulate() {
      if (!driftEnabled) return;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      if (!nodes.length) return;
      const cx = dims.w / 2, cy = dims.h / 2;
      for (const n of nodes) { if (n.pinned) continue; n.vx += (cx - n.x) * 0.0005; n.vy += (cy - n.y) * 0.0005; }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = a.radius + b.radius + 60;
          if (dist < minDist) {
            const force = (minDist - dist) / dist * 0.05;
            const fx = dx * force, fy = dy * force;
            if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
            if (!b.pinned) { b.vx += fx; b.vy += fy; }
          }
        }
      }
      for (const e of edges) {
        const a = nodes.find((n) => n.id === e.from);
        const b = nodes.find((n) => n.id === e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 120) / dist * 0.003;
        if (!a.pinned) { a.vx += dx * force; a.vy += dy * force; }
        if (!b.pinned) { b.vx -= dx * force; b.vy -= dy * force; }
      }
      for (const n of nodes) {
        if (n.pinned) continue;
        n.vx *= 0.85; n.vy *= 0.85; n.x += n.vx; n.y += n.vy;
        n.x = Math.max(n.radius + 10, Math.min(dims.w - n.radius - 10, n.x));
        n.y = Math.max(n.radius + 10, Math.min(dims.h - n.radius - 10, n.y));
      }
    }

    function visible(id: string): boolean {
      const k = id.slice(0, id.indexOf(":")) as NodeKind;
      return visibleKinds.has(k);
    }

    function draw() {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const focus = hoveredNode ?? selectedNode;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, dims.w, dims.h);
      const cx = dims.w / 2, cy = dims.h / 2;
      ctx.translate(cx, cy); ctx.scale(zoom, zoom); ctx.translate(-cx, -cy);

      const hoveredEdges = new Set<number>();
      const connectedNodes = new Set<string>();
      if (focus) {
        connectedNodes.add(focus);
        edges.forEach((e, i) => {
          if (e.from === focus || e.to === focus) { hoveredEdges.add(i); connectedNodes.add(e.from); connectedNodes.add(e.to); }
        });
      }

      edges.forEach((e, i) => {
        if (!visible(e.from) || !visible(e.to)) return;
        const a = nodes.find((n) => n.id === e.from);
        const b = nodes.find((n) => n.id === e.to);
        if (!a || !b) return;
        const isBlastEdge = blastNode && (blastSet.has(e.from) || e.from === blastNode) && (e.to === blastNode || blastSet.has(e.to));
        const isHoverEdge = hoveredEdges.has(i);
        const dimmed = (focus && !isHoverEdge) || (blastNode && !isBlastEdge);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (isBlastEdge && blastNode) { ctx.strokeStyle = BLAST_COLOR; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.8; }
        else if (isHoverEdge) { ctx.strokeStyle = "#f97316"; ctx.lineWidth = 2; ctx.globalAlpha = 1; }
        else { ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1; ctx.globalAlpha = dimmed ? 0.12 : 0.5; }
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      for (const n of nodes) {
        if (!visible(n.id)) continue;
        const colors = NODE_COLORS[n.kind];
        const isHovered = hoveredNode === n.id;
        const isSelected = selectedNode === n.id;
        const isBlast = blastNode === n.id;
        const isImpacted = blastNode ? blastSet.has(n.id) : false;
        const dimmed = (focus && !connectedNodes.has(n.id)) || (blastNode && !isBlast && !isImpacted);
        ctx.globalAlpha = dimmed ? 0.2 : 1;

        // concentric rings for selected / blast focus
        if (isSelected || isBlast) {
          const ringColor = isBlast ? BLAST_COLOR : SELECT_COLOR;
          for (let r = 1; r <= 3; r++) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius + r * 12, 0, Math.PI * 2);
            ctx.strokeStyle = ringColor;
            ctx.globalAlpha = 0.28 - r * 0.07;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          ctx.globalAlpha = dimmed ? 0.2 : 1;
        }
        if (isHovered || isSelected || isBlast) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 8, 0, Math.PI * 2);
          ctx.fillStyle = isBlast ? "rgba(224,49,49,0.15)" : isSelected ? "rgba(249,115,22,0.15)" : colors.glow;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        if (isImpacted && blastNode) { ctx.fillStyle = BLAST_COLOR; ctx.strokeStyle = "#c92a2a"; }
        else { ctx.fillStyle = colors.fill; ctx.strokeStyle = isSelected ? SELECT_COLOR : colors.stroke; }
        ctx.lineWidth = isHovered || isSelected ? 3 : 2;
        ctx.fill();
        ctx.stroke();

        const labelY = n.y + n.radius + 16;
        ctx.font = `${isHovered || isSelected ? "600" : "500"} 11px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = dimmed ? "#94a3b8" : "#334155";
        const displayLabel = n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label;
        ctx.fillText(displayLabel, n.x, labelY);
        ctx.globalAlpha = 1;
      }
    }

    function loop() { simulate(); draw(); animRef.current = requestAnimationFrame(loop); }
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [dims, hoveredNode, selectedNode, blastNode, blastSet, driftEnabled, zoom, visibleKinds]);

  const screenToWorld = useCallback((mx: number, my: number) => {
    const cx = dims.w / 2, cy = dims.h / 2;
    return { x: (mx - cx) / zoom + cx, y: (my - cy) / zoom + cy };
  }, [dims, zoom]);

  const findNodeAt = useCallback((mx: number, my: number): GraphNode | null => {
    const w = screenToWorld(mx, my);
    for (const n of nodesRef.current) {
      const k = n.kind;
      if (!visibleKinds.has(k)) continue;
      const dx = w.x - n.x, dy = w.y - n.y;
      if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) return n;
    }
    return null;
  }, [screenToWorld, visibleKinds]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (dragRef.current) {
      const node = nodesRef.current.find((n) => n.id === dragRef.current!.nodeId);
      if (node) { const w = screenToWorld(mx, my); node.x = w.x - dragRef.current.offsetX; node.y = w.y - dragRef.current.offsetY; node.vx = 0; node.vy = 0; }
      return;
    }
    const node = findNodeAt(mx, my);
    setHoveredNode(node?.id ?? null);
    canvasRef.current!.style.cursor = node ? "pointer" : "default";
  }, [findNodeAt, screenToWorld]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const node = findNodeAt(mx, my);
    if (node) { const w = screenToWorld(mx, my); node.pinned = true; dragRef.current = { nodeId: node.id, offsetX: w.x - node.x, offsetY: w.y - node.y }; }
  }, [findNodeAt, screenToWorld]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      const node = nodesRef.current.find((n) => n.id === dragRef.current!.nodeId);
      if (node) node.pinned = false;
      dragRef.current = null;
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const node = findNodeAt(mx, my);
    setSelectedNode(node ? node.id : null);
    if (!node) setBlastNode(null);
  }, [findNodeAt]);

  const handleMouseLeave = useCallback(() => {
    setHoveredNode(null);
    if (dragRef.current) {
      const node = nodesRef.current.find((n) => n.id === dragRef.current!.nodeId);
      if (node) node.pinned = false;
      dragRef.current = null;
    }
  }, []);

  const toggleKind = (k: NodeKind) => setVisibleKinds((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    if (next.size === 0) return new Set(KINDS);
    return next;
  });
  const allVisible = visibleKinds.size === KINDS.length;

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25 shrink-0">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Live dependency graph</h1>
            <p className="text-sm text-slate-500 mt-0.5">Force-directed & self-settling · hover to highlight · click a node to inspect its blast radius.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setDriftEnabled((d) => !d)} className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border transition-all ${driftEnabled ? "bg-orange-500 text-white border-orange-500 shadow-sm" : "text-slate-500 border-gray-200 hover:bg-slate-50"}`}>
            <Flag size={13} /> Drift
          </button>
          <button onClick={() => blastNode ? setBlastNode(null) : selectedNode && setBlastNode(selectedNode)} className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border transition-all ${blastNode ? "bg-red-50 text-red-600 border-red-200 shadow-sm" : "text-slate-500 border-gray-200 hover:bg-slate-50"}`}>
            <Crosshair size={13} /> Blast radius
          </button>
          <button onClick={() => initGraph(true)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border border-gray-200 text-slate-600 hover:bg-slate-50 transition-all">
            <RotateCcw size={13} /> Re-layout
          </button>
        </div>
      </div>

      {blastNode && (
        <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2 shadow-card">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            Deprecating <strong>{selectedInfo?.type === "agent" ? selectedInfo.agent.name : selectedInfo?.type === "resource" ? selectedInfo.label : blastNode}</strong>: <strong>{blastAgents.length}</strong> agent{blastAgents.length === 1 ? "" : "s"} impacted (shown in red).
            {blastAgents.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {blastAgents.map((a) => (
                  <button key={a.id} onClick={() => navigate(`/agents/${a.id}`)} className="text-xs font-mono bg-white border border-amber-300 text-amber-800 px-2 py-0.5 rounded-lg hover:bg-amber-100">{a.slug}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3" style={{ height: 560 }}>
        <div ref={containerRef} className="relative flex-1 bg-gradient-to-br from-orange-50/40 via-white to-amber-50/30 border border-gray-200/80 rounded-2xl shadow-card overflow-hidden">
          {/* type filters */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 flex-wrap max-w-[75%]">
            <button onClick={() => setVisibleKinds(new Set(KINDS))} className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${allVisible ? "bg-slate-900 text-white border-slate-900" : "bg-white/80 text-slate-600 border-gray-200 hover:bg-white"}`}>
              All {graphStats.total}
            </button>
            {KINDS.map((k) => (
              <button key={k} onClick={() => toggleKind(k)} className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${visibleKinds.has(k) && !allVisible ? "bg-white text-slate-800 border-slate-300 shadow-sm" : "bg-white/80 text-slate-600 border-gray-200 hover:bg-white"}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: NODE_COLORS[k].fill }} />
                {KIND_LABEL[k]} {graphStats.kindCount[k]}
              </button>
            ))}
          </div>

          {/* zoom controls */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
            {[
              { icon: ZoomIn, fn: () => setZoom((z) => Math.min(2.2, +(z + 0.2).toFixed(2))) },
              { icon: ZoomOut, fn: () => setZoom((z) => Math.max(0.5, +(z - 0.2).toFixed(2))) },
              { icon: Maximize2, fn: () => setZoom(1) },
            ].map((b, i) => (
              <button key={i} onClick={b.fn} className="w-8 h-8 rounded-lg bg-white/90 border border-gray-200 flex items-center justify-center text-slate-600 hover:bg-white shadow-sm">
                <b.icon size={15} />
              </button>
            ))}
          </div>

          {graphStats.total === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">No agents registered yet. Register agents with dependencies to see the graph.</div>
          ) : (
            <canvas ref={canvasRef} onMouseMove={handleMouseMove} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} onClick={handleClick} style={{ width: "100%", height: "100%", display: "block" }} />
          )}

          {/* stats footer */}
          <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between gap-3 bg-white/70 backdrop-blur-sm border border-gray-200/60 rounded-xl px-3 py-1.5 text-[11px] text-slate-500">
            <span className="truncate">hover a node to preview · click to explore dependencies · “Blast radius” shows what breaks if it's deprecated</span>
            <span className="shrink-0 font-medium text-slate-600">
              {graphStats.total} nodes · {graphStats.edges} edges{selectedNode ? <span className="text-orange-600"> · {connectedCount} connected</span> : ""}
            </span>
          </div>
        </div>

        {/* side card */}
        {selectedInfo && (
          <div className="w-80 shrink-0 bg-white border border-gray-200/80 rounded-2xl shadow-card flex flex-col overflow-hidden">
            {selectedInfo.type === "agent" ? (
              <>
                <div className="bg-slate-900 text-white px-4 py-3 flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Agent</p>
                    <h3 className="text-base font-bold leading-tight">{selectedInfo.agent.name}</h3>
                    <p className="text-[11px] font-mono text-slate-400">{selectedInfo.agent.slug}</p>
                  </div>
                  <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-white"><X size={16} /></button>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Risk level</span>
                    {selectedInfo.agent.riskTier
                      ? <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${RISK_CHIP[selectedInfo.agent.riskTier]}`}>{selectedInfo.agent.riskTier[0].toUpperCase() + selectedInfo.agent.riskTier.slice(1)}</span>
                      : <span className="text-slate-300 text-xs">—</span>}
                  </div>

                  <CardGroup icon={ArrowUpRight} title="Upstream" count={selectedInfo.upstream.length} hint="depend on this">
                    {selectedInfo.upstream.length === 0 ? <Empty>Nothing depends on this agent.</Empty> :
                      selectedInfo.upstream.map((a) => (
                        <Row key={a.id} onClick={() => setSelectedNode(`agent:${a.slug}`)}>
                          <span className="w-2 h-2 rounded-full" style={{ background: NODE_COLORS.agent.fill }} />
                          <span className="flex-1 truncate">{a.name}</span>
                          <span className="text-[10px] text-slate-400">Agent</span>
                        </Row>
                      ))}
                  </CardGroup>

                  <CardGroup icon={ArrowDownRight} title="Downstream" count={selectedInfo.downstream.length} hint="this depends on">
                    {selectedInfo.downstream.length === 0 ? <Empty>No declared dependencies.</Empty> :
                      selectedInfo.downstream.map((r, i) => (
                        <Row key={i} onClick={r.kind === "agent" ? () => { const t = resolveAgent(agents, r.label); if (t) setSelectedNode(`agent:${t.slug}`); } : undefined}>
                          <span className="w-2 h-2 rounded-full" style={{ background: NODE_COLORS[r.kind].fill }} />
                          <span className="flex-1 truncate">{r.label}</span>
                          <span className="text-[10px] text-slate-400">{KIND_LABEL[r.kind]}</span>
                        </Row>
                      ))}
                  </CardGroup>

                  {selectedInfo.indirect.length > 0 && (
                    <CardGroup icon={Share2} title="Indirect" count={selectedInfo.indirect.length} hint="transitively linked">
                      <div className="flex flex-wrap gap-1.5">
                        {selectedInfo.indirect.map((a) => (
                          <button key={a.id} onClick={() => setSelectedNode(`agent:${a.slug}`)} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md hover:bg-indigo-50 hover:text-indigo-600">{a.name}</button>
                        ))}
                      </div>
                    </CardGroup>
                  )}

                  {selectedInfo.path.length > 1 && (
                    <div className="bg-orange-50/60 border border-orange-200/60 rounded-xl p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-700/80 mb-2">Dependency path</p>
                      <div className="space-y-1">
                        {selectedInfo.path.map((p, i) => (
                          <div key={i}>
                            <p className="text-xs font-medium text-slate-700 font-mono">{p}</p>
                            {i < selectedInfo.path.length - 1 && <ArrowDown size={12} className="text-orange-400 ml-1 my-0.5" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <button onClick={() => navigate(`/agents/${selectedInfo.agent.id}`)} className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold bg-slate-900 text-white py-2 rounded-xl hover:bg-slate-800">
                      <ExternalLink size={14} /> View Agent Details
                    </button>
                    <button onClick={() => setBlastNode(selectedNode)} className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold bg-orange-50 text-orange-700 border border-orange-200 py-2 rounded-xl hover:bg-orange-100">
                      <Crosshair size={14} /> Run Blast Radius
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="px-4 py-3 flex items-start justify-between border-b border-gray-100" style={{ background: NODE_COLORS[selectedInfo.kind].fill }}>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/70">{KIND_LABEL[selectedInfo.kind]}</p>
                    <h3 className="text-base font-bold leading-tight text-white break-all">{selectedInfo.label}</h3>
                  </div>
                  <button onClick={() => setSelectedNode(null)} className="text-white/70 hover:text-white"><X size={16} /></button>
                </div>
                <div className="p-4 space-y-4">
                  <CardGroup icon={ArrowUpRight} title="Used by" count={selectedInfo.usedBy.length} hint="agents consuming this">
                    {selectedInfo.usedBy.length === 0 ? <Empty>Not used by any agent.</Empty> :
                      selectedInfo.usedBy.map((a) => (
                        <Row key={a.id} onClick={() => setSelectedNode(`agent:${a.slug}`)}>
                          <span className="w-2 h-2 rounded-full" style={{ background: NODE_COLORS.agent.fill }} />
                          <span className="flex-1 truncate">{a.name}</span>
                          <span className="text-[10px] text-slate-400">Agent</span>
                        </Row>
                      ))}
                  </CardGroup>
                  <button onClick={() => setBlastNode(selectedNode)} className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold bg-orange-50 text-orange-700 border border-orange-200 py-2 rounded-xl hover:bg-orange-100">
                    <Crosshair size={14} /> Run Blast Radius
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* legend */}
      <div className="flex items-center gap-5 mt-4 px-1 flex-wrap">
        {KINDS.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-2 text-xs text-slate-600">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: NODE_COLORS[kind].fill }} />
            {KIND_LABEL[kind]}
          </span>
        ))}
        {blastNode && (
          <span className="inline-flex items-center gap-2 text-xs text-slate-600">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: BLAST_COLOR }} />
            Impacted (blast radius)
          </span>
        )}
      </div>
    </div>
  );
}

function CardGroup({ icon: Icon, title, count, hint, children }: { icon: typeof Share2; title: string; count: number; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={13} className="text-slate-400" />
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-1.5">{count}</span>
        <span className="text-[10px] text-slate-400 ml-auto">{hint}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} className={`w-full flex items-center gap-2 text-xs text-slate-600 px-2 py-1.5 rounded-lg ${onClick ? "hover:bg-slate-50 cursor-pointer" : "cursor-default"}`}>
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-slate-400 px-2 py-1">{children}</p>;
}
