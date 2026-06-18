import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock, Plus, Pencil, ArrowUpCircle, ArrowDownCircle, RotateCcw, Search, ChevronRight, ChevronDown,
} from "lucide-react";
import { useData } from "../context/DataContext";
import type { AuditAction } from "../types";
import { fmtDate, relativeTime } from "../lib/analytics";
import { PageHeader, FilterPill, EmptyState } from "../components/AnalyticsUI";

interface TLItem {
  id: string;
  action: AuditAction;
  at: string;
  actor: string;
  summary?: string;
  from?: string;
  to?: string;
  agentId: string;
  agentName: string;
  agentSlug: string;
}

const ACTION_META: Record<AuditAction, { verb: string; icon: typeof Plus; tile: string }> = {
  created: { verb: "created", icon: Plus, tile: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  updated: { verb: "updated", icon: Pencil, tile: "bg-blue-50 text-blue-600 ring-blue-100" },
  promoted: { verb: "promoted", icon: ArrowUpCircle, tile: "bg-violet-50 text-violet-600 ring-violet-100" },
  demoted: { verb: "demoted", icon: ArrowDownCircle, tile: "bg-amber-50 text-amber-600 ring-amber-100" },
  restored: { verb: "restored", icon: RotateCcw, tile: "bg-slate-100 text-slate-600 ring-slate-100" },
};

const ACTIONS: (AuditAction | "all")[] = ["all", "created", "updated", "promoted", "demoted", "restored"];
const RANGES = [
  ["today", "Today"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["all", "All time"],
] as const;

function inRange(at: string, range: string): boolean {
  if (range === "all") return true;
  if (!at) return false;
  const t = new Date(at).getTime();
  if (range === "today") return new Date(at).toDateString() === new Date().toDateString();
  const days = range === "7d" ? 7 : 30;
  const diff = Date.now() - t;
  return diff >= 0 && diff <= days * 86400000;
}

const LC_CHIP: Record<string, string> = {
  dev: "bg-slate-100 text-slate-600",
  staging: "bg-blue-50 text-blue-700",
  prod: "bg-emerald-50 text-emerald-700",
  deprecated: "bg-amber-50 text-amber-700",
};

function StatCard({ value, label, tone = "slate" }: { value: number; label: string; tone?: string }) {
  const color: Record<string, string> = {
    slate: "text-slate-900", emerald: "text-emerald-600", violet: "text-violet-600", blue: "text-blue-600",
  };
  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-card">
      <div className={`text-3xl font-bold leading-none ${color[tone]}`}>{value}</div>
      <p className="text-[13px] font-medium text-slate-500 mt-1.5">{label}</p>
    </div>
  );
}

export function EventTimeline() {
  const { agents } = useData();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<AuditAction | "all">("all");
  const [range, setRange] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const items = useMemo<TLItem[]>(
    () =>
      agents
        .flatMap((a) =>
          (a.auditLog ?? []).map((e) => ({
            id: e.id, action: e.action, at: e.at, actor: e.actor, summary: e.summary,
            from: e.from, to: e.to, agentId: a.id, agentName: a.name, agentSlug: a.slug,
          }))
        )
        .sort((x, y) => y.at.localeCompare(x.at)),
    [agents]
  );

  const counts = useMemo(() => ({
    total: items.length,
    created: items.filter((i) => i.action === "created").length,
    promoted: items.filter((i) => i.action === "promoted").length,
    updated: items.filter((i) => i.action === "updated").length,
  }), [items]);

  const actionCounts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const i of items) c[i.action] = (c[i.action] ?? 0) + 1;
    return c;
  }, [items]);

  const filtered = items.filter((i) => {
    if (action !== "all" && i.action !== action) return false;
    if (!inRange(i.at, range)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return i.actor.toLowerCase().includes(q) || i.agentName.toLowerCase().includes(q) ||
      i.agentSlug.toLowerCase().includes(q) || (i.summary ?? "").toLowerCase().includes(q);
  });

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="p-8 max-w-4xl animate-fade-in">
      <PageHeader
        icon={Clock}
        title="Event Timeline"
        subtitle="Complete audit history — every agent change, promotion, demotion, and system event"
      />

      {/* Filters */}
      <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-4 mb-5">
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by actor, agent, or summary…"
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-xs font-semibold text-slate-400 mr-1">Action:</span>
          {ACTIONS.map((a) => (
            <FilterPill key={a} active={action === a} onClick={() => setAction(a)}>
              {a === "all" ? "All" : ACTION_META[a].verb[0].toUpperCase() + ACTION_META[a].verb.slice(1)}
              <span className="ml-1.5 opacity-60">{actionCounts[a] ?? 0}</span>
            </FilterPill>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-400 mr-1">Range:</span>
          {RANGES.map(([key, label]) => (
            <FilterPill key={key} active={range === key} onClick={() => setRange(key)}>{label}</FilterPill>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard value={counts.total} label="Total Events" />
        <StatCard value={counts.created} label="Created Events" tone="emerald" />
        <StatCard value={counts.promoted} label="Promoted Events" tone="violet" />
        <StatCard value={counts.updated} label="Updated Events" tone="blue" />
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <EmptyState>{items.length === 0 ? "No events recorded yet." : "No events match the current filters."}</EmptyState>
      ) : (
        <div className="relative pl-7">
          <div className="absolute left-[14px] top-2 bottom-2 w-px bg-gray-200" />
          <ul className="space-y-3">
            {filtered.map((i) => {
              const meta = ACTION_META[i.action];
              const Icon = meta.icon;
              const isOpen = expanded.has(i.id);
              const hasTransition = i.from && i.to;
              return (
                <li key={i.id} className="relative">
                  <span className={`absolute -left-7 top-3 w-[28px] h-[28px] rounded-full flex items-center justify-center ring-4 ring-white ${meta.tile}`}>
                    <Icon size={14} />
                  </span>
                  <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-4 ml-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-700 leading-snug">
                          <span className="font-mono text-[12px] text-slate-500">{i.actor}</span>{" "}
                          <span className="font-medium">{meta.verb}</span>{" "}
                          <button onClick={() => navigate(`/agents/${i.agentId}`)} className="font-semibold text-indigo-600 hover:underline">
                            {i.agentName}
                          </button>{" "}
                          <span className="font-mono text-[11px] text-slate-400">({i.agentSlug})</span>
                        </p>
                        {hasTransition && (
                          <p className="text-xs text-slate-500 mt-1">{i.from} → {i.to}</p>
                        )}
                        {hasTransition && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${LC_CHIP[i.from!] ?? "bg-slate-100 text-slate-600"}`}>{i.from}</span>
                            <ChevronRight size={11} className="text-slate-300" />
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${LC_CHIP[i.to!] ?? "bg-slate-100 text-slate-600"}`}>{i.to}</span>
                          </div>
                        )}
                        <button onClick={() => toggle(i.id)} className="text-[11px] text-slate-400 hover:text-slate-600 mt-2 inline-flex items-center gap-0.5">
                          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {isOpen ? "Hide details" : "Show details"}
                        </button>
                        {isOpen && (
                          <div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-lg p-3 space-y-1">
                            <p><span className="text-slate-400">Summary:</span> {i.summary ?? "—"}</p>
                            <p><span className="text-slate-400">Actor:</span> <span className="font-mono">{i.actor}</span></p>
                            <p><span className="text-slate-400">When:</span> {fmtDate(i.at)}</p>
                            <p><span className="text-slate-400">Action:</span> {i.action}</p>
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">{relativeTime(i.at)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
