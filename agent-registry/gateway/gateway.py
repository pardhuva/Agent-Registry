"""
IBaseIT LLM Gateway (Style 2 — Base-URL Swap)

A reverse proxy between agents and LLM providers (OpenAI, Anthropic, Groq, etc.).
Enforces per-agent policies (firewall, PII redaction, jailbreak blocking, token budget)
inline before forwarding to the real provider, and emits telemetry.

Usage:
    # Agent code — just change the base_url:
    client = OpenAI(
        base_url="http://localhost:8001/v1",  # was api.openai.com
        api_key="..."
    )

Run:
    python gateway.py
    # or: uvicorn gateway:app --host 0.0.0.0 --port 8001
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ibaseit-gateway")

# ── Configuration ─────────────────────────────────────────────────────────

REGISTRY_URL = os.getenv("IBASEIT_REGISTRY_URL", "http://localhost:8000")
GATEWAY_PORT = int(os.getenv("IBASEIT_GATEWAY_PORT", "8001"))

# Provider base URLs (real upstream targets)
PROVIDERS = {
    "openai": "https://api.openai.com",
    "anthropic": "https://api.anthropic.com",
    "groq": "https://api.groq.com/openai",
}

# Agent-to-policy cache (refreshed periodically)
_policy_cache: dict[str, dict] = {}
_cache_ttl: dict[str, float] = {}
CACHE_TTL_SECONDS = 60

# ── PII / Jailbreak patterns (shared with SDK) ───────────────────────────

PII_PATTERNS = {
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),
    "phone": re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "credit_card": re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b"),
}

JAILBREAK_PATTERNS = [
    re.compile(r"ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions", re.I),
    re.compile(r"you\s+are\s+now\s+(?:DAN|evil|unfiltered|unrestricted)", re.I),
    re.compile(r"disregard\s+(?:all\s+)?(?:your\s+)?(?:rules|guidelines|instructions|safety)", re.I),
    re.compile(r"do\s+anything\s+now", re.I),
    re.compile(r"jailbreak", re.I),
    re.compile(r"bypass\s+(?:your\s+)?(?:safety|content|ethical)\s+(?:filters|guidelines)", re.I),
    re.compile(r"developer\s+mode", re.I),
]


# ── Policy Enforcement ────────────────────────────────────────────────────

def _fetch_agent_policy(agent_id: str, auth_token: str) -> dict:
    """Fetch agent policy from registry, with caching."""
    now = time.time()
    if agent_id in _policy_cache and now - _cache_ttl.get(agent_id, 0) < CACHE_TTL_SECONDS:
        return _policy_cache[agent_id]

    try:
        resp = httpx.get(
            f"{REGISTRY_URL}/api/agents/{agent_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=5,
        )
        if resp.status_code == 200:
            data = resp.json()
            policy = data.get("policy") or {}
            _policy_cache[agent_id] = policy
            _cache_ttl[agent_id] = now
            return policy
    except Exception as e:
        logger.warning(f"Failed to fetch policy for {agent_id}: {e}")

    return _policy_cache.get(agent_id, {})


def _check_jailbreak(text: str) -> str | None:
    """Returns matched pattern or None."""
    for p in JAILBREAK_PATTERNS:
        m = p.search(text)
        if m:
            return m.group()
    return None


def _check_pii(text: str, classes: list[str]) -> list[dict]:
    """Returns list of PII findings."""
    findings = []
    for cls in classes:
        cl = cls.lower()
        for name, pattern in PII_PATTERNS.items():
            if cl in name or cl == "pii":
                matches = pattern.findall(text)
                if matches:
                    findings.append({"type": name, "count": len(matches)})
    return findings


def _redact_pii(text: str, classes: list[str]) -> str:
    """Replace PII in text with redaction markers."""
    for cls in classes:
        cl = cls.lower()
        for name, pattern in PII_PATTERNS.items():
            if cl in name or cl == "pii":
                text = pattern.sub(f"[REDACTED:{name.upper()}]", text)
    return text


def _report_threat(auth_token: str, agent_id: str, control: str, severity: str, summary: str, detail: str | None = None):
    """Report a threat finding to the registry."""
    try:
        httpx.post(
            f"{REGISTRY_URL}/api/threats/",
            headers={"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"},
            json={"control": control, "agentId": agent_id, "severity": severity, "summary": summary, "detail": detail},
            timeout=5,
        )
    except Exception:
        pass


def _enforce_request(body: dict, policy: dict, agent_id: str, auth_token: str) -> dict:
    """Apply policy enforcement to the outgoing request body. Returns modified body."""
    messages = body.get("messages", [])
    if not messages:
        return body

    # Extract user messages for inspection
    user_texts = []
    for msg in messages:
        if msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, str):
                user_texts.append(content)

    full_text = " ".join(user_texts)

    # S3 — Jailbreak detection
    jb_policy = policy.get("jailbreak", {})
    if jb_policy.get("detect", True):
        match = _check_jailbreak(full_text)
        if match:
            action = jb_policy.get("action", "log")
            _report_threat(auth_token, agent_id, "jailbreak", "critical",
                          f"Jailbreak attempt blocked: '{match}'")
            logger.warning(f"[gateway] Jailbreak detected for {agent_id}: {match}")
            if action in ("block", "quarantine"):
                raise HTTPException(
                    status_code=403,
                    detail=f"Request blocked: jailbreak attempt detected"
                )

    # S1 — Firewall
    fw_policy = policy.get("firewall", {})
    if fw_policy.get("enabled"):
        dangerous = [
            re.compile(r"(?:exec|eval|system|subprocess)\s*\(", re.I),
            re.compile(r"<script[^>]*>", re.I),
        ]
        for p in dangerous:
            if p.search(full_text):
                action = fw_policy.get("onViolation", "log")
                _report_threat(auth_token, agent_id, "firewall", "high",
                              "Firewall: dangerous content in request")
                if action in ("block", "quarantine"):
                    raise HTTPException(status_code=403, detail="Request blocked by firewall policy")

    # S4 — PII detection & redaction
    pii_policy = policy.get("pii", {})
    pii_classes = pii_policy.get("classes", [])
    if pii_classes:
        findings = _check_pii(full_text, pii_classes)
        if findings:
            action = pii_policy.get("action", "log")
            _report_threat(auth_token, agent_id, "pii", "high",
                          f"PII detected in request: {findings}",
                          json.dumps(findings))
            if action == "redact":
                for msg in messages:
                    if msg.get("role") == "user" and isinstance(msg.get("content"), str):
                        msg["content"] = _redact_pii(msg["content"], pii_classes)
            elif action in ("block", "quarantine"):
                raise HTTPException(status_code=403, detail="Request blocked: PII detected")

    body["messages"] = messages
    return body


def _enforce_response(response_data: dict, policy: dict, agent_id: str, auth_token: str) -> dict:
    """Apply policy enforcement to the LLM response."""
    choices = response_data.get("choices", [])

    for choice in choices:
        msg = choice.get("message", {})
        content = msg.get("content", "")
        if not content:
            continue

        # PII redaction on response
        pii_policy = policy.get("pii", {})
        pii_classes = pii_policy.get("classes", [])
        if pii_classes and pii_policy.get("action") == "redact":
            msg["content"] = _redact_pii(content, pii_classes)

    # S5 — Token budget tracking
    usage = response_data.get("usage", {})
    total_tokens = usage.get("total_tokens", 0)
    budget = policy.get("tokenBudget", {})
    limit = budget.get("limit") or budget.get("dailyLimit")
    if limit and total_tokens > 0:
        logger.info(f"[gateway] Agent {agent_id} used {total_tokens} tokens (limit: {limit})")

    return response_data


# ── FastAPI App ───────────────────────────────────────────────────────────

app = FastAPI(
    title="IBaseIT LLM Gateway",
    description="Style 2 capture adapter — policy-enforcing reverse proxy for LLM APIs",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "gateway": True, "registry": REGISTRY_URL}


@app.api_route("/v1/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(path: str, request: Request):
    """
    Main proxy endpoint. Intercepts all /v1/* requests (OpenAI-compatible),
    enforces policies, forwards to the real provider, and returns the response.

    Agent ID is passed via the X-Agent-Id header.
    Provider selection via X-Provider header (default: openai).
    """
    # Determine provider
    provider = request.headers.get("x-provider", "openai").lower()
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}. Supported: {list(PROVIDERS.keys())}")

    upstream_base = PROVIDERS[provider]
    upstream_url = f"{upstream_base}/v1/{path}"

    # Get agent ID for policy lookup
    agent_id = request.headers.get("x-agent-id")
    auth_token = request.headers.get("x-registry-token", "")

    # Read request body
    body_bytes = await request.body()
    body = {}
    if body_bytes:
        try:
            body = json.loads(body_bytes)
        except json.JSONDecodeError:
            pass

    # Apply policy enforcement if agent is registered
    policy = {}
    if agent_id and auth_token:
        policy = _fetch_agent_policy(agent_id, auth_token)
        if policy:
            body = _enforce_request(body, policy, agent_id, auth_token)

    # Build upstream headers (forward auth, strip our custom headers)
    forward_headers = {}
    for key, value in request.headers.items():
        lower = key.lower()
        if lower in ("host", "x-agent-id", "x-provider", "x-registry-token", "content-length"):
            continue
        forward_headers[key] = value

    # Forward to upstream provider
    async with httpx.AsyncClient(timeout=120) as client:
        upstream_resp = await client.request(
            method=request.method,
            url=upstream_url,
            headers=forward_headers,
            content=json.dumps(body).encode() if body else body_bytes,
        )

    # Apply response enforcement
    response_data = None
    if upstream_resp.status_code == 200 and policy and agent_id:
        try:
            response_data = upstream_resp.json()
            response_data = _enforce_response(response_data, policy, agent_id, auth_token)
        except Exception:
            response_data = None

    # Return response
    content = json.dumps(response_data).encode() if response_data else upstream_resp.content

    # Build response headers
    resp_headers = {}
    for key, value in upstream_resp.headers.items():
        lower = key.lower()
        if lower not in ("content-encoding", "transfer-encoding", "content-length"):
            resp_headers[key] = value

    resp_headers["x-ibaseit-gateway"] = "true"
    if agent_id:
        resp_headers["x-ibaseit-agent"] = agent_id
    if policy:
        resp_headers["x-ibaseit-policy-enforced"] = "true"

    return Response(
        content=content,
        status_code=upstream_resp.status_code,
        headers=resp_headers,
    )


# ── Run ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting IBaseIT Gateway on port {GATEWAY_PORT}")
    logger.info(f"Registry: {REGISTRY_URL}")
    logger.info(f"Providers: {list(PROVIDERS.keys())}")
    uvicorn.run(app, host="0.0.0.0", port=GATEWAY_PORT)
