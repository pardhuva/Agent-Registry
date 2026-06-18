import { useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 shrink-0">
          <Icon size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

const TONE: Record<string, { tile: string; icon: string; value: string }> = {
  slate: { tile: "bg-slate-100", icon: "text-slate-500", value: "text-slate-900" },
  indigo: { tile: "bg-indigo-50", icon: "text-indigo-500", value: "text-indigo-700" },
  emerald: { tile: "bg-emerald-50", icon: "text-emerald-500", value: "text-emerald-700" },
  amber: { tile: "bg-amber-50", icon: "text-amber-500", value: "text-amber-700" },
  rose: { tile: "bg-rose-50", icon: "text-rose-500", value: "text-rose-700" },
  violet: { tile: "bg-violet-50", icon: "text-violet-500", value: "text-violet-700" },
};

export function KpiCard({
  icon: Icon,
  label,
  value,
  tone = "slate",
  highlight = false,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: keyof typeof TONE;
  highlight?: boolean;
}) {
  const t = TONE[tone] ?? TONE.slate;
  return (
    <div
      className={`rounded-2xl p-4 shadow-card border ${
        highlight ? "bg-amber-50/40 border-amber-200" : "bg-white border-gray-200/80"
      }`}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${t.tile}`}>
          <Icon size={16} className={t.icon} />
        </span>
        <span className="text-[13px] font-medium text-slate-500">{label}</span>
      </div>
      <div className={`text-3xl font-bold leading-none ${t.value}`}>{value}</div>
    </div>
  );
}

export function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg border transition-colors ${
        active
          ? "bg-indigo-500 text-white border-indigo-500 shadow-sm"
          : "border-gray-200 text-slate-600 hover:bg-slate-50 hover:border-indigo-200"
      }`}
    >
      {children}
    </button>
  );
}

export function SectionTitle({
  icon: Icon,
  children,
  count,
}: {
  icon: LucideIcon;
  children: ReactNode;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={15} className="text-slate-400" />
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.12em]">{children}</h2>
      {count !== undefined && (
        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{count}</span>
      )}
    </div>
  );
}

export type SortDir = "asc" | "desc";

export function useSort<T>(
  items: T[],
  initialKey: string,
  initialDir: SortDir,
  getValue: (item: T, key: string) => number | string
) {
  const [key, setKey] = useState(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);

  const sorted = [...items].sort((a, b) => {
    const va = getValue(a, key);
    const vb = getValue(b, key);
    if (va < vb) return dir === "asc" ? -1 : 1;
    if (va > vb) return dir === "asc" ? 1 : -1;
    return 0;
  });

  const toggle = (k: string) => {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setKey(k); setDir("desc"); }
  };

  return { sorted, key, dir, toggle };
}

export function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
  pad = "px-3 py-2",
}: {
  label: string;
  sortKey: string;
  activeKey: string;
  dir: SortDir;
  onSort: (key: string) => void;
  align?: "left" | "right";
  pad?: string;
}) {
  const active = activeKey === sortKey;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`${pad} font-semibold cursor-pointer select-none hover:text-slate-600 ${align === "right" ? "text-right" : ""}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        <Icon size={11} className={active ? "text-indigo-500" : "text-slate-300"} />
      </span>
    </th>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl shadow-card p-12 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}
