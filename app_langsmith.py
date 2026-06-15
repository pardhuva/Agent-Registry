"""
CrewAI multi-agent app with LangSmith observability.

7 agents collaborate on one task:
    Researcher    -> gathers key facts about the topic
    Fact Checker  -> verifies the researcher's facts
    Writer        -> drafts an article from the verified facts
    Critic        -> reviews the draft and suggests improvements
    Editor        -> polishes the draft using the critic's feedback
    SEO Specialist-> optimises the article for search keywords
    Summarizer    -> produces a concise TL;DR of the final article

Tracing: LangSmith traces all LLM calls via environment variables
(LANGCHAIN_TRACING_V2). The langsmith SDK wraps the whole crew run
in one parent trace so every agent step is visible under a single
run in the LangSmith UI.

Required .env keys:
    GROQ_API_KEY
    LANGSMITH_API_KEY         (from smith.langchain.com -> Settings -> API Keys)
    LANGSMITH_PROJECT         (optional, defaults to "crew-ai-demo")

Run:
    py app_langsmith.py
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

# 1) Wire up LangSmith tracing BEFORE importing CrewAI.
#    Setting these env vars makes LiteLLM (CrewAI's LLM backend) emit
#    every LLM call as a LangSmith run automatically.
os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
os.environ.setdefault("LANGCHAIN_ENDPOINT", "https://api.smith.langchain.com")
os.environ["LANGCHAIN_API_KEY"] = os.environ["LANGSMITH_API_KEY"]
os.environ.setdefault("LANGCHAIN_PROJECT", os.environ.get("LANGSMITH_PROJECT", "crew-ai-demo"))

from langsmith import traceable, Client as LangSmithClient

ls_client = LangSmithClient()

# 2) Now import CrewAI.
from crewai import Agent, Task, Crew, LLM

llm = LLM(
    model="llama-3.3-70b-versatile",
    provider="openai",
    base_url="https://api.groq.com/openai/v1",
    api_key=os.environ["GROQ_API_KEY"],
)

# ── The 7 agents ──────────────────────────────────────────────────────────────

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

fact_checker = Agent(
    role="Fact Checker",
    goal="Verify every fact from the research and flag anything inaccurate or uncertain",
    backstory=(
        "You are a meticulous fact-checker with a strong background in journalism. "
        "You cross-reference claims against your knowledge and clearly mark any "
        "statement that cannot be confirmed or is misleading."
    ),
    llm=llm,
    verbose=True,
)

writer = Agent(
    role="Content Writer",
    goal="Write a clear, engaging 2-paragraph article based on the verified research facts",
    backstory=(
        "You are an experienced content writer who turns raw research into "
        "well-structured, readable articles for a general software audience."
    ),
    llm=llm,
    verbose=True,
)

critic = Agent(
    role="Content Critic",
    goal="Review the article draft and provide specific, actionable feedback to improve it",
    backstory=(
        "You are an editorial critic who reads drafts with a sharp eye for weak "
        "arguments, unclear sentences, and missing context. You give concise, "
        "numbered improvement suggestions."
    ),
    llm=llm,
    verbose=True,
)

editor = Agent(
    role="Senior Editor",
    goal="Incorporate the critic's feedback and polish the article for clarity, grammar, and flow",
    backstory=(
        "You are a senior editor who takes critic feedback seriously and applies "
        "every valid suggestion, improving the draft without changing its core meaning."
    ),
    llm=llm,
    verbose=True,
)

seo_specialist = Agent(
    role="SEO Specialist",
    goal="Optimise the polished article with relevant keywords and SEO best practices",
    backstory=(
        "You are an SEO expert who improves content discoverability by naturally "
        "weaving in high-value search terms, improving headings, and adding a "
        "meta description — without making the text feel stuffed or unnatural."
    ),
    llm=llm,
    verbose=True,
)

summarizer = Agent(
    role="Content Summarizer",
    goal="Write a 3-sentence TL;DR summary of the final article",
    backstory=(
        "You are a skilled content summarizer who distills long articles into "
        "crisp, accurate summaries that capture the key takeaways."
    ),
    llm=llm,
    verbose=True,
)

# ── The 7 tasks ───────────────────────────────────────────────────────────────
TOPIC = "About Claude code interpreter and how it compares to other code LLMs and the major models in it"

research_task = Task(
    description=f"Research this topic and list 4-5 key facts:\n{TOPIC}",
    expected_output="A bullet-point list of 4-5 concise facts about the topic.",
    agent=researcher,
)

fact_check_task = Task(
    description=(
        "Review the research bullet points. Confirm each fact is accurate. "
        "Mark any uncertain or incorrect claims with [UNVERIFIED] or [INCORRECT]. "
        "Return the full list with your annotations."
    ),
    expected_output="The annotated bullet-point list with [VERIFIED], [UNVERIFIED], or [INCORRECT] tags on each fact.",
    agent=fact_checker,
    context=[research_task],
)

write_task = Task(
    description=f"Using only the VERIFIED facts, write a 2-paragraph article about:\n{TOPIC}",
    expected_output="A 2-paragraph article written for a general software audience.",
    agent=writer,
    context=[fact_check_task],
)

critic_task = Task(
    description=(
        "Review the article draft critically. List 3-5 numbered, specific suggestions "
        "to improve clarity, depth, or flow. Be constructive but direct."
    ),
    expected_output="A numbered list of 3-5 improvement suggestions for the article.",
    agent=critic,
    context=[write_task],
)

edit_task = Task(
    description=(
        "Apply the critic's suggestions to the article draft. "
        "Polish the final version for clarity, grammar, and flow."
    ),
    expected_output="The final polished article, ready for SEO review.",
    agent=editor,
    context=[write_task, critic_task],
)

seo_task = Task(
    description=(
        "Optimise the polished article for SEO. Naturally integrate relevant keywords, "
        "improve the title/headings if present, and append a 1-sentence meta description."
    ),
    expected_output="The SEO-optimised article with a meta description appended at the bottom.",
    agent=seo_specialist,
    context=[edit_task],
)

summarize_task = Task(
    description="Write a 3-sentence TL;DR summary of the final SEO-optimised article.",
    expected_output="A 3-sentence TL;DR summary.",
    agent=summarizer,
    context=[seo_task],
)

# ── Assemble crew ────────────────────────────────────────────────────────────
crew = Crew(
    agents=[researcher, fact_checker, writer, critic, editor, seo_specialist, summarizer],
    tasks=[research_task, fact_check_task, write_task, critic_task, edit_task, seo_task, summarize_task],
    verbose=True,
)

# ── Run each agent in its own named LangSmith trace ──────────────────────────
# The Agent Registry queries runs by name matching the agent slug, so each
# agent must be wrapped in a @traceable with its slug as the name.
PROJECT = os.environ["LANGCHAIN_PROJECT"]

AGENT_RUNS = [
    ("research-analyst",  Crew(agents=[researcher],     tasks=[research_task],  verbose=True)),
    ("fact-checker",      Crew(agents=[fact_checker],   tasks=[fact_check_task],verbose=True)),
    ("content-writer",    Crew(agents=[writer],          tasks=[write_task],     verbose=True)),
    ("content-critic",    Crew(agents=[critic],          tasks=[critic_task],    verbose=True)),
    ("senior-editor",     Crew(agents=[editor],          tasks=[edit_task],      verbose=True)),
    ("seo-specialist",    Crew(agents=[seo_specialist],  tasks=[seo_task],       verbose=True)),
    ("content-summarizer",Crew(agents=[summarizer],      tasks=[summarize_task], verbose=True)),
]

if __name__ == "__main__":
    print("\n========== CREW STARTING (LangSmith) ==========\n")
    final_result = None
    for slug, mini_crew in AGENT_RUNS:
        print(f"\n--- Running: {slug} ---")
        run_fn = traceable(name=slug, project_name=PROJECT)(mini_crew.kickoff)
        final_result = run_fn()
    print("\n========== FINAL OUTPUT ==========\n")
    print(final_result)
    print("\n[Traces sent to LangSmith]")
