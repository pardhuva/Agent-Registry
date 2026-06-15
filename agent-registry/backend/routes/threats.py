from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Agent, ThreatFinding, User
from schemas import ThreatCreate, ThreatFindingOut

router = APIRouter(prefix="/api/threats", tags=["threats"])


def _scan_agent(agent: Agent) -> list[dict]:
    """Run heuristic security checks against a single agent record."""
    findings: list[dict] = []
    now = datetime.now(timezone.utc)
    policy = agent.policy or {}
    deps = agent.dependencies or {}
    data_cls = agent.data_classifications or []
    compliance = agent.compliance or {}

    # S1 — Firewall: prod/staging agent without firewall policy
    firewall = policy.get("firewall", {})
    if agent.lifecycle in ("prod", "staging") and not firewall.get("enabled"):
        findings.append(dict(
            control="firewall",
            severity="high",
            summary=f"No firewall policy on {agent.lifecycle} agent",
            detail=f"Agent '{agent.name}' is in {agent.lifecycle} without an active firewall policy. All prod/staging agents should have firewall enforcement.",
            principal=None,
        ))

    # S2 — Model theft: agent with tools in prod/staging, no firewall
    tools = deps.get("tools", [])
    if tools and agent.lifecycle in ("prod", "staging") and not firewall.get("enabled"):
        findings.append(dict(
            control="model_theft",
            severity="medium",
            summary="Boundary-mapping query pattern risk — tools exposed without firewall",
            detail=f"Agent has {len(tools)} tool dependencies and is in {agent.lifecycle} without firewall protection. Systematic enumeration attacks are unblocked.",
            principal="anonymous@external",
        ))

    # S3 — Jailbreak: agent with jailbreak detection explicitly off
    jailbreak = policy.get("jailbreak", {})
    if not jailbreak.get("detect", True) and agent.lifecycle != "deprecated":
        findings.append(dict(
            control="jailbreak",
            severity="high",
            summary="Jailbreak detection disabled",
            detail=f"Agent '{agent.name}' has jailbreak detection turned off. Cross-fleet signature matching is inactive for this agent.",
            principal=None,
        ))

    # S4 — PII: agent handles sensitive data without PII enforcement
    has_pii = "PII" in data_cls or "PHI" in data_cls
    dc = compliance.get("dataClassification", "")
    if dc in ("confidential", "restricted"):
        has_pii = True
    pii_policy = policy.get("pii", {})
    pii_classes = pii_policy.get("classes", [])
    pii_action = pii_policy.get("action", "log")
    if has_pii and (not pii_classes or pii_action == "log"):
        findings.append(dict(
            control="pii",
            severity="critical",
            summary="PII-handling agent without redaction enforcement",
            detail=f"Agent '{agent.name}' processes PII/sensitive data but PII policy is {'not configured' if not pii_classes else 'set to log-only'}. Redaction or blocking should be enforced.",
            principal=None,
        ))

    # S5 — Token overuse: agent in prod with no token budget
    token_budget = policy.get("tokenBudget", {})
    if agent.lifecycle == "prod" and not token_budget.get("dailyLimit"):
        findings.append(dict(
            control="token_overuse",
            severity="low",
            summary="No token budget set for production agent",
            detail=f"Agent '{agent.name}' is in production without a daily token limit. Runaway cost is possible.",
            principal=None,
        ))

    # S6 — Coherency: agent unprotected in prod
    if agent.lifecycle in ("prod", "staging") and agent.protection_status == "unprotected":
        findings.append(dict(
            control="coherency",
            severity="medium",
            summary="Unprotected agent in higher environment",
            detail=f"Agent '{agent.name}' is in {agent.lifecycle} but marked as unprotected. No runtime guardrails are active.",
            principal=None,
        ))

    return findings


@router.post("/scan", response_model=list[ThreatFindingOut])
async def scan_fleet(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Run fleet-wide security heuristics and persist findings."""
    result = await db.execute(
        select(Agent).where(Agent.user_id == user.id)
    )
    agents = result.scalars().all()

    # Clear previous scan findings for this user's agents
    agent_ids = [a.id for a in agents]
    if agent_ids:
        await db.execute(
            sa_delete(ThreatFinding).where(ThreatFinding.agent_id.in_(agent_ids))
        )

    all_threats: list[ThreatFinding] = []
    for agent in agents:
        for finding in _scan_agent(agent):
            t = ThreatFinding(
                control=finding["control"],
                agent_id=agent.id,
                severity=finding["severity"],
                summary=finding["summary"],
                detail=finding["detail"],
                principal=finding.get("principal"),
            )
            db.add(t)
            all_threats.append(t)

    await db.commit()
    for t in all_threats:
        await db.refresh(t)

    return [
        ThreatFindingOut(
            id=t.id,
            control=t.control,
            agentId=t.agent_id,
            severity=t.severity,
            summary=t.summary,
            detail=t.detail,
            detectedAt=t.detected_at.isoformat() if t.detected_at else "",
            principal=t.principal,
        )
        for t in all_threats
    ]


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
            id=t.id,
            control=t.control,
            agentId=t.agent_id,
            severity=t.severity,
            summary=t.summary,
            detail=t.detail,
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
        control=body.control,
        agent_id=body.agentId,
        severity=body.severity,
        summary=body.summary,
        detail=body.detail,
        principal=body.principal,
    )
    db.add(threat)
    await db.commit()
    await db.refresh(threat)

    return ThreatFindingOut(
        id=threat.id,
        control=threat.control,
        agentId=threat.agent_id,
        severity=threat.severity,
        summary=threat.summary,
        detail=threat.detail,
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
