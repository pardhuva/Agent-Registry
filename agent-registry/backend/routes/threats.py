"""
Threat detection routes.

Two complementary layers:

1. **Posture heuristics** (`_scan_agent`) — cheap checks on an agent's *policy
   configuration* (no firewall on a prod agent, no token budget, etc.). These
   answer "is this agent governed correctly?", not "is it under attack?".

2. **Content detection** (`_scan_content`) — pulls the *actual prompt/response
   text* from connected Langfuse traces and runs an LLM classifier
   (`llm_detect`) over it. This answers "what threats are present in the real
   traffic?" — jailbreaks, PII, injection, model-theft probing. This is the
   layer the old code was missing entirely.

`/scan` runs both. `/analyze` runs the LLM live on an ad-hoc prompt (great for
demos and for the "test a prompt" box in the UI). `/llm-status` reports which
provider is wired up.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

import llm_detect
from auth import get_current_user
from database import get_db
from models import Agent, LangfuseInstance, ThreatFinding, User
from schemas import ThreatCreate, ThreatFindingOut

router = APIRouter(prefix="/api/threats", tags=["threats"])


# ── Layer 1: posture heuristics ───────────────────────────────────────────────

def _scan_agent(agent: Agent) -> list[dict]:
    """Heuristic security-posture checks against a single agent record."""
    findings: list[dict] = []
    policy = agent.policy or {}
    deps = agent.dependencies or {}
    data_cls = agent.data_classifications or []
    compliance = agent.compliance or {}

    firewall = policy.get("firewall", {})
    if agent.lifecycle in ("prod", "staging") and not firewall.get("enabled"):
        findings.append(dict(
            control="firewall", severity="high",
            summary=f"No firewall policy on {agent.lifecycle} agent",
            detail=f"Agent '{agent.name}' is in {agent.lifecycle} without an active firewall policy. All prod/staging agents should have firewall enforcement.",
            principal=None,
        ))

    tools = deps.get("tools", [])
    if tools and agent.lifecycle in ("prod", "staging") and not firewall.get("enabled"):
        findings.append(dict(
            control="model_theft", severity="medium",
            summary="Boundary-mapping query pattern risk — tools exposed without firewall",
            detail=f"Agent has {len(tools)} tool dependencies and is in {agent.lifecycle} without firewall protection. Systematic enumeration attacks are unblocked.",
            principal="anonymous@external",
        ))

    jailbreak = policy.get("jailbreak", {})
    if not jailbreak.get("detect", True) and agent.lifecycle != "deprecated":
        findings.append(dict(
            control="jailbreak", severity="high",
            summary="Jailbreak detection disabled",
            detail=f"Agent '{agent.name}' has jailbreak detection turned off. Cross-fleet signature matching is inactive for this agent.",
            principal=None,
        ))

    has_pii = "PII" in data_cls or "PHI" in data_cls
    dc = compliance.get("dataClassification", "")
    if dc in ("confidential", "restricted"):
        has_pii = True
    pii_policy = policy.get("pii", {})
    pii_classes = pii_policy.get("classes", [])
    pii_action = pii_policy.get("action", "log")
    if has_pii and (not pii_classes or pii_action == "log"):
        findings.append(dict(
            control="pii", severity="critical",
            summary="PII-handling agent without redaction enforcement",
            detail=f"Agent '{agent.name}' processes PII/sensitive data but PII policy is {'not configured' if not pii_classes else 'set to log-only'}. Redaction or blocking should be enforced.",
            principal=None,
        ))

    token_budget = policy.get("tokenBudget", {})
    if agent.lifecycle == "prod" and not token_budget.get("dailyLimit") and not token_budget.get("limit"):
        findings.append(dict(
            control="token_overuse", severity="low",
            summary="No token budget set for production agent",
            detail=f"Agent '{agent.name}' is in production without a token limit. Runaway cost is possible.",
            principal=None,
        ))

    if agent.lifecycle in ("prod", "staging") and agent.protection_status == "unprotected":
        findings.append(dict(
            control="coherency", severity="medium",
            summary="Unprotected agent in higher environment",
            detail=f"Agent '{agent.name}' is in {agent.lifecycle} but marked as unprotected. No runtime guardrails are active.",
            principal=None,
        ))

    return findings


# ── Layer 2: LLM content detection ────────────────────────────────────────────

async def _pull_langfuse_trace_content(inst: LangfuseInstance, limit: int = 40) -> list[dict]:
    """Pull recent traces with their input/output content from a Langfuse instance."""
    auth = httpx.BasicAuth(inst.public_key, inst.secret_key)
    base = inst.host_url.rstrip("/")
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{base}/api/public/traces",
            auth=auth,
            params={"limit": limit, "orderBy": "timestamp.desc"},
        )
        if resp.status_code != 200:
            return out
        for tr in resp.json().get("data", []):
            inp = tr.get("input")
            outp = tr.get("output")
            prompt = _stringify(inp)
            response = _stringify(outp)
            if not (prompt or response):
                continue
            meta = tr.get("metadata") or {}
            principal = (
                tr.get("userId")
                or meta.get("user_id")
                or meta.get("userId")
                or tr.get("sessionId")
                or "anonymous"
            )
            out.append({
                "name": tr.get("name") or tr.get("id", "unknown"),
                "slug": _slugify(tr.get("name") or tr.get("id", "unknown")),
                "prompt": prompt,
                "response": response,
                "principal": principal,
                "model": (tr.get("metadata") or {}).get("model"),
            })
    return out


def _stringify(val) -> str:
    if val is None:
        return ""
    if isinstance(val, str):
        return val
    try:
        return json.dumps(val)[:8000]
    except Exception:
        return str(val)[:8000]


def _slugify(name: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")


async def _scan_content(
    db: AsyncSession, user: User, agents: list[Agent], max_traces: int = 15,
) -> tuple[list[ThreatFinding], dict]:
    """Pull real trace content and run the LLM classifier over it."""
    meta = {
        "tracesPulled": 0,
        "tracesWithContent": 0,
        "tracesScanned": 0,
        "llmProvider": None,
        "degraded": False,
        "reason": "",
    }

    if not llm_detect.llm_available():
        meta["degraded"] = True
        meta["reason"] = "no_llm_key"
        return [], meta

    lf_result = await db.execute(
        select(LangfuseInstance).where(LangfuseInstance.user_id == user.id)
    )
    instances = lf_result.scalars().all()
    if not instances:
        meta["degraded"] = True
        meta["reason"] = "no_langfuse_connected"
        return [], meta

    by_slug = {a.slug: a for a in agents}

    # Gather candidate traces across all instances.
    traces: list[dict] = []
    for inst in instances:
        try:
            traces.extend(await _pull_langfuse_trace_content(inst))
        except Exception:
            continue
    meta["tracesPulled"] = len(traces)
    content_traces = [t for t in traces if t["prompt"] or t["response"]]
    meta["tracesWithContent"] = len(content_traces)

    if not content_traces:
        meta["degraded"] = True
        meta["reason"] = "no_prompt_capture"  # source platform isn't storing raw content
        return [], meta

    findings: list[ThreatFinding] = []
    scanned = 0
    for tr in content_traces[:max_traces]:
        agent = by_slug.get(tr["slug"])
        # Fall back to the first agent so a finding is always attributable in a demo.
        if agent is None:
            agent = agents[0] if agents else None
        if agent is None:
            continue
        ctx = {
            "agent": agent.name,
            "model": tr.get("model"),
            "lifecycle": agent.lifecycle,
            "data_classifications": agent.data_classifications,
        }
        det = await llm_detect.analyze_content_async(tr["prompt"], tr["response"], ctx)
        scanned += 1
        if det.get("provider"):
            meta["llmProvider"] = det["provider"]
        for f in det.get("findings", []):
            findings.append(ThreatFinding(
                control=f["control"],
                agent_id=agent.id,
                severity=f["severity"],
                summary=f["summary"],
                detail=_finding_detail(f, det.get("provider"), tr),
                principal=tr.get("principal"),
            ))
    meta["tracesScanned"] = scanned
    return findings, meta


def _finding_detail(f: dict, provider: str | None, trace: dict) -> str:
    bits = []
    if f.get("detail"):
        bits.append(f["detail"])
    if f.get("matched"):
        bits.append(f"Matched: “{f['matched']}”")
    conf = f.get("confidence")
    if conf is not None:
        bits.append(f"Confidence: {round(conf * 100)}%")
    bits.append(f"Source: LLM content scan ({provider or 'llm'}) · trace “{trace.get('name')}”")
    return " · ".join(bits)


# ── /scan — posture + content ──────────────────────────────────────────────────

@router.post("/scan")
async def scan_fleet(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    content: bool = Query(True, description="Also run the LLM content scan over real traces"),
):
    """Run fleet-wide posture heuristics + LLM content detection; persist findings."""
    result = await db.execute(select(Agent).where(Agent.user_id == user.id))
    agents = result.scalars().all()

    agent_ids = [a.id for a in agents]
    if agent_ids:
        await db.execute(sa_delete(ThreatFinding).where(ThreatFinding.agent_id.in_(agent_ids)))

    all_threats: list[ThreatFinding] = []
    for agent in agents:
        for finding in _scan_agent(agent):
            all_threats.append(ThreatFinding(
                control=finding["control"], agent_id=agent.id,
                severity=finding["severity"], summary=finding["summary"],
                detail=finding["detail"], principal=finding.get("principal"),
            ))

    content_meta: dict = {"degraded": True, "reason": "skipped"}
    if content:
        content_findings, content_meta = await _scan_content(db, user, agents)
        all_threats.extend(content_findings)

    for t in all_threats:
        db.add(t)
    await db.commit()
    for t in all_threats:
        await db.refresh(t)

    findings_out = [
        ThreatFindingOut(
            id=t.id, control=t.control, agentId=t.agent_id, severity=t.severity,
            summary=t.summary, detail=t.detail,
            detectedAt=t.detected_at.isoformat() if t.detected_at else "",
            principal=t.principal,
        )
        for t in all_threats
    ]
    return {
        "findings": [f.model_dump() for f in findings_out],
        "content": content_meta,
        "llm": llm_detect.status(),
    }


# ── /analyze — live single-prompt classification ───────────────────────────────

class AnalyzeRequest(BaseModel):
    prompt: str
    response: str | None = None
    agentId: str | None = None
    store: bool = False
    principal: str | None = None


@router.post("/analyze")
async def analyze_prompt(
    body: AnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Run the LLM classifier live on an ad-hoc prompt/response. Optionally store findings."""
    agent = None
    if body.agentId:
        res = await db.execute(
            select(Agent).where(Agent.id == body.agentId, Agent.user_id == user.id)
        )
        agent = res.scalar_one_or_none()

    ctx = None
    if agent:
        ctx = {
            "agent": agent.name, "lifecycle": agent.lifecycle,
            "data_classifications": agent.data_classifications,
        }

    det = await llm_detect.analyze_content_async(body.prompt, body.response, ctx)

    stored = []
    if body.store and agent and det.get("findings"):
        for f in det["findings"]:
            t = ThreatFinding(
                control=f["control"], agent_id=agent.id, severity=f["severity"],
                summary=f["summary"], detail=_finding_detail(f, det.get("provider"), {"name": "live analyze"}),
                principal=body.principal or "live-test",
            )
            db.add(t)
            stored.append(t)
        await db.commit()

    return {
        "findings": det.get("findings", []),
        "provider": det.get("provider"),
        "degraded": det.get("degraded", False),
        "reason": det.get("reason", ""),
        "stored": len(stored),
    }


@router.get("/llm-status")
async def llm_status(user: User = Depends(get_current_user)):
    return llm_detect.status()


# ── list / create / delete (unchanged behaviour) ───────────────────────────────

@router.get("/", response_model=list[ThreatFindingOut])
async def list_threats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    agent_id: str | None = Query(None),
    control: str | None = Query(None),
    severity: str | None = Query(None),
):
    stmt = (
        select(ThreatFinding)
        .join(Agent)
        .where(Agent.user_id == user.id)
        .order_by(ThreatFinding.detected_at.desc())
    )
    if agent_id:
        stmt = stmt.where(ThreatFinding.agent_id == agent_id)
    if control:
        stmt = stmt.where(ThreatFinding.control == control)
    if severity:
        stmt = stmt.where(ThreatFinding.severity == severity)

    result = await db.execute(stmt)
    return [
        ThreatFindingOut(
            id=t.id, control=t.control, agentId=t.agent_id, severity=t.severity,
            summary=t.summary, detail=t.detail,
            detectedAt=t.detected_at.isoformat() if t.detected_at else "",
            principal=t.principal,
        )
        for t in result.scalars().all()
    ]


@router.post("/", response_model=ThreatFindingOut, status_code=status.HTTP_201_CREATED)
async def create_threat(
    body: ThreatCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    agent_result = await db.execute(
        select(Agent).where(Agent.id == body.agentId, Agent.user_id == user.id)
    )
    if not agent_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Agent not found")

    threat = ThreatFinding(
        control=body.control, agent_id=body.agentId, severity=body.severity,
        summary=body.summary, detail=body.detail, principal=body.principal,
    )
    db.add(threat)
    await db.commit()
    await db.refresh(threat)

    return ThreatFindingOut(
        id=threat.id, control=threat.control, agentId=threat.agent_id,
        severity=threat.severity, summary=threat.summary, detail=threat.detail,
        detectedAt=threat.detected_at.isoformat() if threat.detected_at else "",
        principal=threat.principal,
    )


@router.delete("/{threat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_threat(
    threat_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ThreatFinding)
        .join(Agent)
        .where(ThreatFinding.id == threat_id, Agent.user_id == user.id)
    )
    threat = result.scalar_one_or_none()
    if not threat:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(threat)
    await db.commit()
