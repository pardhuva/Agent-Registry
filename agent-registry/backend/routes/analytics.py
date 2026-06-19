"""
Fleet security analytics — the cross-agent "Build" differentiators from the spec.

No single observability tool has the fleet vantage point: it only sees its own
traces. The registry sees all of them, so it can correlate across agents:

  S2  Model-theft      — per-principal query volume / breadth baselining over
                         telemetry, anomaly-scored. Read-only, zero client code.
  S3  Jailbreak        — shared attack signatures + repeat-offender tracking
                         (one principal hitting many agents) across the fleet.
  S6  PII exfiltration — egress-trend over time, tied to data classification.
  S4  Coherency        — consume eval/quality scores the platform already emits.
"""
from __future__ import annotations

import logging
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _utc_iso(dt: datetime | None) -> str:
    if not dt:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Agent, LangfuseInstance, ThreatFinding, User

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


async def _user_agents(db: AsyncSession, user: User) -> list[Agent]:
    res = await db.execute(select(Agent).where(Agent.user_id == user.id))
    return list(res.scalars().all())


async def _user_findings(db: AsyncSession, user: User) -> list[ThreatFinding]:
    res = await db.execute(
        select(ThreatFinding).join(Agent).where(Agent.user_id == user.id)
        .order_by(ThreatFinding.detected_at.desc())
    )
    return list(res.scalars().all())


# ── S3: repeat offenders (one principal across many agents) ────────────────────

@router.get("/repeat-offenders")
async def repeat_offenders(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    findings = await _user_findings(db, user)
    agents = {a.id: a for a in await _user_agents(db, user)}

    by_principal: dict[str, dict] = {}
    for f in findings:
        p = f.principal or "unknown"
        if p in ("unknown", None) or p.startswith("capture:"):
            # still track, but de-emphasise non-attributable
            pass
        entry = by_principal.setdefault(p, {
            "principal": p, "attempts": 0, "agents": set(), "controls": Counter(),
            "maxSeverity": "low", "lastSeen": None,
        })
        entry["attempts"] += 1
        entry["agents"].add(agents.get(f.agent_id).name if agents.get(f.agent_id) else f.agent_id)
        entry["controls"][f.control] += 1
        sev_rank = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        if sev_rank.get(f.severity, 0) > sev_rank.get(entry["maxSeverity"], 0):
            entry["maxSeverity"] = f.severity
        ts = _utc_iso(f.detected_at) or None
        if ts and (entry["lastSeen"] is None or ts > entry["lastSeen"]):
            entry["lastSeen"] = ts

    out = []
    for e in by_principal.values():
        agent_count = len(e["agents"])
        # escalate when a single actor hits multiple agents repeatedly
        escalate = e["attempts"] >= 3 or agent_count >= 2
        out.append({
            "principal": e["principal"],
            "attempts": e["attempts"],
            "agentsTargeted": agent_count,
            "agents": sorted(e["agents"]),
            "controls": dict(e["controls"]),
            "maxSeverity": e["maxSeverity"],
            "lastSeen": e["lastSeen"],
            "escalate": escalate,
        })
    out.sort(key=lambda x: (x["agentsTargeted"], x["attempts"]), reverse=True)
    return {"offenders": out, "total": len(out)}


# ── S3: shared jailbreak signatures across the fleet ───────────────────────────

@router.get("/jailbreak-signatures")
async def jailbreak_signatures(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    findings = await _user_findings(db, user)
    agents = {a.id: a for a in await _user_agents(db, user)}

    sigs: dict[str, dict] = {}
    for f in findings:
        if f.control != "jailbreak":
            continue
        # extract the matched snippet from the summary/detail
        snippet = ""
        m = re.search(r"[:'“]\s*['“]?([^'”]{4,80})", f.summary or "")
        if m:
            snippet = m.group(1).strip().strip("'“”").lower()
        if not snippet and f.detail:
            dm = re.search(r"Matched:\s*[“\"']([^”\"']{4,80})", f.detail)
            if dm:
                snippet = dm.group(1).strip().lower()
        if not snippet:
            snippet = (f.summary or "jailbreak")[:60].lower()
        entry = sigs.setdefault(snippet, {"signature": snippet, "seenCount": 0, "agents": set()})
        entry["seenCount"] += 1
        a = agents.get(f.agent_id)
        entry["agents"].add(a.name if a else f.agent_id)

    out = [
        {"signature": s["signature"], "seenCount": s["seenCount"],
         "agentsAffected": len(s["agents"]), "agents": sorted(s["agents"]),
         "distributedToFleet": True}
        for s in sigs.values()
    ]
    out.sort(key=lambda x: x["seenCount"], reverse=True)
    return {"signatures": out, "total": len(out)}


# ── S2: model-theft / extraction-pattern detection over telemetry ──────────────

async def _pull_principals(inst: LangfuseInstance, limit: int = 200) -> list[dict]:
    auth = httpx.BasicAuth(inst.public_key, inst.secret_key)
    base = inst.host_url.rstrip("/")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{base}/api/public/traces",
                                auth=auth, params={"limit": limit, "orderBy": "timestamp.desc"})
        if resp.status_code != 200:
            return []
        rows = []
        for tr in resp.json().get("data", []):
            meta = tr.get("metadata") or {}
            principal = tr.get("userId") or meta.get("user_id") or tr.get("sessionId") or "anonymous"
            rows.append({
                "principal": principal,
                "name": tr.get("name") or "unknown",
                "timestamp": tr.get("timestamp"),
            })
        return rows


@router.get("/model-theft")
async def model_theft(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    res = await db.execute(select(LangfuseInstance).where(LangfuseInstance.user_id == user.id))
    instances = res.scalars().all()
    if not instances:
        return {"signals": [], "degraded": True, "reason": "no_langfuse_connected", "totalQueries": 0}

    rows: list[dict] = []
    for inst in instances:
        try:
            rows.extend(await _pull_principals(inst))
        except Exception as exc:
            logger.warning("Failed to pull principals from Langfuse instance %r: %s", inst.name, exc)
            continue
    if not rows:
        return {"signals": [], "degraded": True, "reason": "no_traces", "totalQueries": 0}

    by_principal: dict[str, dict] = {}
    for r in rows:
        e = by_principal.setdefault(r["principal"], {"principal": r["principal"], "queries": 0, "targets": Counter()})
        e["queries"] += 1
        e["targets"][r["name"]] += 1

    total = len(rows)
    n_principals = max(1, len(by_principal))
    mean = total / n_principals

    signals = []
    for e in by_principal.values():
        breadth = len(e["targets"])
        volume = e["queries"]
        # anomaly score: volume relative to fleet mean + breadth of enumeration
        ratio = volume / mean if mean else 1
        score = min(100, round((ratio - 1) * 40 + breadth * 8))
        score = max(0, score)
        risk = "high" if score >= 60 else "medium" if score >= 30 else "low"
        if score >= 30:  # only surface anomalies
            signals.append({
                "principal": e["principal"],
                "queries": volume,
                "breadth": breadth,
                "targets": [k for k, _ in e["targets"].most_common(5)],
                "anomalyScore": score,
                "risk": risk,
                "pattern": "enumeration / boundary-mapping" if breadth >= 3 else "abnormal query volume",
            })
    signals.sort(key=lambda x: x["anomalyScore"], reverse=True)
    return {
        "signals": signals,
        "degraded": False,
        "reason": "",
        "totalQueries": total,
        "principals": n_principals,
        "meanQueriesPerPrincipal": round(mean, 1),
    }


# ── S6: PII exfiltration trend over time ───────────────────────────────────────

@router.get("/pii-trend")
async def pii_trend(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    findings = await _user_findings(db, user)
    agents = {a.id: a for a in await _user_agents(db, user)}

    by_day: dict[str, int] = defaultdict(int)
    by_agent: dict[str, dict] = {}
    for f in findings:
        if f.control != "pii":
            continue
        day = f.detected_at.date().isoformat() if f.detected_at else "unknown"
        by_day[day] += 1
        a = agents.get(f.agent_id)
        name = a.name if a else f.agent_id
        entry = by_agent.setdefault(f.agent_id, {
            "agentId": f.agent_id, "agent": name, "count": 0,
            "dataClassifications": (a.data_classifications if a else []) or [],
            "compliance": [],
        })
        entry["count"] += 1
        if a and a.compliance:
            tags = []
            if a.compliance.get("soc2Scope"):
                tags.append("SOC 2")
            if a.compliance.get("euAiActTier"):
                tags.append(f"EU AI Act: {a.compliance['euAiActTier']}")
            entry["compliance"] = tags

    trend = [{"date": d, "count": c} for d, c in sorted(by_day.items())]
    agents_list = sorted(by_agent.values(), key=lambda x: x["count"], reverse=True)
    return {"trend": trend, "byAgent": agents_list, "total": sum(by_day.values())}


# ── S4: coherency score ingestion from Langfuse ────────────────────────────────

@router.post("/coherency/pull")
async def coherency_pull(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    res = await db.execute(select(LangfuseInstance).where(LangfuseInstance.user_id == user.id))
    instances = res.scalars().all()
    if not instances:
        return {"degraded": True, "reason": "no_langfuse_connected", "scores": []}

    scores: list[dict] = []
    for inst in instances:
        auth = httpx.BasicAuth(inst.public_key, inst.secret_key)
        base = inst.host_url.rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(f"{base}/api/public/scores", auth=auth, params={"limit": 100})
            if resp.status_code != 200:
                continue
            for s in resp.json().get("data", []):
                scores.append({
                    "name": s.get("name"),
                    "value": s.get("value"),
                    "comment": s.get("comment"),
                    "traceId": s.get("traceId"),
                })
        except Exception:
            continue

    return {"degraded": len(scores) == 0, "reason": "" if scores else "no_scores", "scores": scores, "count": len(scores)}


# ── Fleet security overview (KPIs) ─────────────────────────────────────────────

@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    agents = await _user_agents(db, user)
    findings = await _user_findings(db, user)

    sev = Counter(f.severity for f in findings)
    ctrl = Counter(f.control for f in findings)
    protected = sum(1 for a in agents if a.protection_status == "protected")
    return {
        "agents": len(agents),
        "protected": protected,
        "unprotected": len(agents) - protected,
        "findings": len(findings),
        "bySeverity": dict(sev),
        "byControl": dict(ctrl),
        "principalsWithFindings": len({f.principal for f in findings if f.principal}),
    }
