# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```



<!-- 
Agent Registry & LLM Observability — Complete Explanation
What is this platform?
When a company runs many AI agents (like your CrewAI agents — Content Writer, SEO Specialist, Fact Checker, etc.), a critical problem emerges: nobody knows what agents exist, what they're doing, what data they touch, or whether they're secure.

This platform is the single source of truth for every AI agent in your enterprise. Think of it like a "passport control" for AI agents.

The 4 Layers
Layer 1 — Your AI Agents
These are the actual agents doing work — your CrewAI crew (Content Writer, Research Analyst, SEO Specialist, etc.), or any LLM-powered application. They call OpenAI/Anthropic/Groq APIs to do their jobs.

Without this platform, these agents run in the wild — no tracking, no security, no governance.

Layer 2 — Capture (How we see agent activity)
There are 3 ways to capture what agents are doing:

Capture Method	How it works	Port
Python SDK (Style 1)	One line of code in agent. Monkey-patches OpenAI/Anthropic client to intercept every call	Imported as library
LLM Gateway (Style 2)	Agent points base_url to our proxy instead of OpenAI directly. Zero code changes to agent logic	Port 8001
Observability Platforms	Langfuse/LangSmith already track traces. We pull from them	Their cloud URLs
SDK example — one line to protect an agent:

import ibaseit
ibaseit.register(api_key="...", agent_id="content-writer")
# That's it. Every OpenAI call is now monitored + enforced.
Gateway example — zero code changes:

client = OpenAI(
    base_url="http://localhost:8001/v1",  # just change this URL
    api_key="sk-..."
)
# All calls now flow through our policy-enforcing proxy
Layer 3 — The Registry (Control Plane)
This is the brain of the system. It stores everything about every agent:

A. Agent Record
Every agent gets a record with:

Name & slug — "Content Writer" / content-writer
Owner — who's responsible (pardhuvab@ibaseit.com)
Team — which team owns it (AI Platform)
Version — current version (v1.0.0)
Description — what it does
Tags — for filtering/grouping
Platforms — which observability tools track it (Langfuse, LangSmith, Helicone)
B. Lifecycle (the maturity journey)
Every agent progresses through 4 stages:

dev  →  staging  →  prod  →  deprecated
Stage	Meaning	Who uses it	Security required
dev	Being built/tested	Developers	None — experiment freely
staging	Pre-production testing	QA team	Firewall + Jailbreak detection
prod	Serving real users	Everyone	All 6 controls must be active
deprecated	Being retired	Nobody (winding down)	Minimal
Why this matters: You don't want security rules blocking developers during experimentation. But before an agent touches real users or real data, it MUST pass security gates. The lifecycle is that gate.

C. Security Policy (6 Controls)
Each agent has a policy — a set of security rules. There are 6 controls:

#	Control	What it does	Example
S1	LLM Firewall	Inspects prompts/responses for dangerous content	Blocks exec(), eval(), SQL injection, XSS in prompts
S2	Model Theft Detection	Detects systematic probing to extract model behavior	Flags if someone sends 1000 boundary-testing queries
S3	Jailbreak Detection	Catches prompt injection attacks	Blocks "ignore all previous instructions"
S4	PII Exfiltration	Detects/redacts personal data	Replaces john@email.com with [REDACTED:EMAIL]
S5	Token Overuse	Per-agent budget limits	Stops agent after 100K tokens/day
S6	Coherency	Output quality scoring	Flags hallucination, off-topic responses
Each control can be:

Off — not checking
Detecting — logging violations but not blocking
Blocking — actively preventing violations
D. Dependencies & Graph
Each agent record tracks:

Models used — gpt-4o, claude-sonnet, etc.
Tools used — web search, calculator, API calls
Other agents it calls — Content Writer → Fact Checker → Senior Editor
This creates a dependency graph — a visual map showing how agents connect. This matters because:

If "Fact Checker" goes down, you can instantly see which other agents are affected (blast radius)
If you're changing a shared tool, you know which agents will be impacted
E. Telemetry Ingestion Engine
Instead of manually registering every agent, the system automatically discovers them:

Connects to your Langfuse/LangSmith accounts
Pulls all trace data (every LLM call your agents made)
Groups traces by agent name
Creates new agent records or updates existing ones
Extracts models, tools, token counts from the trace data
This is how your 7 agents appeared — the engine pulled them from your Langfuse cloud account.

F. Threat Scanner
The scanner answers: "Is this agent's security appropriate for where it's running?"

It checks every agent and asks:

Is it in staging/prod WITHOUT a firewall? → HIGH finding
Is it in staging/prod with tools exposed but no firewall? → MEDIUM (model theft risk)
Is jailbreak detection turned off? → HIGH finding
Does it handle PII without redaction? → CRITICAL finding
Is it in prod without a token budget? → LOW finding
Is it in staging/prod without coherency protection? → MEDIUM finding
This is why Threats showed 0 — all your agents are in dev. The scanner says "dev is fine without security." Promote one to staging or prod and the findings appear.

G. Governance & Approval
Before an agent moves from dev → staging → prod, it goes through an approval workflow:

Someone must approve the promotion
The system checks if required security controls are in place
An audit log records who promoted it, when, and why
Layer 4 — Dashboard (What you see in the browser)
The React frontend visualizes everything:

Page	What it shows
Agents	All registered agents with search, filter by lifecycle/team
Lifecycle	Kanban-style board of agents moving through dev→staging→prod
Dependency Graph	Visual map of agent-to-agent and agent-to-model relationships
Threats	Fleet-wide security findings from the scanner
Discover	Find agents running in your platforms that aren't registered yet
Governance	Approval workflows and audit trails
Connectors (Langfuse, LangSmith, etc.)	Configure connections to observability platforms
How it all connects — End-to-End Flow
Here's a real scenario with your agents:

Step 1: Agent runs
Your CrewAI "Content Writer" agent calls OpenAI to write an article. This call is traced by Langfuse.

Step 2: Discovery
You click "Pull & reconcile" on the Discover page. The Ingestion Engine calls Langfuse API, finds the trace for "Content Writer", and creates an agent record in the registry.

Step 3: Agent appears
"Content Writer" now shows up on the Agents page — lifecycle: dev, security: unprotected, platforms: Langfuse.

Step 4: Developer configures policy
You click on the agent, enable the firewall, turn on jailbreak detection, add PII classes (email, phone), set a token budget of 50K/day.

Step 5: Promotion
Developer requests promotion to staging. Governance workflow triggers — a senior engineer approves. Lifecycle changes to staging.

Step 6: Threat scan
Scanner runs. Checks: firewall enabled? Yes. Jailbreak detection? Yes. PII redaction? Yes. Token budget? Yes. → 0 findings. Agent is properly secured for staging.

Step 7: Production
Agent gets promoted to prod. Now the SDK/Gateway actively enforces policies:

Someone sends a jailbreak prompt → blocked, finding logged
Agent response contains an email address → redacted to [REDACTED:EMAIL]
Agent exceeds 50K tokens → throttled
Step 8: Incident
Security team checks Threats page — sees a CRITICAL finding on "Research Analyst": PII handling without redaction. They click through, enable redaction, crisis averted.

The 3 Services (Ports)
Service	Port	What it does
Backend API	8000	The registry database + all business logic
LLM Gateway	8001	Reverse proxy that enforces policies on LLM calls
Frontend	5173	The dashboard you see in the browser
Why this matters for the business
Visibility — "How many AI agents do we have?" → Instant answer
Security — "Are any agents leaking PII?" → Threat scanner tells you
Governance — "Who approved this agent for production?" → Audit trail
Blast radius — "If OpenAI goes down, what breaks?" → Dependency graph shows it
Cost control — "Which agent is burning tokens?" → Token budgets per agent
Compliance — "Can we prove our AI agents are secured?" → Policy records + audit log -->