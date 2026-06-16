import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { GitBranch, AlertTriangle, RotateCcw, Crosshair, Flag } from "lucide-react";
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
  agent:  { fill: "#1f2937", stroke: "#111827", glow: "rgba(31,41,55,0.3)" },
  model:  { fill: "#3b5bdb", stroke: "#2b4bc8", glow: "rgba(59,91,219,0.25)" },
  tool:   { fill: "#7048e8", stroke: "#5f3dc4", glow: "rgba(112,72,232,0.25)" },
  data:   { fill: "#c27830", stroke: "#a36525", glow: "rgba(194,120,48,0.25)" },
};

const BLAST_COLOR = "#e03131";

const KIND_LABEL: Record<NodeKind, string> = {
  agent: "Agent",
  model: "Model",
  tool: "Tool / API",
  data: "Data source",
};

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
    for (const m of a.dependencies?.models ?? []) {
      addNode(`model:${m}`, m, "model");
      edges.push({ from: `agent:${a.slug}`, to: `model:${m}` });
    }
    for (const t of a.dependencies?.tools ?? []) {
      addNode(`tool:${t}`, t, "tool");
      edges.push({ from: `agent:${a.slug}`, to: `tool:${t}` });
    }
    for (const d of a.dependencies?.dataSources ?? []) {
      addNode(`data:${d}`, d, "data");
      edges.push({ from: `agent:${a.slug}`, to: `data:${d}` });
    }
    for (const c of a.dependencies?.agents ?? []) {
      edges.push({ from: `agent:${a.slug}`, to: `agent:${c}` });
    }
  }

  return { nodes: Array.from(seen.values()), edges };
}

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
    for (const p of reverse.get(cur) ?? []) {
      if (!hit.has(p)) { hit.add(p); stack.push(p); }
    }
  }
  return hit;
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
  const [blastNode, setBlastNode] = useState<string | null>(null);
  const [driftEnabled, setDriftEnabled] = useState(true);
  const dragRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const [dims, setDims] = useState({ w: 900, h: 550 });

  const blastSet = useMemo(() => {
    if (!blastNode) return new Set<string>();
    return getBlastRadius(edgesRef.current, blastNode);
  }, [blastNode]);

  const blastAgents = useMemo(() => {
    if (!blastNode) return [];
    return agents.filter(a => blastSet.has(`agent:${a.slug}`));
  }, [blastNode, blastSet, agents]);

  const initGraph = useCallback(() => {
    const { nodes, edges } = buildGraph(agents, dims.w, dims.h);
    nodesRef.current = nodes;
    edgesRef.current = edges;
    setBlastNode(null);
    setHoveredNode(null);
  }, [agents, dims]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
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

    function resize() {
      canvas!.width = dims.w * dpr;
      canvas!.height = dims.h * dpr;
      canvas!.style.width = dims.w + "px";
      canvas!.style.height = dims.h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    function simulate() {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      if (!nodes.length) return;

      const cx = dims.w / 2;
      const cy = dims.h / 2;

      if (driftEnabled) {
        for (const n of nodes) {
          if (n.pinned) continue;
          // gravity toward center
          n.vx += (cx - n.x) * 0.0005;
          n.vy += (cy - n.y) * 0.0005;
        }

        // repulsion between nodes
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const minDist = a.radius + b.radius + 60;
            if (dist < minDist) {
              const force = (minDist - dist) / dist * 0.05;
              const fx = dx * force;
              const fy = dy * force;
              if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
              if (!b.pinned) { b.vx += fx; b.vy += fy; }
            }
          }
        }

        // edge attraction
        for (const e of edges) {
          const a = nodes.find(n => n.id === e.from);
          const b = nodes.find(n => n.id === e.to);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const target = 120;
          const force = (dist - target) / dist * 0.003;
          if (!a.pinned) { a.vx += dx * force; a.vy += dy * force; }
          if (!b.pinned) { b.vx -= dx * force; b.vy -= dy * force; }
        }

        // apply velocity with damping
        for (const n of nodes) {
          if (n.pinned) continue;
          n.vx *= 0.85;
          n.vy *= 0.85;
          n.x += n.vx;
          n.y += n.vy;
          // boundary
          n.x = Math.max(n.radius + 10, Math.min(dims.w - n.radius - 10, n.x));
          n.y = Math.max(n.radius + 10, Math.min(dims.h - n.radius - 10, n.y));
        }
      }
    }

    function draw() {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const hovered = hoveredNode;
      const blast = blastNode;
      const blastHits = blastSet;

      ctx.clearRect(0, 0, dims.w, dims.h);

      // connected edges for hovered node
      const hoveredEdges = new Set<number>();
      const connectedNodes = new Set<string>();
      if (hovered) {
        connectedNodes.add(hovered);
        edges.forEach((e, i) => {
          if (e.from === hovered || e.to === hovered) {
            hoveredEdges.add(i);
            connectedNodes.add(e.from);
            connectedNodes.add(e.to);
          }
        });
      }

      // draw edges
      edges.forEach((e, i) => {
        const a = nodes.find(n => n.id === e.from);
        const b = nodes.find(n => n.id === e.to);
        if (!a || !b) return;

        const isBlastEdge = blast && (blastHits.has(e.from) || e.from === blast) && (e.to === blast || blastHits.has(e.to));
        const isHoverEdge = hoveredEdges.has(i);
        const dimmed = (hovered && !isHoverEdge) || (blast && !isBlastEdge);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);

        if (isBlastEdge && blast) {
          ctx.strokeStyle = BLAST_COLOR;
          ctx.lineWidth = 2.5;
          ctx.globalAlpha = 0.8;
        } else if (isHoverEdge) {
          ctx.strokeStyle = "#64748b";
          ctx.lineWidth = 2;
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 1;
          ctx.globalAlpha = dimmed ? 0.12 : 0.5;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // draw nodes
      for (const n of nodes) {
        const colors = NODE_COLORS[n.kind];
        const isHovered = hovered === n.id;
        const isBlast = blast === n.id;
        const isImpacted = blast ? blastSet.has(n.id) : false;
        const dimmed = (hovered && !connectedNodes.has(n.id)) || (blast && !isBlast && !isImpacted);

        ctx.globalAlpha = dimmed ? 0.2 : 1;

        // glow for hovered / blast
        if (isHovered || isBlast) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 8, 0, Math.PI * 2);
          ctx.fillStyle = isBlast ? "rgba(224,49,49,0.15)" : colors.glow;
          ctx.fill();
        }

        // node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        if (isImpacted && blast) {
          ctx.fillStyle = BLAST_COLOR;
          ctx.strokeStyle = "#c92a2a";
        } else {
          ctx.fillStyle = colors.fill;
          ctx.strokeStyle = colors.stroke;
        }
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.fill();
        ctx.stroke();

        // label
        const labelY = n.y + n.radius + 16;
        ctx.font = `${isHovered ? "600" : "500"} 11px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = dimmed ? "#94a3b8" : "#334155";
        const displayLabel = n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label;
        ctx.fillText(displayLabel, n.x, labelY);

        ctx.globalAlpha = 1;
      }
    }

    function loop() {
      simulate();
      draw();
      animRef.current = requestAnimationFrame(loop);
    }
    animRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animRef.current);
  }, [dims, hoveredNode, blastNode, blastSet, driftEnabled]);

  // mouse handlers
  const findNodeAt = useCallback((mx: number, my: number): GraphNode | null => {
    for (const n of nodesRef.current) {
      const dx = mx - n.x;
      const dy = my - n.y;
      if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) return n;
    }
    return null;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragRef.current) {
      const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
      if (node) {
        node.x = mx - dragRef.current.offsetX;
        node.y = my - dragRef.current.offsetY;
        node.vx = 0;
        node.vy = 0;
      }
      return;
    }

    const node = findNodeAt(mx, my);
    setHoveredNode(node?.id ?? null);
    canvasRef.current!.style.cursor = node ? "pointer" : "default";
  }, [findNodeAt]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const node = findNodeAt(mx, my);
    if (node) {
      node.pinned = true;
      dragRef.current = { nodeId: node.id, offsetX: mx - node.x, offsetY: my - node.y };
    }
  }, [findNodeAt]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
      if (node) node.pinned = false;
      dragRef.current = null;
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const node = findNodeAt(mx, my);
    if (!node) return;
    if (node.agentId) {
      navigate(`/agents/${node.agentId}`);
    } else {
      setBlastNode(prev => prev === node.id ? null : node.id);
    }
  }, [findNodeAt, navigate]);

  const handleMouseLeave = useCallback(() => {
    setHoveredNode(null);
    if (dragRef.current) {
      const node = nodesRef.current.find(n => n.id === dragRef.current!.nodeId);
      if (node) node.pinned = false;
      dragRef.current = null;
    }
  }, []);

  const blastNodeLabel = blastNode ? nodesRef.current.find(n => n.id === blastNode)?.label : null;

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <GitBranch size={22} />
            Live dependency graph
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Force-directed & self-settling · hover a node to highlight its edges · click a dependency to see blast radius.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setDriftEnabled(d => !d)}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border transition-all ${
              driftEnabled
                ? "bg-brand-50 text-brand-600 border-brand-200 shadow-sm"
                : "text-gray-500 border-gray-200 hover:bg-gray-50"
            }`}
          >
            <Flag size={13} />
            Drift
          </button>
          {blastNode && (
            <button
              onClick={() => setBlastNode(null)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border border-red-200 text-red-600 bg-red-50 shadow-sm"
            >
              <Crosshair size={13} />
              Blast radius
            </button>
          )}
          <button
            onClick={initGraph}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
          >
            <RotateCcw size={13} />
            Re-layout
          </button>
        </div>
      </div>

      {blastNode && blastNodeLabel && (
        <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2 shadow-card">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            Deprecating <strong>{blastNodeLabel}</strong>: <strong>{blastAgents.length}</strong> agent{blastAgents.length === 1 ? "" : "s"} impacted (shown in red).
            {blastAgents.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {blastAgents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/agents/${a.id}`)}
                    className="text-xs font-mono bg-white border border-amber-300 text-amber-800 px-2 py-0.5 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    {a.slug}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="bg-gradient-to-br from-orange-50/40 via-white to-amber-50/30 border border-gray-200/80 rounded-2xl shadow-card overflow-hidden"
        style={{ height: 550 }}
      >
        {nodesRef.current.length === 0 && agents.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            No agents registered yet. Register agents with dependencies to see the graph.
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        )}
      </div>

      <div className="flex items-center gap-5 mt-4 px-1">
        {(["agent", "model", "tool", "data"] as NodeKind[]).map(kind => (
          <span key={kind} className="inline-flex items-center gap-2 text-xs text-gray-600">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: NODE_COLORS[kind].fill }}
            />
            {KIND_LABEL[kind]}
          </span>
        ))}
        {blastNode && (
          <span className="inline-flex items-center gap-2 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: BLAST_COLOR }} />
            Impacted (blast radius)
          </span>
        )}
      </div>
    </div>
  );
}
