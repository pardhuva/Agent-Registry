import { NavLink, useNavigate } from "react-router-dom";
import { Bot, LogOut, Layers, Zap, Activity, Radio, GitBranch, GitMerge, ShieldCheck, ScanSearch, Radar } from "lucide-react";
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
        `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? "bg-gray-100 text-gray-900 font-medium"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`
      }
    >
      <Icon size={16} />
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
    <aside className="fixed left-0 top-0 h-full w-56 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Logo size={22} />
          <span className="font-semibold text-gray-900 text-sm">Agent Registry</span>
        </div>
        <p className="text-[10px] text-gray-500 mt-0.5 ml-7 uppercase tracking-wider">Control Plane</p>
      </div>

      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1">Registry</p>
          <div className="space-y-0.5">
            {REGISTRY_NAV.map((n) => <NavItem key={n.to} {...n} />)}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1">Native LLM observability</p>
          <div className="space-y-0.5">
            {OBS_NATIVE.map((n) => <NavItem key={n.to} {...n} />)}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1">Hyperscaler platforms</p>
          <div className="space-y-0.5">
            {OBS_HYPERSCALER.map((n) => <NavItem key={n.to} {...n} />)}
          </div>
        </div>
      </nav>

      <div className="p-3 border-t border-gray-200">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors w-full"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
