import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { useAuth } from "../context/AuthContext";
import { Bot, Shield, Activity, GitBranch } from "lucide-react";

const FEATURES = [
  { icon: Bot, title: "Agent Registry", desc: "Single source of truth for every AI agent in the enterprise" },
  { icon: Shield, title: "Governance", desc: "Enforce ownership, access scopes, and compliance policies" },
  { icon: Activity, title: "Observability", desc: "Unified tracing across Langfuse, LangSmith, Helicone & more" },
  { icon: GitBranch, title: "Lifecycle", desc: "Gated promotion from dev to staging to production" },
];

export function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        if (!name.trim()) {
          setError("Name is required");
          setLoading(false);
          return;
        }
        await signup(email, password, name);
      }
      navigate("/agents");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-brand-50/50 via-white to-purple-50/30">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] bg-gradient-to-br from-brand-50 via-white to-indigo-50 relative overflow-hidden flex-col justify-between p-10 border-r border-gray-100">
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-brand-200/20 rounded-full blur-3xl animate-pulse-soft" />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-purple-200/15 rounded-full blur-3xl animate-pulse-soft" style={{ animationDelay: '1.5s' }} />

        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Logo size={22} className="text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900 tracking-tight">Agent Registry</span>
          </div>
          <p className="text-brand-500/70 text-xs uppercase tracking-widest ml-[52px]">Control Plane</p>
        </div>

        <div className="relative space-y-5">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-4 group">
              <div className="w-10 h-10 rounded-xl bg-white border border-gray-200/80 flex items-center justify-center shrink-0 shadow-sm group-hover:shadow-md group-hover:border-brand-200 transition-all">
                <Icon size={18} className="text-brand-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="relative text-xs text-gray-400">
          Enterprise agent governance for teams building with LLMs.
        </p>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
              <Logo size={16} className="text-white" />
            </div>
            <span className="font-semibold text-gray-900">Agent Registry</span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            {mode === "login" ? "Welcome back" : "Create account"}
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            {mode === "login" ? "Sign in to manage your agent fleet." : "Get started with agent governance."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-all"
                  placeholder="Your name"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-all"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-all"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:from-brand-600 hover:to-brand-700 transition-all shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/30 disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="text-sm text-gray-500 text-center mt-6">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button
                  onClick={() => { setMode("signup"); setError(""); }}
                  className="font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => { setMode("login"); setError(""); }}
                  className="font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
