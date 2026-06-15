import { useNavigate, useSearchParams } from "react-router-dom";
import { useData } from "../context/DataContext";
import { AgentForm, emptyAgentForm, formToAgentPatch } from "../components/AgentForm";
import type { Agent, Platform } from "../types";

export function NewAgent() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { addAgent, langfuseInstances, langsmithInstances, heliconeInstances, otelInstances, connectorInstances } = useData();
  const noPlatforms =
    !langfuseInstances.length && !langsmithInstances.length &&
    !heliconeInstances.length && !otelInstances.length &&
    !connectorInstances.length;

  const initial = emptyAgentForm();
  const slugParam = params.get("slug");
  if (slugParam) {
    initial.slug = slugParam;
    initial.name = slugParam.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const platformParam = params.get("platform") as Platform | null;
  if (platformParam && ["langfuse", "langsmith", "helicone", "otel"].includes(platformParam)) {
    initial.platforms = [platformParam];
  }
  const fromDiscovery = !!slugParam;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Register an agent</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Every agent in the enterprise gets a structured, governed record — identity, dependencies, scope, lifecycle.
        </p>
      </div>

      {fromDiscovery && (
        <div className="mb-6 border border-blue-200 bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>Discovered from observability.</strong> Slug pre-filled from a trace name found on <strong>{platformParam}</strong>. Confirm or change before registering.
          </p>
        </div>
      )}

      {noPlatforms && !fromDiscovery && (
        <div className="mb-6 border border-amber-200 bg-amber-50 rounded-lg p-4">
          <p className="text-sm text-amber-800">
            <strong>No observability platforms configured.</strong> Connect Langfuse, LangSmith, Helicone, or OpenTelemetry to ingest behavior signals.
          </p>
        </div>
      )}

      <AgentForm
        initial={initial}
        mode="create"
        submitLabel="Register agent"
        onCancel={() => navigate("/agents")}
        onSubmit={async (v) => {
          const patch = formToAgentPatch(v) as Omit<Agent, "id" | "createdAt" | "userId">;
          const a = await addAgent(patch);
          navigate(`/agents/${a.id}`);
        }}
      />
    </div>
  );
}
