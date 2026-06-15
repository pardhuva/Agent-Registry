import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useData } from "../context/DataContext";
import { AgentForm, agentToForm, formToAgentPatch } from "../components/AgentForm";
import { stageOf, LIFECYCLE_LABEL, LIFECYCLE_STYLE } from "../lib/lifecycle";

export function EditAgent() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { agents, updateAgent } = useData();

  const agent = agents.find((a) => a.id === id);
  if (!agent) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Agent not found.</p>
        <button onClick={() => navigate("/agents")} className="mt-2 text-sm text-blue-600 hover:underline">Back to agents</button>
      </div>
    );
  }
  const stage = stageOf(agent);

  return (
    <div className="p-8 max-w-3xl">
      <button
        onClick={() => navigate(`/agents/${agent.id}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-5 transition-colors"
      >
        <ArrowLeft size={15} />
        Back to {agent.name}
      </button>

      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Edit agent</h1>
        <span className={`text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${LIFECYCLE_STYLE[stage]}`}>
          {LIFECYCLE_LABEL[stage]}
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Fill in any metadata the promotion gate is asking for — owner, on-call, guardrails, compliance, links to observability.
      </p>

      <AgentForm
        initial={agentToForm(agent)}
        mode="edit"
        submitLabel="Save changes"
        onCancel={() => navigate(`/agents/${agent.id}`)}
        onSubmit={async (v) => {
          await updateAgent(agent.id, formToAgentPatch(v));
          navigate(`/agents/${agent.id}`);
        }}
      />
    </div>
  );
}
