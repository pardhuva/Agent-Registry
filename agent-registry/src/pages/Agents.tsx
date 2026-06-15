import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Bot, Layers, Zap, Activity, Radio, Tag, Download, Users, AlertTriangle } from "lucide-react";
import { CONNECTORS } from "../lib/connectors";
import { useData } from "../context/DataContext";
import type { Agent, Platform, LifecycleStage } from "../types";
import { LIFECYCLE_ORDER, LIFECYCLE_STYLE, LIFECYCLE_LABEL, stageOf } from "../lib/lifecycle";
import { duplicateMap } from "../lib/duplicates";
import { deriveProtectionStatus, PROTECTION_LABEL, PROTECTION_CHIP } from "../lib/security";

const CREWAI_AGENTS: Omit<Agent, "id" | "createdAt" | "userId">[] = [
  {
    name: "Research Analyst",
    slug: "research-analyst",
    description: "Researches a topic and produces 4-5 concise bullet-point facts.",
    systemPrompt:
      "You are a sharp research analyst who quickly finds the most important facts about any topic and presents them as clear bullet points.",
    tags: ["research", "crewai"],
    platforms: ["langfuse", "langsmith", "helicone"] as Platform[],
    owner: "pardhuvab@ibaseit.com",
    team: "AI Platform",
    oncall: "#ai-platform",
    version: "1.0.0",
    lifecycle: "dev",
    capability:
      "Accepts a research topic and returns 4-5 concise bullet-point facts using Llama 3.3 70B via Groq.",
    capabilitySpec: {
      inputs: ["topic: string"],
      outputs: ["facts: string[] (4-5 bullet points)"],
      examples: ['Research "Claude code interpreter vs other LLMs" → bullet-point fact list'],
    },
    dependencies: {
      models: ["llama-3.3-70b-versatile"],
      tools: ["Groq API"],
      dataSources: ["LLM parametric knowledge"],
      agents: [],
    },
    accessScope: ["read:web-knowledge"],
    guardrails:
      "Return only factual, verifiable statements. No opinions or speculation. Note knowledge cutoff if relevant.",
    compliance: {
      dataClassification: "public",
      euAiActTier: "minimal",
      soc2Scope: false,
      notes: "No PII processed. Output is publicly shareable research.",
    },
  },
  {
    name: "Fact Checker",
    slug: "fact-checker",
    description: "Verifies research facts and tags each as VERIFIED, UNVERIFIED, or INCORRECT.",
    systemPrompt:
      "You are a meticulous fact-checker with a strong background in journalism. You cross-reference claims against your knowledge and clearly mark any statement that cannot be confirmed or is misleading.",
    tags: ["fact-checking", "crewai"],
    platforms: ["langsmith"] as Platform[],
    owner: "pardhuvab@ibaseit.com",
    team: "AI Platform",
    oncall: "#ai-platform",
    version: "1.0.0",
    lifecycle: "dev",
    capability:
      "Receives bullet-point facts from the Research Analyst and annotates each as VERIFIED, UNVERIFIED, or INCORRECT.",
    capabilitySpec: {
      inputs: ["facts: string[] (bullet points from Research Analyst)"],
      outputs: ["annotated_facts: string[] (each tagged VERIFIED / UNVERIFIED / INCORRECT)"],
      examples: [
        '"Claude supports Python" → [VERIFIED] Claude supports Python',
        '"GPT-4 has 1T parameters" → [UNVERIFIED] GPT-4 has 1T parameters',
      ],
    },
    dependencies: {
      models: ["llama-3.3-70b-versatile"],
      tools: ["Groq API"],
      dataSources: ["LLM parametric knowledge"],
      agents: ["research-analyst"],
    },
    accessScope: ["read:research-output"],
    guardrails:
      "Never fabricate sources. Mark uncertain claims UNVERIFIED, not INCORRECT, unless clearly false.",
    compliance: {
      dataClassification: "public",
      euAiActTier: "minimal",
      soc2Scope: false,
    },
  },
  {
    name: "Content Writer",
    slug: "content-writer",
    description: "Drafts a clear, engaging 2-paragraph article from verified research facts.",
    systemPrompt:
      "You are an experienced content writer who turns raw research into well-structured, readable articles for a general software audience.",
    tags: ["writing", "crewai"],
    platforms: ["langfuse", "langsmith", "helicone"] as Platform[],
    owner: "pardhuvab@ibaseit.com",
    team: "AI Platform",
    oncall: "#ai-platform",
    version: "1.0.0",
    lifecycle: "dev",
    capability:
      "Turns VERIFIED research bullet points into a clear, 2-paragraph article for a software audience.",
    capabilitySpec: {
      inputs: ["verified_facts: string[] (annotated by Fact Checker)"],
      outputs: ["article: string (2 paragraphs, ~200 words)"],
      examples: ["Fact list about Claude → 2-paragraph article for software engineers"],
    },
    dependencies: {
      models: ["llama-3.3-70b-versatile"],
      tools: ["Groq API"],
      dataSources: [],
      agents: ["fact-checker"],
    },
    accessScope: ["read:verified-facts"],
    guardrails:
      "Use only VERIFIED facts from the Fact Checker. Do not invent statistics, quotes, or citations.",
    compliance: {
      dataClassification: "public",
      euAiActTier: "minimal",
      soc2Scope: false,
    },
  },
  {
    name: "Content Critic",
    slug: "content-critic",
    description: "Reviews an article draft and provides numbered improvement suggestions.",
    systemPrompt:
      "You are an editorial critic who reads drafts with a sharp eye for weak arguments, unclear sentences, and missing context. You give concise, numbered improvement suggestions.",
    tags: ["review", "crewai"],
    platforms: ["langsmith"] as Platform[],
    owner: "pardhuvab@ibaseit.com",
    team: "AI Platform",
    oncall: "#ai-platform",
    version: "1.0.0",
    lifecycle: "dev",
    capability:
      "Reads a draft article and returns 3-5 numbered, actionable improvement suggestions covering clarity, depth, and flow.",
    capabilitySpec: {
      inputs: ["article_draft: string"],
      outputs: ["suggestions: string[] (3-5 numbered items)"],
      examples: [
        "2-paragraph article → ['1. Add a concrete example in para 1', '2. Shorten sentence 3 for clarity']",
      ],
    },
    dependencies: {
      models: ["llama-3.3-70b-versatile"],
      tools: ["Groq API"],
      dataSources: [],
      agents: ["content-writer"],
    },
    accessScope: ["read:draft-article"],
    guardrails:
      "Give constructive, specific feedback only. Do not rewrite the article — only suggest changes.",
    compliance: {
      dataClassification: "public",
      euAiActTier: "minimal",
      soc2Scope: false,
    },
  },
  {
    name: "Senior Editor",
    slug: "senior-editor",
    description: "Applies critic feedback and polishes the article for clarity, grammar, and flow.",
    systemPrompt:
      "You are a meticulous senior editor who improves drafts without changing their meaning, fixing grammar, tone, and sentence structure.",
    tags: ["editing", "crewai"],
    platforms: ["langfuse", "langsmith", "helicone"] as Platform[],
    owner: "pardhuvab@ibaseit.com",
    team: "AI Platform",
    oncall: "#ai-platform",
    version: "1.0.0",
    lifecycle: "dev",
    capability:
      "Incorporates Content Critic suggestions and polishes the article for grammar, clarity, and flow. Returns the final publish-ready version.",
    capabilitySpec: {
      inputs: ["article_draft: string", "suggestions: string[]"],
      outputs: ["polished_article: string"],
      examples: ["Draft + 4 critic suggestions → polished, publish-ready article"],
    },
    dependencies: {
      models: ["llama-3.3-70b-versatile"],
      tools: ["Groq API"],
      dataSources: [],
      agents: ["content-writer", "content-critic"],
    },
    accessScope: ["read:draft-article", "read:critic-suggestions"],
    guardrails:
      "Do not change the factual meaning. Apply only valid suggestions from the critic.",
    compliance: {
      dataClassification: "public",
      euAiActTier: "minimal",
      soc2Scope: false,
    },
  },
  {
    name: "SEO Specialist",
    slug: "seo-specialist",
    description: "Optimises an article with relevant keywords and appends a meta description.",
    systemPrompt:
      "You are an SEO expert who improves content discoverability by naturally weaving in high-value search terms, improving headings, and adding a meta description — without making the text feel stuffed or unnatural.",
    tags: ["seo", "crewai"],
    platforms: ["langsmith"] as Platform[],
    owner: "pardhuvab@ibaseit.com",
    team: "AI Platform",
    oncall: "#ai-platform",
    version: "1.0.0",
    lifecycle: "dev",
    capability:
      "Optimises a polished article for search by weaving in relevant keywords and appending a 1-sentence meta description.",
    capabilitySpec: {
      inputs: ["polished_article: string"],
      outputs: ["seo_article: string", "meta_description: string (1 sentence)"],
      examples: ["Polished article about Claude → SEO article + meta description"],
    },
    dependencies: {
      models: ["llama-3.3-70b-versatile"],
      tools: ["Groq API"],
      dataSources: [],
      agents: ["senior-editor"],
    },
    accessScope: ["read:polished-article"],
    guardrails:
      "Do not over-stuff keywords. Keep the text natural and readable. Never add false claims for SEO.",
    compliance: {
      dataClassification: "public",
      euAiActTier: "minimal",
      soc2Scope: false,
    },
  },
  {
    name: "Content Summarizer",
    slug: "content-summarizer",
    description: "Produces a concise 3-sentence TL;DR of the final article.",
    systemPrompt:
      "You are a skilled content summarizer who distills long articles into crisp, accurate summaries that capture the key takeaways.",
    tags: ["summary", "crewai"],
    platforms: ["langsmith"] as Platform[],
    owner: "pardhuvab@ibaseit.com",
    team: "AI Platform",
    oncall: "#ai-platform",
    version: "1.0.0",
    lifecycle: "dev",
    capability:
      "Distills the final SEO-optimised article into a 3-sentence TL;DR summary capturing the key takeaways.",
    capabilitySpec: {
      inputs: ["final_article: string"],
      outputs: ["summary: string (exactly 3 sentences)"],
      examples: ["1000-word SEO article about Claude → 3-sentence TL;DR"],
    },
    dependencies: {
      models: ["llama-3.3-70b-versatile"],
      tools: ["Groq API"],
      dataSources: [],
      agents: ["seo-specialist"],
    },
    accessScope: ["read:final-article"],
    guardrails:
      "Summary must be factually accurate. Do not introduce new claims not present in the article.",
    compliance: {
      dataClassification: "public",
      euAiActTier: "minimal",
      soc2Scope: false,
    },
  },
];

const PLATFORM_ICONS: Record<Platform, typeof Layers> = {
  langfuse: Layers,
  langsmith: Zap,
  helicone: Activity,
  otel: Radio,
  bedrock: CONNECTORS.bedrock.icon,
  "azure-foundry": CONNECTORS["azure-foundry"].icon,
  vertex: CONNECTORS.vertex.icon,
  "azure-monitor": CONNECTORS["azure-monitor"].icon,
  phoenix: CONNECTORS.phoenix.icon,
  datadog: CONNECTORS.datadog.icon,
  traceloop: CONNECTORS.traceloop.icon,
};

const PLATFORM_COLORS: Record<Platform, string> = {
  langfuse: "bg-purple-100 text-purple-700",
  langsmith: "bg-yellow-100 text-yellow-700",
  helicone: "bg-blue-100 text-blue-700",
  otel: "bg-emerald-100 text-emerald-700",
  bedrock: CONNECTORS.bedrock.chip,
  "azure-foundry": CONNECTORS["azure-foundry"].chip,
  vertex: CONNECTORS.vertex.chip,
  "azure-monitor": CONNECTORS["azure-monitor"].chip,
  phoenix: CONNECTORS.phoenix.chip,
  datadog: CONNECTORS.datadog.chip,
  traceloop: CONNECTORS.traceloop.chip,
};

const PLATFORM_LABELS: Record<Platform, string> = {
  langfuse: "Langfuse",
  langsmith: "LangSmith",
  helicone: "Helicone",
  otel: "OTel",
  bedrock: CONNECTORS.bedrock.shortLabel,
  "azure-foundry": CONNECTORS["azure-foundry"].shortLabel,
  vertex: CONNECTORS.vertex.shortLabel,
  "azure-monitor": CONNECTORS["azure-monitor"].shortLabel,
  phoenix: CONNECTORS.phoenix.shortLabel,
  datadog: CONNECTORS.datadog.shortLabel,
  traceloop: CONNECTORS.traceloop.shortLabel,
};

function AgentCard({ agent, duplicateOf }: { agent: Agent; duplicateOf: string[] }) {
  const navigate = useNavigate();
  const stage = stageOf(agent);
  return (
    <div
      className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all"
      onClick={() => navigate(`/agents/${agent.id}`)}
    >
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">{agent.name}</h3>
            <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${LIFECYCLE_STYLE[stage]}`}>
              {LIFECYCLE_LABEL[stage]}
            </span>
            {(() => {
              const ps = agent.protectionStatus ?? deriveProtectionStatus(agent);
              return (
                <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${PROTECTION_CHIP[ps]}`}>
                  {PROTECTION_LABEL[ps]}
                </span>
              );
            })()}
            {agent.version && (
              <span className="text-[10px] font-mono text-gray-500">v{agent.version}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono mt-0.5">{agent.slug}</p>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {agent.platforms.map((p) => {
            const Icon = PLATFORM_ICONS[p];
            return (
              <span key={p} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[p]}`}>
                <Icon size={11} />
                {PLATFORM_LABELS[p]}
              </span>
            );
          })}
        </div>
      </div>

      {(agent.capability || agent.description) && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{agent.capability || agent.description}</p>
      )}

      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
        {agent.team && (
          <span className="inline-flex items-center gap-1">
            <Users size={11} />
            {agent.team}
          </span>
        )}
        {agent.owner && <span className="font-mono truncate">{agent.owner}</span>}
      </div>

      {duplicateOf.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
          <AlertTriangle size={11} />
          Possible duplicate of: <span className="font-mono">{duplicateOf.join(", ")}</span>
        </div>
      )}

      {agent.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              <Tag size={10} />
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Agents() {
  const { agents, addAgent, updateAgent } = useData();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<LifecycleStage | "all">("all");
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);

  async function handleImportCrewAI() {
    setImporting(true);
    const bySlug = new Map(agents.map((a) => [a.slug, a]));
    let added = 0;
    let updated = 0;
    for (const def of CREWAI_AGENTS) {
      const existing = bySlug.get(def.slug);
      if (!existing) {
        await addAgent(def);
        added++;
      } else {
        await updateAgent(existing.id, def, { summary: "Refreshed from CrewAI seed definitions" });
        updated++;
      }
    }
    setImporting(false);
    setImportDone(true);
    setTimeout(() => setImportDone(false), 3000);
    if (added === 0 && updated > 0) {
      alert(`Refreshed ${updated} existing CrewAI agent${updated === 1 ? "" : "s"} with the latest seed definitions.`);
    }
  }

  const dupMap = useMemo(() => duplicateMap(agents), [agents]);

  const filtered = agents.filter((a) => {
    const q = query.toLowerCase();
    const matchQ =
      a.name.toLowerCase().includes(q) ||
      a.slug.toLowerCase().includes(q) ||
      (a.capability ?? "").toLowerCase().includes(q) ||
      (a.team ?? "").toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q));
    const matchStage = stageFilter === "all" || stageOf(a) === stageFilter;
    return matchQ && matchStage;
  });

  const counts = useMemo(() => {
    const c: Record<LifecycleStage | "all", number> = { all: agents.length, dev: 0, staging: 0, prod: 0, deprecated: 0 };
    for (const a of agents) c[stageOf(a)]++;
    return c;
  }, [agents]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
          <p className="text-sm text-gray-500 mt-0.5">The system of record — every agent in the enterprise, registered and governed.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImportCrewAI}
            disabled={importing}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Download size={16} />
            {importDone ? "Imported!" : "Import CrewAI agents"}
          </button>
          <button
            onClick={() => navigate("/agents/new")}
            className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            <Plus size={16} />
            Register agent
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, capability, team, tag"
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>
        <div className="flex gap-1">
          {(["all", ...LIFECYCLE_ORDER] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s as LifecycleStage | "all")}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                stageFilter === s
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {s === "all" ? "All" : LIFECYCLE_LABEL[s as LifecycleStage]}
              <span className="ml-1.5 opacity-60">{counts[s as LifecycleStage | "all"]}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-gray-200 rounded-xl bg-white flex flex-col items-center justify-center py-20 text-center">
          <Bot size={36} className="text-gray-300 mb-3" />
          <h3 className="font-semibold text-gray-900 mb-1">
            {query || stageFilter !== "all" ? "No agents match these filters" : "No agents yet"}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {query || stageFilter !== "all"
              ? "Adjust your search or stage filter."
              : "Register your first agent so it has an owner, scope, and audit trail."}
          </p>
          {!query && stageFilter === "all" && (
            <button
              onClick={() => navigate("/agents/new")}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              Register an agent
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((a) => (
            <AgentCard key={a.id} agent={a} duplicateOf={dupMap.get(a.id) ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}
