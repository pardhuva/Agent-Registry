"""
Capture adapter routes — SDK & Gateway integration endpoints.

These endpoints are called by the Python SDK (Style 1) and the Gateway (Style 2)
to look up agent policies, confirm first instrumented call, and report telemetry.
"""
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import llm_detect
from auth import get_current_user
from database import get_db
from models import Agent, AuditEvent, ThreatFinding, User

router = APIRouter(prefix="/api/capture", tags=["capture"])

GATEWAY_URL = os.getenv("IBASEIT_GATEWAY_URL", "http://localhost:8001")


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
    connected = False
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{GATEWAY_URL}/health")
        connected = resp.status_code == 200
    except Exception:
        pass
    return GatewayStatusResponse(registryConnected=connected)


# ── Live gateway test call (powers the J2 "send a real call" demo) ──────────

class TestCallRequest(BaseModel):
    agentId: str | None = None
    agentSlug: str | None = None
    prompt: str = "Hello! Briefly, what can you help me with?"
    provider: str = "groq"


class TestCallResponse(BaseModel):
    ok: bool
    blocked: bool
    status: int
    enforced: bool
    protectionStatus: str
    captureStyle: str | None = None
    detail: str
    responsePreview: str | None = None
    policyEnforcedHeader: bool = False


@router.post("/test-call", response_model=TestCallResponse)
async def gateway_test_call(
    body: TestCallRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Send a *real* request through the live IBaseIT gateway for an agent, using
    the configured provider key. The gateway fetches the agent's policy,
    enforces it (may block), forwards to the provider, and confirms the first
    instrumented call — flipping the badge to Protected for real.
    """
    if body.agentId:
        res = await db.execute(select(Agent).where(Agent.id == body.agentId, Agent.user_id == user.id))
    elif body.agentSlug:
        res = await db.execute(select(Agent).where(Agent.slug == body.agentSlug, Agent.user_id == user.id))
    else:
        raise HTTPException(status_code=400, detail="Provide agentId or agentSlug")
    agent = res.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    provider = body.provider.lower()
    provider_key = llm_detect._key("GROQ_API_KEY" if provider == "groq" else "OPENAI_API_KEY")
    if not provider_key:
        raise HTTPException(status_code=400, detail=f"No API key configured for provider '{provider}'")
    model = "llama-3.3-70b-versatile" if provider == "groq" else "gpt-4o-mini"

    # The token the browser sent us is forwarded so the gateway can read policy.
    auth_header = request.headers.get("authorization", "")
    registry_token = auth_header.split(" ", 1)[1] if auth_header.lower().startswith("bearer ") else ""

    headers = {
        "Authorization": f"Bearer {provider_key}",
        "Content-Type": "application/json",
        "X-Agent-Id": agent.slug,
        "X-Provider": provider,
        "X-Registry-Token": registry_token,
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": body.prompt}],
        "max_tokens": 120,
    }

    blocked = False
    status_code = 0
    preview = None
    policy_enforced = False
    detail = ""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(f"{GATEWAY_URL}/v1/chat/completions", headers=headers, json=payload)
        status_code = resp.status_code
        policy_enforced = resp.headers.get("x-ibaseit-policy-enforced") == "true"
        if resp.status_code == 403:
            blocked = True
            try:
                detail = resp.json().get("detail", "Blocked by policy")
            except Exception:
                detail = "Blocked by policy"
        elif resp.status_code == 200:
            try:
                data = resp.json()
                preview = (data.get("choices", [{}])[0].get("message", {}).get("content") or "")[:280]
            except Exception:
                preview = None
            detail = "Request passed policy and reached the model."
        else:
            detail = f"Gateway returned {resp.status_code}: {resp.text[:200]}"
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gateway unreachable at {GATEWAY_URL}: {e}")

    # Re-read the agent — the gateway will have confirmed instrumentation.
    await db.refresh(agent)

    return TestCallResponse(
        ok=status_code in (200, 403),
        blocked=blocked,
        status=status_code,
        enforced=policy_enforced or blocked,
        protectionStatus=agent.protection_status or "unprotected",
        captureStyle=agent.capture_style,
        detail=detail,
        responsePreview=preview,
        policyEnforcedHeader=policy_enforced,
    )
