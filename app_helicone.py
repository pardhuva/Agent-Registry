"""
CrewAI multi-agent app with Helicone observability.

Helicone works as an HTTP proxy — LLM calls are routed through
https://gateway.helicone.ai which logs every request automatically.

Each agent uses its own LLM instance with:
  - Helicone-Auth         → your Helicone API key
  - Helicone-Target-URL   → actual LLM provider (Groq)
  - Helicone-Property-Agent → agent slug, so the registry can filter traces per agent

Run:
    python app_helicone.py
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

from crewai import Agent, Task, Crew, LLM

HELICONE_API_KEY = os.environ["HELICONE_API_KEY"]
GROQ_API_KEY     = os.environ["GROQ_API_KEY"]

def make_llm(agent_slug: str) -> LLM:
    """Create an LLM instance routed through Helicone, tagged with the agent slug."""
    return LLM(
        model="llama-3.3-70b-versatile",
        provider="openai",
        base_url="https://gateway.helicone.ai/v1",
        api_key=GROQ_API_KEY,
        default_headers={
            "Helicone-Auth":            f"Bearer {HELICONE_API_KEY}",
            "Helicone-Target-URL":      "https://api.groq.com/openai",
            "Helicone-Property-Agent":  agent_slug,
        },
    )

# ── Agents (each gets its own tagged LLM) ────────────────────────────────────
researcher = Agent(
    role="Research Analyst",
    goal="Research the given topic and produce 4-5 concise bullet-point facts",
    backstory=(
        "You are a sharp research analyst who quickly finds the most important "
        "facts about any topic and presents them as clear bullet points."
    ),
    llm=make_llm("research-analyst"),
    verbose=True,
)

writer = Agent(
    role="Content Writer",
    goal="Write a clear, engaging 2-paragraph article based on the research facts",
    backstory=(
        "You are an experienced content writer who turns raw research into "
        "well-structured, readable articles for a general software audience."
    ),
    llm=make_llm("content-writer"),
    verbose=True,
)

editor = Agent(
    role="Senior Editor",
    goal="Polish the article for clarity, grammar, and flow. Return only the final version.",
    backstory=(
        "You are a meticulous senior editor who improves drafts without changing "
        "their meaning, fixing grammar, tone, and sentence structure."
    ),
    llm=make_llm("senior-editor"),
    verbose=True,
)

# ── Tasks ────────────────────────────────────────────────────────────────────
TOPIC = "About Claude code interpreter and how it compares to other code LLMs and the major models in it"

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

# ── Run ───────────────────────────────────────────────────────────────────────
crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, write_task, edit_task],
    verbose=True,
)

if __name__ == "__main__":
    print("\n========== CREW STARTING (Helicone) ==========\n")
    result = crew.kickoff()
    print("\n========== FINAL OUTPUT ==========\n")
    print(result)
    print("\n[Requests logged to Helicone]")
