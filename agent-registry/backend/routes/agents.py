from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import get_current_user
from database import get_db
from models import Agent, AgentSnapshot, AuditEvent, User
from schemas import (
    AgentCreate,
    AgentOut,
    AgentSnapshotOut,
    AgentUpdate,
    AuditEventOut,
    PolicySchema,
)

router = APIRouter(prefix="/api/agents", tags=["agents"])

LIFECYCLE_ORDER = ["dev", "staging", "prod", "deprecated"]


def _agent_to_out(a: Agent) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "slug": a.slug,
        "description": a.description,
        "systemPrompt": a.system_prompt,
        "tags": a.tags or [],
        "platforms": a.platforms or [],
        "createdAt": a.created_at.isoformat() if a.created_at else "",
        "userId": a.user_id,
        "owner": a.owner,
        "team": a.team,
        "oncall": a.oncall,
        "capability": a.capability,
        "version": a.version,
        "lifecycle": a.lifecycle,
        "dependencies": a.dependencies,
        "accessScope": a.access_scope,
        "guardrails": a.guardrails,
        "compliance": a.compliance,
        "approvedBy": a.approved_by,
        "approvedAt": a.approved_at.isoformat() if a.approved_at else None,
        "capabilitySpec": a.capability_spec,
        "riskTier": a.risk_tier,
        "dataClassifications": a.data_classifications,
        "sourcePlatform": a.source_platform,
        "protectionStatus": a.protection_status,
        "captureStyle": a.capture_style,
        "firstInstrumentedAt": a.first_instrumented_at.isoformat() if a.first_instrumented_at else None,
        "policy": a.policy,
        "auditLog": [
            {
                "id": e.id,
                "at": e.at.isoformat() if e.at else "",
                "actor": e.actor,
                "action": e.action,
                "from": e.from_state,
                "to": e.to_state,
                "summary": e.summary,
                "snapshotId": e.snapshot_id,
            }
            for e in (a.audit_log or [])
        ],
        "snapshots": [
            {"id": s.id, "at": s.at.isoformat() if s.at else "", "data": s.data}
            for s in (a.snapshots or [])
        ],
        "threats": [
            {
                "id": t.id,
                "control": t.control,
                "agentId": t.agent_id,
                "severity": t.severity,
                "summary": t.summary,
                "detail": t.detail,
                "detectedAt": t.detected_at.isoformat() if t.detected_at else "",
                "principal": t.principal,
            }
            for t in (a.threats or [])
        ],
    }


def _snapshot_data(a: Agent) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "slug": a.slug,
        "description": a.description,
        "systemPrompt": a.system_prompt,
        "tags": a.tags,
        "platforms": a.platforms,
        "createdAt": a.created_at.isoformat() if a.created_at else "",
        "userId": a.user_id,
        "owner": a.owner,
        "team": a.team,
        "oncall": a.oncall,
        "capability": a.capability,
        "version": a.version,
        "lifecycle": a.lifecycle,
        "dependencies": a.dependencies,
        "compliance": a.compliance,
        "riskTier": a.risk_tier,
        "dataClassifications": a.data_classifications,
        "protectionStatus": a.protection_status,
        "policy": a.policy,
    }


def _eager():
    return [
        selectinload(Agent.audit_log),
        selectinload(Agent.snapshots),
        selectinload(Agent.threats),
    ]


@router.get("/", response_model=list[AgentOut])
async def list_agents(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    lifecycle: str | None = Query(None),
    team: str | None = Query(None),
):
    stmt = select(Agent).where(Agent.user_id == user.id).options(*_eager())
    if lifecycle:
        stmt = stmt.where(Agent.lifecycle == lifecycle)
    if team:
        stmt = stmt.where(Agent.team == team)
    stmt = stmt.order_by(Agent.created_at.desc())
    result = await db.execute(stmt)
    return [_agent_to_out(a) for a in result.scalars().all()]


@router.post("/", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
async def create_agent(
    body: AgentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    agent = Agent(
        name=body.name,
        slug=body.slug,
        description=body.description,
        system_prompt=body.systemPrompt,
        tags=body.tags,
        platforms=body.platforms,
        user_id=user.id,
        owner=body.owner,
        team=body.team,
        oncall=body.oncall,
        capability=body.capability,
        version=body.version,
        lifecycle=body.lifecycle,
        dependencies=body.dependencies.model_dump() if body.dependencies else None,
        access_scope=body.accessScope,
        guardrails=body.guardrails,
        compliance=body.compliance.model_dump() if body.compliance else None,
        capability_spec=body.capabilitySpec.model_dump() if body.capabilitySpec else None,
        risk_tier=body.riskTier,
        data_classifications=body.dataClassifications,
        source_platform=body.sourcePlatform,
        protection_status=body.protectionStatus,
        capture_style=body.captureStyle,
        policy=body.policy.model_dump() if body.policy else PolicySchema().model_dump(),
    )
    db.add(agent)
    await db.flush()

    snap = AgentSnapshot(agent_id=agent.id, data=_snapshot_data(agent))
    db.add(snap)
    await db.flush()

    event = AuditEvent(
        agent_id=agent.id,
        actor=user.email,
        action="created",
        summary=f"Registered as {agent.lifecycle}",
        snapshot_id=snap.id,
    )
    db.add(event)
    await db.commit()

    refreshed = await db.execute(
        select(Agent).where(Agent.id == agent.id).options(*_eager())
    )
    return _agent_to_out(refreshed.scalar_one())


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Agent)
        .where(Agent.id == agent_id, Agent.user_id == user.id)
        .options(*_eager())
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _agent_to_out(agent)


@router.patch("/{agent_id}", response_model=AgentOut)
async def update_agent(
    agent_id: str,
    body: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    summary: str | None = Query(None),
):
    result = await db.execute(
        select(Agent)
        .where(Agent.id == agent_id, Agent.user_id == user.id)
        .options(*_eager())
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    pre_snap = AgentSnapshot(agent_id=agent.id, data=_snapshot_data(agent))
    db.add(pre_snap)
    await db.flush()

    old_lifecycle = agent.lifecycle
    changed_fields: list[str] = []
    update_data = body.model_dump(exclude_unset=True)

    field_map = {
        "systemPrompt": "system_prompt",
        "accessScope": "access_scope",
        "approvedBy": "approved_by",
        "capabilitySpec": "capability_spec",
        "riskTier": "risk_tier",
        "dataClassifications": "data_classifications",
        "sourcePlatform": "source_platform",
        "protectionStatus": "protection_status",
        "captureStyle": "capture_style",
    }

    for key, value in update_data.items():
        db_field = field_map.get(key, key)
        if hasattr(value, "model_dump"):
            value = value.model_dump()
        if getattr(agent, db_field, None) != value:
            changed_fields.append(key)
        setattr(agent, db_field, value)

    new_lifecycle = agent.lifecycle
    action = "updated"
    audit_summary = summary
    if old_lifecycle != new_lifecycle:
        oi = LIFECYCLE_ORDER.index(old_lifecycle) if old_lifecycle in LIFECYCLE_ORDER else 0
        ni = LIFECYCLE_ORDER.index(new_lifecycle) if new_lifecycle in LIFECYCLE_ORDER else 0
        action = "promoted" if ni > oi else "demoted"
        audit_summary = f"{old_lifecycle} → {new_lifecycle}"
    elif not audit_summary:
        if changed_fields:
            display = ", ".join(changed_fields[:6])
            if len(changed_fields) > 6:
                display += "…"
            audit_summary = f"Edited: {display}"
        else:
            audit_summary = "No-op edit"

    event = AuditEvent(
        agent_id=agent.id,
        actor=user.email,
        action=action,
        from_state=old_lifecycle if action != "updated" else None,
        to_state=new_lifecycle if action != "updated" else None,
        summary=audit_summary,
        snapshot_id=pre_snap.id,
    )
    db.add(event)
    await db.commit()

    refreshed = await db.execute(
        select(Agent).where(Agent.id == agent.id).options(*_eager())
    )
    return _agent_to_out(refreshed.scalar_one())


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.user_id == user.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.delete(agent)
    await db.commit()


@router.post("/{agent_id}/restore/{snapshot_id}", response_model=AgentOut)
async def restore_snapshot(
    agent_id: str,
    snapshot_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Agent)
        .where(Agent.id == agent_id, Agent.user_id == user.id)
        .options(*_eager())
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    snap = next((s for s in agent.snapshots if s.id == snapshot_id), None)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    pre_restore_snap = AgentSnapshot(agent_id=agent.id, data=_snapshot_data(agent))
    db.add(pre_restore_snap)
    await db.flush()

    data = snap.data
    for key in ["name", "slug", "description", "owner", "team", "oncall", "capability",
                "version", "lifecycle", "guardrails"]:
        if key in data:
            setattr(agent, key, data[key])
    for key in ["tags", "platforms", "dependencies", "compliance", "policy",
                "data_classifications", "access_scope", "capability_spec"]:
        camel = key
        if key == "system_prompt":
            camel = "systemPrompt"
        if camel in data:
            setattr(agent, key, data[camel])
    if "systemPrompt" in data:
        agent.system_prompt = data["systemPrompt"]
    if "riskTier" in data:
        agent.risk_tier = data["riskTier"]
    if "protectionStatus" in data:
        agent.protection_status = data["protectionStatus"]

    event = AuditEvent(
        agent_id=agent.id,
        actor=user.email,
        action="restored",
        summary=f"Restored snapshot from {snap.at.isoformat() if snap.at else 'unknown'}",
        snapshot_id=pre_restore_snap.id,
    )
    db.add(event)
    await db.commit()

    refreshed = await db.execute(
        select(Agent).where(Agent.id == agent.id).options(*_eager())
    )
    return _agent_to_out(refreshed.scalar_one())
