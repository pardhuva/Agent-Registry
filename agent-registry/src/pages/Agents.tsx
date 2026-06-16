import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Bot, Layers, Zap, Activity, Radio, Tag, Download, Users, AlertTriangle, User2 } from "lucide-react";
import { CONNECTORS } from "../lib/connectors";
import { useData } from "../context/DataContext";
import type { Agent, Platform, LifecycleStage } from "../types";
import { LIFECYCLE_ORDER, LIFECYCLE_LABEL, stageOf } from "../lib/lifecycle";
import { duplicateMap } from "../lib/duplicates";
import { deriveProtectionStatus, PROTECTION_LABEL } from "../lib/security";

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
  langfuse: Layers, langsmith: Zap, helicone: Activity, otel: Radio,
  bedrock: CONNECTORS.bedrock.icon, "azure-foundry": CONNECTORS["azure-foundry"].icon,
  vertex: CONNECTORS.vertex.icon, "azure-monitor": CONNECTORS["azure-monitor"].icon,
  phoenix: CONNECTORS.phoenix.icon, datadog: CONNECTORS.datadog.icon, traceloop: CONNECTORS.traceloop.icon,
};

const PLATFORM_CHIP: Record<Platform, string> = {
  langfuse: "bg-violet-100 text-violet-700 ring-violet-200",
  langsmith: "bg-amber-100 text-amber-700 ring-amber-200",
  helicone: "bg-sky-100 text-sky-700 ring-sky-200",
  otel: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  bedrock: "bg-orange-100 text-orange-700 ring-orange-200",
  "azure-foundry": "bg-blue-100 text-blue-700 ring-blue-200",
  vertex: "bg-cyan-100 text-cyan-700 ring-cyan-200",
  "azure-monitor": "bg-blue-100 text-blue-700 ring-blue-200",
  phoenix: "bg-rose-100 text-rose-700 ring-rose-200",
  datadog: "bg-purple-100 text-purple-700 ring-purple-200",
  traceloop: "bg-teal-100 text-teal-700 ring-teal-200",
};

const PLATFORM_LABELS: Record<Platform, string> = {
  langfuse: "Langfuse", langsmith: "LangSmith", helicone: "Helicone", otel: "OTel",
  bedrock: CONNECTORS.bedrock.shortLabel, "azure-foundry": CONNECTORS["azure-foundry"].shortLabel,
  vertex: CONNECTORS.vertex.shortLabel, "azure-monitor": CONNECTORS["azure-monitor"].shortLabel,
  phoenix: CONNECTORS.phoenix.shortLabel, datadog: CONNECTORS.datadog.shortLabel, traceloop: CONNECTORS.traceloop.shortLabel,
};

const STAGE_CHIP: Record<LifecycleStage, string> = {
  dev: "bg-blue-500 text-white",
  staging: "bg-amber-500 text-white",
  prod: "bg-emerald-500 text-white",
  deprecated: "bg-slate-400 text-white",
};

const PROTECTION_STYLE: Record<string, string> = {
  unprotected: "bg-rose-100 text-rose-700 ring-rose-200",
  awaiting_event: "bg-amber-100 text-amber-700 ring-amber-200",
  protected: "bg-emerald-100 text-emerald-700 ring-emerald-200",
};

function AgentCard({ agent, duplicateOf }: { agent: Agent; duplicateOf: string[] }) {
  const navigate = useNavigate();
  const stage = stageOf(agent);
  const ps = agent.protectionStatus ?? deriveProtectionStatus(agent);

  return (
    <div
      className="group bg-white rounded-2xl border border-slate-200/60 p-5 cursor-pointer hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1 transition-all duration-300"
      onClick={() => navigate(`/agents/${agent.id}`)}
    >
      {/* Row 1: Name + version + lifecycle */}
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="font-bold text-slate-800 text-[15px] group-hover:text-indigo-600 transition-colors leading-tight">
          {agent.name}
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          {agent.version && (
            <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md ring-1 ring-slate-200/60">
              v{agent.version}
            </span>
          )}
          <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-lg ${STAGE_CHIP[stage]}`}>
            {LIFECYCLE_LABEL[stage]}
          </span>
        </div>
      </div>

      {/* Row 2: Slug */}
      <p className="text-xs text-slate-400 font-mono mb-3">{agent.slug}</p>

      {/* Duplicate warning */}
      {duplicateOf.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-200/60 rounded-lg px-3 py-2 mb-3">
          <AlertTriangle size={12} />
          Possible duplicate of <span className="font-semibold">{duplicateOf.join(", ")}</span>
        </div>
      )}

      {/* Row 3: Description */}
      {(agent.capability || agent.description) && (
        <p className="text-sm text-slate-500 leading-relaxed mb-4 line-clamp-2">
          {agent.capability || agent.description}
        </p>
      )}

      {/* Row 4: Platform chips + protection */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {agent.platforms.map((p) => {
          const Icon = PLATFORM_ICONS[p];
          return (
            <span key={p} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1 ${PLATFORM_CHIP[p]}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
              {PLATFORM_LABELS[p]}
            </span>
          );
        })}
        <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${PROTECTION_STYLE[ps]}`}>
          {PROTECTION_LABEL[ps]}
        </span>
      </div>

      {/* Row 5: Team + owner + tags */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shrink-0">
            <User2 size={13} className="text-slate-400" />
          </div>
          <div className="min-w-0">
            {agent.team && <p className="text-xs font-semibold text-slate-700 truncate">{agent.team}</p>}
            {agent.owner && <p className="text-[11px] text-slate-400 truncate">{agent.owner}</p>}
          </div>
        </div>
        {agent.tags.length > 0 && (
          <div className="flex gap-1 shrink-0">
            {agent.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
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
    <div className="p-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
            <Bot size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Agents</h1>
            <p className="text-sm text-slate-400 mt-0.5">The system of record — every agent in the enterprise, registered and governed.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImportCrewAI}
            disabled={importing}
            className="flex items-center gap-2 border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-white hover:shadow-sm transition-all disabled:opacity-50"
          >
            <Download size={15} />
            {importDone ? "Imported!" : "Import CrewAI agents"}
          </button>
          <button
            onClick={() => navigate("/agents/new")}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:from-indigo-600 hover:to-violet-600 transition-all shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30"
          >
            <Plus size={15} />
            Register agent
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-lg">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, capability, team, tag..."
            className="w-full bg-white border border-slate-200/60 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all shadow-sm"
          />
        </div>
        <div className="flex items-center bg-white rounded-xl border border-slate-200/60 p-1 shadow-sm">
          {(["all", ...LIFECYCLE_ORDER] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s as LifecycleStage | "all")}
              className={`text-xs font-semibold px-3.5 py-2 rounded-lg transition-all ${
                stageFilter === s
                  ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/20"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {s === "all" ? "All" : LIFECYCLE_LABEL[s as LifecycleStage]}
              <span className={`ml-1.5 ${stageFilter === s ? "text-white/70" : "text-slate-400"}`}>
                {counts[s as LifecycleStage | "all"]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid or empty */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200/60 flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center mb-4">
            <Bot size={28} className="text-slate-300" />
          </div>
          <h3 className="font-bold text-slate-700 mb-1">
            {query || stageFilter !== "all" ? "No agents match these filters" : "No agents yet"}
          </h3>
          <p className="text-sm text-slate-400 mb-5 max-w-sm">
            {query || stageFilter !== "all"
              ? "Adjust your search or stage filter."
              : "Register your first agent so it has an owner, scope, and audit trail."}
          </p>
          {!query && stageFilter === "all" && (
            <button
              onClick={() => navigate("/agents/new")}
              className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/25"
            >
              Register an agent
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((a) => (
            <AgentCard key={a.id} agent={a} duplicateOf={dupMap.get(a.id) ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}
