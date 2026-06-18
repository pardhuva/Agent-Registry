"""
CrewAI multi-agent app routed through the IBaseIT Gateway.

Identical to app.py EXCEPT every LLM call goes through:
    http://localhost:8001/v1   (IBaseIT gateway)
instead of:
    https://api.groq.com/openai/v1   (Groq directly)

The gateway:
  1. Fetches the agent's policy from the registry
  2. Inspects the prompt (regex + LLM classifier)
  3. Blocks if firewall/jailbreak policy says so — Groq is NEVER called
  4. Forwards clean prompts to Groq and returns the response
  5. Reports any threats back to the registry in real time

Every agent has its own slug so the gateway applies the right policy per agent.

Run:
    venv312/Scripts/python.exe app_gateway.py

.env keys needed (same as app.py, plus one new one):
    GROQ_API_KEY
    LANGFUSE_SECRET_KEY
    LANGFUSE_PUBLIC_KEY
    LANGFUSE_BASE_URL
    IBASEIT_REGISTRY_TOKEN   <- JWT from the registry login
                                Get it: open the app in browser, F12 -> Console
                                -> localStorage.getItem("ar_token")
                                Then add to .env:  IBASEIT_REGISTRY_TOKEN=<paste here>
"""

import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from dotenv import load_dotenv
load_dotenv()

# ── Registry token (gateway uses this to look up the agent's policy) ──────────
REGISTRY_TOKEN = os.environ.get("IBASEIT_REGISTRY_TOKEN", "")
if not REGISTRY_TOKEN:
    print(
        "\n[WARNING] IBASEIT_REGISTRY_TOKEN not set in .env.\n"
        "  The gateway will still intercept calls but cannot load your agent's\n"
        "  policy — it will only apply baseline jailbreak blocking.\n"
        "  To get the token: open the app in browser, F12 -> Console tab ->\n"
        "    localStorage.getItem('ar_token')\n"
        "  Then add to .env:  IBASEIT_REGISTRY_TOKEN=<paste here>\n"
    )

# ── Langfuse (same as app.py) ─────────────────────────────────────────────────
from langfuse import get_client
langfuse = get_client()
assert langfuse.auth_check(), "Langfuse auth failed - check your keys in .env"

from openinference.instrumentation.crewai import CrewAIInstrumentor   # type: ignore
from openinference.instrumentation.openai import OpenAIInstrumentor    # type: ignore
CrewAIInstrumentor().instrument()
OpenAIInstrumentor().instrument()

from crewai import Agent, Task, Crew, LLM

# ── Gateway LLM factory ───────────────────────────────────────────────────────
# Each agent gets its own LLM instance tagged with its slug.
# The gateway reads X-Agent-Id to know which policy to apply.
GATEWAY_URL = os.environ.get("IBASEIT_GATEWAY_URL", "http://localhost:8001")

def make_llm(agent_slug: str) -> LLM:
    """
    Create an LLM instance routed through the IBaseIT gateway.
    The only difference from app.py is base_url + three headers.
    Groq is still the actual LLM — gateway just inspects first.
    """
    return LLM(
        model="llama-3.3-70b-versatile",
        provider="openai",
        base_url=f"{GATEWAY_URL}/v1",             # ← gateway, not Groq directly
        api_key=os.environ["GROQ_API_KEY"],        # gateway forwards this to Groq
        default_headers={
            "X-Agent-Id":       agent_slug,        # tells gateway which policy to load
            "X-Provider":       "groq",            # tells gateway where to forward
            "X-Registry-Token": REGISTRY_TOKEN,    # auth so gateway can read policy
        },
    )

# ── The 3 agents (same as app.py, each gets its own tagged LLM) ──────────────
researcher = Agent(
    role="Research Analyst",
    goal="Research the given topic and produce 4-5 concise bullet-point facts",
    backstory=(
        "You are a sharp research analyst who quickly finds the most important "
        "facts about any topic and presents them as clear bullet points."
    ),
    llm=make_llm("research-analyst"),   # policy for "research-analyst" slug applied
    verbose=True,
)

writer = Agent(
    role="Content Writer",
    goal="Write a clear, engaging 2-paragraph article based on the research facts",
    backstory=(
        "You are an experienced content writer who turns raw research into "
        "well-structured, readable articles for a general audience."
    ),
    llm=make_llm("content-writer"),     # policy for "content-writer" slug applied
    verbose=True,
)

editor = Agent(
    role="Senior Editor",
    goal="Polish the article for clarity, grammar, and flow. Return only the final version.",
    backstory=(
        "You are a meticulous senior editor who improves drafts without changing "
        "their meaning, fixing grammar, tone, and sentence structure."
    ),
    llm=make_llm("senior-editor"),      # policy for "senior-editor" slug applied
    verbose=True,
)

# ── Tasks (identical to app.py) ───────────────────────────────────────────────
# Accept topic from command-line arg or prompt the user interactively.
import sys as _sys
if len(_sys.argv) > 1:
    TOPIC = " ".join(_sys.argv[1:])
else:
    TOPIC = input("\nEnter research topic (or press Enter for default):\n> ").strip()
    if not TOPIC:
        TOPIC = "About Claude code interpreter and how it compares to other code LLMs"
print(f"\n[Topic]: {TOPIC}\n")

research_task = Task(
    description=f"Research this topic and list 4-5 key facts:\n{TOPIC}",
    expected_output="A bullet-point list of 4-5 concise facts about the topic.",
    agent=researcher,
)

write_task = Task(
    description=f"Using the research facts, write a 2-paragraph article about:\n{TOPIC}",
    expected_output="A 2-paragraph article written for a general software audience.",
    agent=writer,
    context=[research_task],
)

edit_task = Task(
    description="Polish the article for clarity, grammar, and flow.",
    expected_output="The final polished article, ready to publish.",
    agent=editor,
    context=[write_task],
)

# ── Run (identical to app.py) ─────────────────────────────────────────────────
AGENT_TRACES = [
    ("research-analyst", Crew(agents=[researcher], tasks=[research_task], verbose=True)),
    ("content-writer",   Crew(agents=[writer],     tasks=[write_task],    verbose=True)),
    ("senior-editor",    Crew(agents=[editor],      tasks=[edit_task],     verbose=True)),
]

if __name__ == "__main__":
    print("\n========== CREW STARTING (via IBaseIT Gateway) ==========")
    print(f"Gateway : {GATEWAY_URL}")
    print(f"Policy  : {'loaded from registry' if REGISTRY_TOKEN else 'baseline only (no token)'}\n")
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
        print("[Check Threats page in registry for any blocked/detected calls]")
