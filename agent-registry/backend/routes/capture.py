"""
Capture adapter routes — SDK & Gateway integration endpoints.

These endpoints are called by the Python SDK (Style 1) and the Gateway (Style 2)
to look up agent policies, confirm first instrumented call, and report telemetry.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import get_current_user
from database import get_db
from models import Agent, AuditEvent, ThreatFinding, User

router = APIRouter(prefix="/api/capture", tags=["capture"])


class InstrumentRequest(BaseModel):
    agentSlug: str | None = None
    agentId: str | None = None
    captureStyle: str = "sdk"


class InstrumentResponse(BaseModel):
    agentId: str
    protectionStatus: str
    firstInstrumentedAt: str | None = None
    message: str


class AgentPolicyResponse(BaseModel):
    agentId: str
    slug: str
    protectionStatus: str | None
    policy: dict | None


class GatewayStatusResponse(BaseModel):
    gateway: bool = True
    registryConnected: bool = True
    providers: list[str] = ["openai", "anthropic", "groq"]
    port: int = 8001


# ── Lookup agent by slug (for SDK/Gateway) ────────────────────────────────

@router.get("/lookup", response_model=AgentPolicyResponse)
async def lookup_agent(
    slug: str = Query(..., description="Agent slug for policy lookup"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Look up an agent by slug and return its policy. Used by SDK and Gateway."""
    result = await db.execute(
        select(Agent).where(Agent.slug == slug, Agent.user_id == user.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent with slug '{slug}' not found")
    return AgentPolicyResponse(
        agentId=agent.id,
        slug=agent.slug,
        protectionStatus=agent.protection_status,
        policy=agent.policy,
    )


# ── Confirm first instrumented call ───────────────────────────────────────

@router.post("/instrument", response_model=InstrumentResponse)
async def confirm_instrument(
    body: InstrumentRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Called by the SDK or Gateway when the first instrumented call is observed.
    Flips the agent's badge from 'awaiting_event' to 'protected'.
    """
    if body.agentId:
        result = await db.execute(
            select(Agent).where(Agent.id == body.agentId, Agent.user_id == user.id)
        )
    elif body.agentSlug:
        result = await db.execute(
            select(Agent).where(Agent.slug == body.agentSlug, Agent.user_id == user.id)
        )
    else:
        raise HTTPException(status_code=400, detail="Provide agentId or agentSlug")

    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    now = datetime.now(timezone.utc)

    if not agent.first_instrumented_at:
        agent.first_instrumented_at = now
        agent.protection_status = "protected"
        agent.capture_style = body.captureStyle

        event = AuditEvent(
            agent_id=agent.id,
            actor=f"capture:{body.captureStyle}",
            action="updated",
            summary=f"First instrumented call confirmed via {body.captureStyle.upper()}",
        )
        db.add(event)
        await db.commit()

        return InstrumentResponse(
            agentId=agent.id,
            protectionStatus="protected",
            firstInstrumentedAt=now.isoformat(),
            message=f"Agent '{agent.slug}' is now protected via {body.captureStyle}",
        )

    return InstrumentResponse(
        agentId=agent.id,
        protectionStatus=agent.protection_status or "protected",
        firstInstrumentedAt=agent.first_instrumented_at.isoformat(),
        message="Agent already instrumented",
    )


# ── Report threat from SDK/Gateway ────────────────────────────────────────

class ThreatReport(BaseModel):
    agentSlug: str | None = None
    agentId: str | None = None
    control: str
    severity: str = "high"
    summary: str
    detail: str | None = None
    source: str = "sdk"


@router.post("/threat")
async def report_threat(
    body: ThreatReport,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Report a policy violation detected by SDK or Gateway."""
    if body.agentId:
        result = await db.execute(
            select(Agent).where(Agent.id == body.agentId, Agent.user_id == user.id)
        )
    elif body.agentSlug:
        result = await db.execute(
            select(Agent).where(Agent.slug == body.agentSlug, Agent.user_id == user.id)
        )
    else:
        raise HTTPException(status_code=400, detail="Provide agentId or agentSlug")

    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    finding = ThreatFinding(
        control=body.control,
        agent_id=agent.id,
        severity=body.severity,
        summary=body.summary,
        detail=body.detail,
        principal=f"capture:{body.source}",
    )
    db.add(finding)
    await db.commit()
    return {"status": "recorded", "agentId": agent.id}


# ── Gateway status ────────────────────────────────────────────────────────

@router.get("/gateway/status", response_model=GatewayStatusResponse)
async def gateway_status():
    """Check gateway availability and config."""
    import httpx
    connected = False
    try:
        resp = httpx.get("http://localhost:8001/health", timeout=3)
        connected = resp.status_code == 200
    except Exception:
        pass
    return GatewayStatusResponse(registryConnected=connected)
