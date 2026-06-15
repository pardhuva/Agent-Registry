"""
Real CrewAI multi-agent app with Langfuse observability.

3 agents collaborate on one task:
    Researcher  -> gathers key facts about the topic
    Writer      -> drafts an article using those facts
    Editor      -> polishes the draft into final output

Tracing: Langfuse v4 sets up the global OpenTelemetry tracer provider, and the
OpenInference instrumentors export every CrewAI agent/task step and every LLM
call to it. The whole run shows up in Langfuse under Tracing -> Traces as one
nested tree.

Run:
    venv312/Scripts/python.exe app.py
"""

import os
import sys

# Make the Windows console UTF-8 so CrewAI's emoji log lines don't error out.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from dotenv import load_dotenv
load_dotenv()

# 1) Initialise Langfuse FIRST. In v4 this registers the global OTel provider
#    that all spans below will be exported through.
from langfuse import get_client
langfuse = get_client()
assert langfuse.auth_check(), "Langfuse auth failed - check your keys in .env"

# 2) Attach instrumentors. CrewAIInstrumentor traces the agent/task/crew steps;
#    OpenAIInstrumentor traces the underlying LLM calls (we use CrewAI's native
#    OpenAI provider below). Spans go to the global provider Langfuse owns.
from openinference.instrumentation.crewai import CrewAIInstrumentor  # type: ignore
from openinference.instrumentation.openai import OpenAIInstrumentor  # type: ignore
CrewAIInstrumentor().instrument()
OpenAIInstrumentor().instrument()

# 3) Now import CrewAI and build the crew.
from crewai import Agent, Task, Crew, LLM

# Free LLM via Groq. We use CrewAI's NATIVE OpenAI provider (model prefix
# "openai/") pointed at Groq's OpenAI-compatible endpoint. This avoids the
# LiteLLM fallback path, which leaks an unsupported "cache_breakpoint" field
# that Groq rejects.
llm = LLM(
    model="llama-3.3-70b-versatile",
    provider="openai",                       # force the native OpenAI SDK provider
    base_url="https://api.groq.com/openai/v1",
    api_key=os.environ["GROQ_API_KEY"],
)

# ── The 3 agents ──────────────────────────────────────────────────────────────
researcher = Agent(
    role="Research Analyst",
    goal="Research the given topic and produce 4-5 concise bullet-point facts",
    backstory=(
        "You are a sharp research analyst who quickly finds the most important "
        "facts about any topic and presents them as clear bullet points."
    ),
    llm=llm,
    verbose=True,
)

writer = Agent(
    role="Content Writer",
    goal="Write a clear, engaging 2-paragraph article based on the research facts",
    backstory=(
        "You are an experienced content writer who turns raw research into "
        "well-structured, readable articles for a general audience."
    ),
    llm=llm,
    verbose=True,
)

editor = Agent(
    role="Senior Editor",
    goal="Polish the article for clarity, grammar, and flow. Return only the final version.",
    backstory=(
        "You are a meticulous senior editor who improves drafts without changing "
        "their meaning, fixing grammar, tone, and sentence structure."
    ),
    llm=llm,
    verbose=True,
)

# ── The 3 tasks (one per agent) ──────────────────────────────────────────────
TOPIC = "About Claude code interpreter and how it compares to other code LLMs and the major models in it "

research_task = Task(
    description=f"Research this topic and list 4-5 key facts:\n{TOPIC}",
    expected_output="A bullet-point list of 4-5 concise facts about the topic.",
    agent=researcher,
)

write_task = Task(
    description=f"Using the research facts, write a 2-paragraph article about:\n{TOPIC}",
    expected_output="A 2-paragraph article written for a general software audience.",
    agent=writer,
    context=[research_task],        # Writer receives the Researcher's output
)

edit_task = Task(
    description="Polish the article for clarity, grammar, and flow.",
    expected_output="The final polished article, ready to publish.",
    agent=editor,
    context=[write_task],           # Editor receives the Writer's output
)

# ── Assemble and run the crew ────────────────────────────────────────────────
# Each agent task runs inside its own named Langfuse trace so the Agent
# Registry can find it by slug (it queries /api/public/traces?name={slug}).
AGENT_TRACES = [
    ("research-analyst", Crew(agents=[researcher], tasks=[research_task], verbose=True)),
    ("content-writer",   Crew(agents=[writer],     tasks=[write_task],    verbose=True)),
    ("senior-editor",    Crew(agents=[editor],      tasks=[edit_task],     verbose=True)),
]

if __name__ == "__main__":
    print("\n========== CREW STARTING ==========\n")
    try:
        final_result = None
        for slug, mini_crew in AGENT_TRACES:
            print(f"\n--- Running: {slug} ---")
            with langfuse.start_as_current_observation(name=slug):
                final_result = mini_crew.kickoff()
        print("\n========== FINAL OUTPUT ==========\n")
        print(final_result)
    finally:
        langfuse.flush()
        print("\n[Traces flushed to Langfuse]")
