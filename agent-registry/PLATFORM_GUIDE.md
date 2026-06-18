# IBaseIT Agent Registry — Complete Platform Guide

---

## What Is This Platform?

**IBaseIT Agent Registry** is an AI governance and security platform.

The problem it solves: As organizations deploy multiple AI agents (built with CrewAI, LangChain, OpenAI Assistants, etc.), there is no central place to:
- Know **what agents exist**, who owns them, what models/tools they use
- Know **what lifecycle stage** they are in (dev → staging → prod)
- **Enforce security policies** (block jailbreaks, redact PII, cap token spend)
- **Monitor real threats** happening in live traffic
- Prove **compliance** (SOC 2, EU AI Act, GDPR)

The registry is that central control plane. Think of it like a "GitHub + Datadog + Firewall" for your AI agents.

---

## The Entire Workflow (Start to End)

```
STEP 1: Register Agents
  You manually add your agents (or import from observability platforms like Langfuse)
  Each agent gets a slug, owner, lifecycle stage, policy, data classifications

STEP 2: Connect Observability Platforms
  Connect Langfuse / LangSmith / Helicone / OTel
  Platform discovers traces → maps them to registered agents
  Real prompt/response traffic is now visible inside the registry

STEP 3: Run Security Scan
  Threats page → "Scan Fleet"
  Two layers run simultaneously:
    Layer 1 (posture): checks config — is firewall on? is PII policy set? token budget?
    Layer 2 (content): pulls real traces from Langfuse → LLM (Groq llama-3.3-70b) reads them
                       and finds jailbreaks, PII, prompt injection, model-theft probes

STEP 4: Enforce Policy via Gateway or SDK
  You instrument your agent app to route calls through the IBaseIT Gateway (port 8001)
  Every LLM call is intercepted → policy fetched from registry → threats blocked in real time
  A blocked call returns HTTP 403 before Groq/OpenAI is ever contacted
  Blocked threats are reported back to the registry immediately (live, not via scan)

STEP 5: Lifecycle Promotion
  Agents move dev → staging → prod through a gated promotion flow
  Promotion checks: ownership set? security policy configured? compliance declared?

STEP 6: Governance & Compliance
  Governance page flags: duplicate agents, over-privileged agents, agents without owners
  Analytics pages show: risk predictions, user audit trails, PII exposure, impact blast radius
```

---

## Architecture (3 Layers)

```
┌─────────────────────────────────────────────────────────┐
│  Your AI Agent App  (CrewAI, LangChain, custom)         │
│  e.g. app_gateway.py                                    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP calls to /v1/chat/completions
                         ▼
┌─────────────────────────────────────────────────────────┐
│  IBaseIT Gateway  (port 8001)                           │
│  - Receives every LLM call                              │
│  - Reads X-Agent-Id header → fetches that agent's policy│
│  - Runs regex pre-filter (microseconds)                 │
│  - Runs LLM classifier (Groq, ~1s)                      │
│  - BLOCKS if threat found (HTTP 403 back to agent)      │
│  - FORWARDS if clean → Groq/OpenAI → returns response   │
│  - Reports threats to Registry in real time             │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  IBaseIT Registry Backend  (port 8000)                  │
│  FastAPI + SQLite + SQLAlchemy                          │
│  - Agent CRUD, policies, audit logs, snapshots          │
│  - Threat findings store                                │
│  - Observability platform connectors                    │
│  - LLM threat scanner (llm_detect.py)                   │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  IBaseIT Registry Frontend  (port 5173)                 │
│  React + TypeScript + Tailwind                          │
│  - All the pages described below                        │
└─────────────────────────────────────────────────────────┘
```

---

## Page-by-Page Guide

---

### 1. Login
**URL:** `/login`

The entry point. Email + password auth. New users can sign up from the same page.
On login you get a JWT that is stored in `localStorage` as `ar_token`. Every API call
sends this token in the `Authorization: Bearer` header.

---

### 2. Agents (Registry)
**URL:** `/agents`  **Sidebar:** Registry → Agents

**What it is:** The master inventory — every AI agent your organization has deployed.

**What you see:**
- Cards for each agent showing: name, slug, lifecycle stage badge (dev/staging/prod/deprecated), platform badges (Langfuse, LangSmith, etc.), protection status, version, owner, team
- Duplicate detection warning if two agents look like the same thing

**What you do here:**
- Add a new agent manually
- Import an agent discovered from an observability platform
- Edit an agent
- Click through to Agent Detail

**Key concept — the Slug:** Every agent has a unique slug (e.g. `research-analyst`).
The slug is what the Gateway uses to look up which policy to apply when a call comes in
with the `X-Agent-Id: research-analyst` header.

---

### 3. Agent Detail
**URL:** `/agents/:id`  **Sidebar:** click any agent card

**What it is:** The full profile of a single agent. The most information-dense page in the platform.

**Tabs:**

| Tab | What it shows |
|-----|--------------|
| Overview | Name, slug, description, owner, team, on-call, version, tags, platforms |
| Dependencies | Models used, tools integrated, data sources, downstream agents it calls |
| Capability Spec | What inputs it accepts, what outputs it produces, example I/O |
| Compliance | Data classification (PII/PHI/public), EU AI Act category, SOC 2 scope |
| Access & Guardrails | Allowed callers, blocked topics, max tokens, allowed tools |
| Security & Enforcement | **The key tab** — live security controls panel (see below) |
| Observability | Real traces from Langfuse/LangSmith/Helicone side-by-side |
| Audit Log | Every change ever made to this agent, with restore-to-snapshot |

**Security & Enforcement tab — the 6 controls:**

| Control | What it guards |
|---------|---------------|
| S1 Firewall | Blocks malicious code execution, system command injection |
| S2 Model Theft | Blocks systematic probing of the model's knowledge/system prompt |
| S3 Jailbreak | Blocks "ignore all previous instructions", DAN-style prompts |
| S4 Coherency | Detects when agent output drifts from its stated purpose |
| S5 Token Budget | Caps daily token spend to prevent runaway cost |
| S6 PII | Detects/redacts SSN, credit cards, emails, phone numbers |

Each control can be: **Enforcing** (blocks), **Detecting** (logs only), or **Off**.

The "Send live call through gateway" button in this tab is what flips the agent badge
from "Awaiting First Event" → "Protected" (it proves a real instrumented call went through).

---

### 4. Lifecycle
**URL:** `/lifecycle`  **Sidebar:** Registry → Lifecycle

**What it is:** A Kanban board showing agents across 4 stages.

```
[ DEV ]  →  [ STAGING ]  →  [ PROD ]  →  [ DEPRECATED ]
```

**Promotion gates:** To move an agent from dev → staging or staging → prod, the system
checks required fields (owner set, policy configured, compliance declared). Missing fields
are shown as blockers.

When an agent is promoted, the audit log records: who approved it, when, and from which stage.

---

### 5. Discover
**URL:** `/discover`  **Sidebar:** Registry → Discover

**What it is:** Automatic AI agent sprawl detection.

Connects to your observability platforms (Langfuse, LangSmith, Helicone, OTel) and scans
trace names. Any trace that doesn't match a registered agent slug shows up as
"unregistered" — these are shadow AI agents running in your org without governance.

**What you do here:**
- See total discovered vs registered
- Click "Register" on a discovered agent to bring it under governance
- Pull bulk telemetry ("Ingest All") to sync trace data into the registry

---

### 6. Governance
**URL:** `/governance`  **Sidebar:** Governance & Analytics → Governance

**What it is:** Compliance and hygiene controls for the whole fleet.

**Three sections:**

**Over-privileged agents** — Agents with access scope broader than their lifecycle justifies.
E.g. a dev agent with prod data access. Flagged for review.

**Duplicate detection & cleanup** — Groups of agents that appear to be the same thing
(same slug pattern or trace junk names). Shows a recommended "keeper" and lets you
merge/delete duplicates in one click.

**Unowned agents** — Agents with no owner set. These are a compliance risk (no one
accountable when something goes wrong).

**Compliance grid** — Per-agent view of data classification, EU AI Act category, SOC 2 scope,
and whether all required fields are filled.

---

### 7. Dependency Graph
**URL:** `/dependency-graph`  **Sidebar:** Governance & Analytics → Dependency Graph

**What it is:** An interactive force-directed network graph of your entire AI infrastructure.

**Nodes:**
- Blue circles = your registered agents
- Orange squares = LLM models they use
- Green diamonds = tools they call
- Purple hexagons = data sources they access

**Edges:** Lines connecting what depends on what.

**Blast radius analysis:** Click any node → see "If this is deprecated, what breaks?"
Shows every agent that directly or transitively depends on it.

Use case: before switching from GPT-4 to Claude, click the GPT-4 model node to see
every agent that would be affected.

---

### 8. Threats
**URL:** `/threats`  **Sidebar:** Governance & Analytics → Threats

**What it is:** The central threat intelligence dashboard for the whole fleet.

**Two ways threats appear here:**

1. **Fleet scan (on-demand):** Click "Scan Fleet" → Layer 1 (posture) + Layer 2 (LLM content
   scan over real Langfuse traces) runs → findings saved to DB.

2. **Live gateway reports (real-time):** When a real agent call is blocked by the gateway,
   it reports the threat here immediately — no scan needed. These persist across page
   refreshes and are NOT deleted by subsequent scans.

**What each finding shows:**
- Which agent was attacked
- Control type (firewall / jailbreak / PII / etc.)
- Severity (critical / high / medium / low)
- Summary and detail (matched pattern, confidence %, trace source)
- Principal (who sent it — user ID, session, or "capture:gateway" for live intercepts)
- Timestamp (correct local time after the UTC fix)

**Live Prompt Analyzer box:** Paste any prompt → "Analyze with LLM" → see findings
instantly without running a full fleet scan. Good for quick checks.

---

### 9. Security Center
**URL:** `/security`  **Sidebar:** Governance & Analytics → Security Center

**What it is:** Cross-fleet security intelligence — the view no single agent's detail page has.

**Sections:**

**Fleet KPIs:** Total critical threats, unprotected agents, jailbreak attempt count,
repeat offender principals.

**Repeat Offenders:** Principals (user IDs, IPs) that have triggered threats across
multiple agents. A principal that hits 3 different agents is more suspicious than one that
hits one agent once.

**Shared Jailbreak Signatures:** Jailbreak patterns that appeared in multiple agents.
Same pattern hitting multiple agents = coordinated attack, not a random user.

**Model-Theft Signals:** Volume anomalies where an agent is receiving systematic boundary-
mapping queries (trying to reverse-engineer the system prompt or training data).

**Agent Security Status Grid:** Every agent, one row, showing protection status +
threat count + enforcement level.

---

### 10. Capture Adapters (SDK & Gateway)
**URL:** `/capture`  **Sidebar:** Governance & Analytics → Capture Adapters

**What it is:** The instrumentation guide — how to connect your agent app to the registry.

**Three integration styles shown:**

| Style | What it is | Best for |
|-------|-----------|----------|
| Style 1: SDK | Python wrapper around your LLM calls | Apps you control, simple integration |
| Style 2: Gateway | Swap `base_url` to point at localhost:8001 | Any OpenAI-compatible app, zero code change |
| Style 3: Proxy | Enterprise egress proxy (Envoy/Helm) | Large orgs, network-level enforcement |

**Protection status summary:** Shows how many of your agents are Protected / Awaiting /
Unprotected across all three integration methods.

**Live Gateway Test panel:** Test any prompt through the gateway right from this page.
Select agent, pick a preset (Normal ✓ / Jailbreak ⚡ / PII 👤 / Firewall 🔥), hit Send.
See whether it passed (green) or was blocked (red) with the full HTTP status and response.

---

### 11. Observability
**URL:** `/observability`  **Sidebar:** Observability → Overview

**What it is:** A sortable fleet-level observability table — one row per agent.

**Columns:** Agent name, lifecycle stage, protection status, risk tier, dependency count,
threat count, audit event count, last activity timestamp.

**KPI cards at top:** Total agents / Protected / With active threats / In production.

Click any row → goes to that agent's detail page with observability traces.

---

### 12. Event Timeline
**URL:** `/timeline`  **Sidebar:** Observability → Event Timeline

**What it is:** A chronological audit log of every action taken across the entire fleet.

**What counts as an event:**
- Agent created
- Agent metadata updated
- Agent promoted/demoted through lifecycle stages
- Agent deleted
- Security control changed
- Snapshot restored
- Gateway/SDK instrumentation event (when an agent first goes Protected)

**Filters:** By action type, time range, free-text search.

Use case for compliance: "Show me every prod agent that was modified in the last 30 days
and who made the change."

---

### 13. User Analytics
**URL:** `/analytics/users`  **Sidebar:** Observability → User Analytics

**What it is:** Per-person audit metrics. Who is doing what to which agents.

**Per-user breakdown:**
- Total events generated
- How many distinct agents modified
- Action breakdown (created / updated / promoted / demoted)
- Last activity timestamp
- Risk level (high-risk users are those making many changes to prod agents)

Use case: detect a developer who is repeatedly modifying prod agents without going through
the proper promotion gate.

---

### 14. Impact Mapping
**URL:** `/analytics/impact`  **Sidebar:** Observability → Impact Mapping

**What it is:** Risk-weighted dependency analysis. Which agents would cause the most damage
if they were compromised or went down?

**Impact tiers:**
- **Critical** — agent has many dependents + active threats + in prod
- **High** — agent has dependents or sensitive data classification
- **Medium / Low** — isolated agents or dev-only

**Heatmap:** Impact level (y-axis) × Likelihood of issue (x-axis). Agents in the top-right
quadrant (high impact + high likelihood) are the highest priority to fix.

---

### 15. PII Detection
**URL:** `/analytics/pii`  **Sidebar:** Observability → PII Detection

**What it is:** Scans agent configuration fields for PII patterns that shouldn't be there.

Not the same as the gateway's runtime PII detection (which scans live traffic). This scans
the agent's static config: system prompt text, description, guardrails, capability examples.

**What it looks for:** Email addresses, SSNs, credit card numbers, phone numbers, API keys
embedded in text fields.

Each finding shows: field where it was found, pattern type, confidence, compliance risk
(SOC 2 / GDPR implications), recommendation.

---

### 16. Predictive Analytics
**URL:** `/analytics/predictions`  **Sidebar:** Observability → Predictive Analytics

**What it is:** Heuristic-based predictions of which agents are likely to cause problems.

**Prediction rules (examples):**
- Dev-stage agent with downstream dependents (production dependency on an unstable agent)
- Active threats on an agent that has no firewall enabled
- Prod agent with PII data classification but no PII redaction policy
- Agent with no token budget that has high historical token usage
- Missing guardrails on a public-facing agent

Each prediction shows: severity, confidence %, affected agent, specific recommendation to fix it.

**Risk heatmap:** Predicted impact × predicted likelihood.

---

### 17. Langfuse / LangSmith / Helicone / OTel Pages
**URLs:** `/langfuse`, `/langsmith`, `/helicone`, `/otel`  **Sidebar:** Observability section

**What they are:** Configuration pages to connect external observability platforms.

Each page lets you:
1. Enter your API credentials for that platform
2. Test the connection (live API call to verify keys work)
3. Save the instance — now the registry can pull traces from it

Once connected:
- Discover page finds unregistered agents from that platform's traces
- Agent Detail shows real traces from that platform side-by-side
- Threat scan pulls trace content for LLM classification
- Event Timeline shows activity sourced from that platform

---

### 18. Connectors (Hyperscalers)
**URL:** `/connectors`  **Sidebar:** Hyperscalers section

**What it is:** Future-facing integration stubs for enterprise AI platforms.

Platforms shown: AWS Bedrock, Azure AI Foundry, Google Vertex AI, Azure Monitor,
Arize Phoenix, Datadog, Traceloop.

Currently shows connection configuration UI and ingestion notes for each platform.
As each connector is fully implemented, it will feed agent discovery and trace data
the same way Langfuse/LangSmith do.

---

## Data Flow Summary

```
Your Agent App
    │
    │ routes LLM calls through Gateway (if instrumented)
    ▼
Gateway (port 8001)
    │ blocks threats → HTTP 403 back to agent app
    │ reports threats → Registry backend
    │ forwards clean calls → Groq / OpenAI
    ▼
Groq / OpenAI
    │ returns LLM response → Gateway → Agent App

Registry Backend (port 8000)
    ├── stores threats reported by Gateway (principal: capture:gateway)
    ├── stores threats found by fleet scan (posture + Langfuse LLM scan)
    ├── stores all agent metadata, policies, audit logs
    └── serves the frontend

Frontend (port 5173)
    ├── reads all data from registry backend
    ├── Threats page: shows both live gateway threats + scan threats
    ├── Agent Detail: shows traces from connected platforms
    └── Security Center: cross-fleet intelligence derived from all agents + threats
```

---

## Key Terms

| Term | Meaning |
|------|---------|
| Slug | Unique kebab-case ID for an agent, e.g. `research-analyst`. Used by Gateway to load policy. |
| Protection Status | Protected (instrumented + first call confirmed) / Awaiting (policy set, no call yet) / Unprotected |
| Principal | Who triggered a threat. `capture:gateway` = live intercept. Email = user from Langfuse trace. |
| Posture scan | Layer 1 threat detection: checks agent config fields (no firewall, missing budget, etc.) |
| Content scan | Layer 2 threat detection: LLM reads real prompt/response text from Langfuse traces |
| Lifecycle gate | Checklist of required fields that must pass before an agent can be promoted |
| Snapshot | Point-in-time backup of an agent's full config stored at every edit; restorable |
| JWT | Auth token stored in `localStorage` as `ar_token`, sent with every API call |
