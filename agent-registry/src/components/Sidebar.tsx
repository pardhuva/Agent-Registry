import { NavLink, useNavigate } from "react-router-dom";
import {
  Bot, LogOut, Layers, Zap, Activity, Radio, GitBranch, GitMerge, ShieldCheck, ScanSearch, Radar, Cpu,
  BarChart3, Users, ShieldAlert, Eraser, Network, Clock, TrendingUp,
} from "lucide-react";
import { Logo } from "./Logo";
import { useAuth } from "../context/AuthContext";
import { CONNECTORS, CONNECTOR_ORDER } from "../lib/connectors";

const REGISTRY_NAV = [
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/graph", label: "Dependency graph", icon: GitBranch },
  { to: "/lifecycle", label: "Lifecycle", icon: GitMerge },
  { to: "/governance", label: "Governance", icon: ShieldCheck },
  { to: "/threats", label: "Threats", icon: Radar },
  { to: "/discover", label: "Discover", icon: ScanSearch },
  { to: "/capture", label: "SDK & Gateway", icon: Cpu },
];

const ANALYTICS_NAV = [
  { to: "/observability", label: "Observability", icon: BarChart3 },
  { to: "/user-analytics", label: "User Analytics", icon: Users },
  { to: "/security-center", label: "Security Center", icon: ShieldAlert },
  { to: "/pii-detection", label: "PII Detection", icon: Eraser },
  { to: "/impact-mapping", label: "Impact Mapping", icon: Network },
  { to: "/event-timeline", label: "Event Timeline", icon: Clock },
  { to: "/predictive-analytics", label: "Predictive Analytics", icon: TrendingUp },
];

const OBS_NATIVE = [
  { to: "/langfuse", label: "Langfuse", icon: Layers },
  { to: "/langsmith", label: "LangSmith", icon: Zap },
  { to: "/helicone", label: "Helicone", icon: Activity },
  { to: "/otel", label: "OpenTelemetry", icon: Radio },
  ...CONNECTOR_ORDER.filter((p) => CONNECTORS[p].category === "native").map((p) => ({
    to: `/connectors/${p}`,
    label: CONNECTORS[p].shortLabel,
    icon: CONNECTORS[p].icon,
  })),
];

const OBS_HYPERSCALER = CONNECTOR_ORDER
  .filter((p) => CONNECTORS[p].category === "hyperscaler")
  .map((p) => ({
    to: `/connectors/${p}`,
    label: CONNECTORS[p].shortLabel,
    icon: CONNECTORS[p].icon,
  }));

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Bot }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all duration-200 ${
          isActive
            ? "bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        }`
      }
    >
      <Icon size={16} strokeWidth={1.8} />
      {label}
    </NavLink>
  );
}

export function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] bg-white/70 backdrop-blur-2xl border-r border-slate-200/50 flex flex-col z-10">
      <div className="px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Logo size={18} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-slate-800 text-sm tracking-tight">Agent Registry</span>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-[0.15em]">Control Plane</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 pb-3 space-y-6 overflow-y-auto">
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.15em] px-3 mb-2">Registry</p>
          <div className="space-y-0.5">
            {REGISTRY_NAV.map((n) => <NavItem key={n.to} {...n} />)}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.15em] px-3 mb-2">Governance &amp; Analytics</p>
          <div className="space-y-0.5">
            {ANALYTICS_NAV.map((n) => <NavItem key={n.to} {...n} />)}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.15em] px-3 mb-2">Observability</p>
          <div className="space-y-0.5">
            {OBS_NATIVE.map((n) => <NavItem key={n.to} {...n} />)}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.15em] px-3 mb-2">Hyperscalers</p>
          <div className="space-y-0.5">
            {OBS_HYPERSCALER.map((n) => <NavItem key={n.to} {...n} />)}
          </div>
        </div>
      </nav>

      <div className="px-3 py-3 border-t border-slate-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all duration-200 w-full"
        >
          <LogOut size={16} strokeWidth={1.8} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
