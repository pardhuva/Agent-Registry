"""
Telemetry Ingestion Engine (Phase 1: Connect → Detect)

Pulls traces from connected observability platforms (Langfuse, LangSmith),
reconciles them into agent records, and infers dependencies from spans.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Agent, LangfuseInstance, LangSmithInstance, User

router = APIRouter(prefix="/api/ingestion", tags=["ingestion"])


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


# ── Langfuse ingestion ────────────────────────────────────────────────────

async def _pull_langfuse_traces(instance: LangfuseInstance, limit: int = 100) -> list[dict]:
    """Pull recent traces from Langfuse API."""
    auth = httpx.BasicAuth(instance.public_key, instance.secret_key)
    url = f"{instance.host_url.rstrip('/')}/api/public/traces"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, auth=auth, params={"limit": limit, "orderBy": "timestamp.desc"})
        if resp.status_code != 200:
            return []
        return resp.json().get("data", [])


async def _pull_langfuse_observations(instance: LangfuseInstance, trace_id: str) -> list[dict]:
    """Pull observations (spans) for a specific trace."""
    auth = httpx.BasicAuth(instance.public_key, instance.secret_key)
    url = f"{instance.host_url.rstrip('/')}/api/public/observations"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, auth=auth, params={"traceId": trace_id, "limit": 100})
        if resp.status_code != 200:
            return []
        return resp.json().get("data", [])


def _extract_agent_info_from_traces(traces: list[dict]) -> dict[str, dict]:
    """Group traces by agent name and extract metadata."""
    agents: dict[str, dict] = {}
    for trace in traces:
        name = trace.get("name") or trace.get("id", "unknown")
        slug = _slugify(name)
        if slug not in agents:
            agents[slug] = {
                "name": name,
                "slug": slug,
                "trace_count": 0,
                "total_tokens": 0,
                "models_used": set(),
                "first_seen": trace.get("timestamp"),
                "last_seen": trace.get("timestamp"),
                "tags": list(trace.get("tags", [])),
                "metadata": trace.get("metadata", {}),
            }
        info = agents[slug]
        info["trace_count"] += 1

        usage = trace.get("usage") or {}
        info["total_tokens"] += (usage.get("totalTokens") or usage.get("total_tokens") or 0)

        ts = trace.get("timestamp")
        if ts:
            if not info["first_seen"] or ts < info["first_seen"]:
                info["first_seen"] = ts
            if not info["last_seen"] or ts > info["last_seen"]:
                info["last_seen"] = ts

    return agents


def _extract_dependencies_from_observations(observations: list[dict]) -> dict:
    """Infer models, tools, and data sources from span observations."""
    models = set()
    tools = set()
    for obs in observations:
        obs_type = obs.get("type", "")
        model = obs.get("model")
        if model:
            models.add(model)
        if obs_type == "TOOL" or obs.get("name", "").startswith("tool_"):
            tools.add(obs.get("name", "unknown_tool"))
    return {
        "models": sorted(models),
        "tools": sorted(tools),
        "dataSources": [],
        "agents": [],
    }


# ── LangSmith ingestion ──────────────────────────────────────────────────

async def _pull_langsmith_runs(instance: LangSmithInstance, limit: int = 100) -> list[dict]:
    """Pull recent runs from LangSmith API."""
    headers = {"x-api-key": instance.api_key}
    url = f"{instance.api_url.rstrip('/')}/runs/query"
    body = {
        "project_name": instance.project,
        "is_root": True,
        "limit": limit,
        "select": ["name", "run_type", "status", "total_tokens", "start_time", "end_time", "tags", "extra"],
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code != 200:
            return []
        return resp.json().get("runs", [])


def _extract_agent_info_from_runs(runs: list[dict]) -> dict[str, dict]:
    """Group LangSmith runs by agent name."""
    agents: dict[str, dict] = {}
    for run in runs:
        name = run.get("name", "unknown")
        slug = _slugify(name)
        if slug not in agents:
            agents[slug] = {
                "name": name,
                "slug": slug,
                "trace_count": 0,
                "total_tokens": 0,
                "models_used": set(),
                "first_seen": run.get("start_time"),
                "last_seen": run.get("start_time"),
                "tags": list(run.get("tags") or []),
                "metadata": {},
            }
        info = agents[slug]
        info["trace_count"] += 1
        info["total_tokens"] += (run.get("total_tokens") or 0)

        extra = run.get("extra") or {}
        runtime = extra.get("runtime") or {}
        model = runtime.get("model") or extra.get("model_name")
        if model:
            info["models_used"].add(model)

    return agents


# ── Reconciliation ────────────────────────────────────────────────────────

async def _reconcile_agents(
    db: AsyncSession,
    user: User,
    discovered: dict[str, dict],
    source_platform: str,
) -> dict:
    """Reconcile discovered agents against existing registry records."""
    result = await db.execute(
        select(Agent).where(Agent.user_id == user.id)
    )
    existing = {a.slug: a for a in result.scalars().all()}

    created = []
    updated = []
    unchanged = []

    for slug, info in discovered.items():
        # Convert sets to lists for JSON serialization
        models_list = sorted(info.get("models_used", set())) if isinstance(info.get("models_used"), set) else info.get("models_used", [])

        if slug in existing:
            agent = existing[slug]
            deps = agent.dependencies or {"models": [], "tools": [], "dataSources": [], "agents": []}
            existing_models = set(deps.get("models", []))
            new_models = set(models_list)

            if new_models - existing_models:
                deps["models"] = sorted(existing_models | new_models)
                agent.dependencies = deps
                updated.append(slug)
            else:
                unchanged.append(slug)
        else:
            agent = Agent(
                name=info["name"],
                slug=slug,
                description=f"Auto-discovered from {source_platform} telemetry. {info['trace_count']} traces observed.",
                tags=info.get("tags", []),
                platforms=[source_platform],
                user_id=user.id,
                owner=user.email,
                team="AI Platform",
                version="1.0.0",
                lifecycle="dev",
                source_platform=source_platform,
                dependencies={
                    "models": models_list,
                    "tools": [],
                    "dataSources": [],
                    "agents": [],
                },
                first_instrumented_at=datetime.now(timezone.utc),
            )
            db.add(agent)
            created.append(slug)

    await db.commit()
    return {
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
    }


# ── API Endpoints ─────────────────────────────────────────────────────────

@router.post("/langfuse/pull")
async def pull_langfuse(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Pull traces from all connected Langfuse instances and reconcile agents."""
    result = await db.execute(
        select(LangfuseInstance).where(LangfuseInstance.user_id == user.id)
    )
    instances = result.scalars().all()
    if not instances:
        raise HTTPException(status_code=404, detail="No Langfuse instances connected")

    all_discovered: dict[str, dict] = {}
    instance_results = []

    for inst in instances:
        traces = await _pull_langfuse_traces(inst)

        # For each trace, pull observations to get model/tool details
        for trace in traces[:20]:  # Limit deep inspection to first 20
            trace_id = trace.get("id")
            if trace_id:
                observations = await _pull_langfuse_observations(inst, trace_id)
                deps = _extract_dependencies_from_observations(observations)
                trace["_inferred_models"] = deps["models"]
                trace["_inferred_tools"] = deps["tools"]

        discovered = _extract_agent_info_from_traces(traces)

        # Merge inferred models from observations
        for trace in traces[:20]:
            name = trace.get("name") or trace.get("id", "unknown")
            slug = _slugify(name)
            if slug in discovered:
                for m in trace.get("_inferred_models", []):
                    discovered[slug]["models_used"].add(m)

        all_discovered.update(discovered)
        instance_results.append({
            "instance": inst.name,
            "traces_pulled": len(traces),
            "agents_found": len(discovered),
        })

    reconciled = await _reconcile_agents(db, user, all_discovered, "langfuse")

    return {
        "platform": "langfuse",
        "instances": instance_results,
        "reconciled": reconciled,
        "total_agents_discovered": len(all_discovered),
    }


@router.post("/langsmith/pull")
async def pull_langsmith(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Pull runs from all connected LangSmith instances and reconcile agents."""
    result = await db.execute(
        select(LangSmithInstance).where(LangSmithInstance.user_id == user.id)
    )
    instances = result.scalars().all()
    if not instances:
        raise HTTPException(status_code=404, detail="No LangSmith instances connected")

    all_discovered: dict[str, dict] = {}
    instance_results = []

    for inst in instances:
        runs = await _pull_langsmith_runs(inst)
        discovered = _extract_agent_info_from_runs(runs)
        all_discovered.update(discovered)
        instance_results.append({
            "instance": inst.name,
            "runs_pulled": len(runs),
            "agents_found": len(discovered),
        })

    reconciled = await _reconcile_agents(db, user, all_discovered, "langsmith")

    return {
        "platform": "langsmith",
        "instances": instance_results,
        "reconciled": reconciled,
        "total_agents_discovered": len(all_discovered),
    }


@router.post("/pull-all")
async def pull_all(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Pull from all connected platforms at once."""
    results = {}

    # Langfuse
    lf_result = await db.execute(
        select(LangfuseInstance).where(LangfuseInstance.user_id == user.id)
    )
    if lf_result.scalars().first():
        try:
            results["langfuse"] = await _pull_langfuse_inner(db, user)
        except httpx.RequestError:
            results["langfuse"] = {"error": "Langfuse connection failed"}
        except Exception:
            results["langfuse"] = {"error": "Langfuse pull failed"}

    # LangSmith
    ls_result = await db.execute(
        select(LangSmithInstance).where(LangSmithInstance.user_id == user.id)
    )
    if ls_result.scalars().first():
        try:
            results["langsmith"] = await _pull_langsmith_inner(db, user)
        except httpx.RequestError:
            results["langsmith"] = {"error": "LangSmith connection failed"}
        except Exception:
            results["langsmith"] = {"error": "LangSmith pull failed"}

    return {"platforms": results}


async def _pull_langfuse_inner(db: AsyncSession, user: User) -> dict:
    result = await db.execute(
        select(LangfuseInstance).where(LangfuseInstance.user_id == user.id)
    )
    instances = result.scalars().all()
    all_discovered: dict[str, dict] = {}
    for inst in instances:
        traces = await _pull_langfuse_traces(inst)
        for trace in traces[:20]:
            trace_id = trace.get("id")
            if trace_id:
                observations = await _pull_langfuse_observations(inst, trace_id)
                deps = _extract_dependencies_from_observations(observations)
                trace["_inferred_models"] = deps["models"]
        discovered = _extract_agent_info_from_traces(traces)
        for trace in traces[:20]:
            name = trace.get("name") or trace.get("id", "unknown")
            slug = _slugify(name)
            if slug in discovered:
                for m in trace.get("_inferred_models", []):
                    discovered[slug]["models_used"].add(m)
        all_discovered.update(discovered)

    return await _reconcile_agents(db, user, all_discovered, "langfuse")


async def _pull_langsmith_inner(db: AsyncSession, user: User) -> dict:
    result = await db.execute(
        select(LangSmithInstance).where(LangSmithInstance.user_id == user.id)
    )
    instances = result.scalars().all()
    all_discovered: dict[str, dict] = {}
    for inst in instances:
        runs = await _pull_langsmith_runs(inst)
        discovered = _extract_agent_info_from_runs(runs)
        all_discovered.update(discovered)

    return await _reconcile_agents(db, user, all_discovered, "langsmith")
