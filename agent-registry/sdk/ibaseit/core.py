"""
Core SDK — register() and monkey-patching for LLM client libraries.

Wraps OpenAI, Anthropic, and other LLM calls transparently so that
every request/response passes through the policy enforcer.
"""
from __future__ import annotations

import functools
import json
import logging
import time
from typing import Any, Callable

import httpx

from .policy import PolicyEnforcer, PolicyViolation

logger = logging.getLogger("ibaseit")

_guard: AgentGuard | None = None


class PolicyBlockedError(Exception):
    """Raised when a policy enforcement blocks the request."""
    def __init__(self, violations: list[PolicyViolation]):
        self.violations = violations
        msgs = [v.message for v in violations]
        super().__init__(f"Request blocked by policy: {'; '.join(msgs)}")


class AgentGuard:
    """Runtime policy enforcement guard for a registered agent."""

    def __init__(self, registry_url: str, api_key: str, agent_id: str):
        self.registry_url = registry_url.rstrip("/")
        self.api_key = api_key
        self.agent_id = agent_id
        self.policy: dict = {}
        self.enforcer: PolicyEnforcer | None = None
        self._session_tokens = 0
        self._call_count = 0

    def fetch_policy(self) -> dict:
        """Pull the agent's policy from the registry."""
        headers = {"Authorization": f"Bearer {self.api_key}"}
        url = f"{self.registry_url}/api/agents/{self.agent_id}"
        try:
            resp = httpx.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                agent_data = resp.json()
                self.policy = agent_data.get("policy") or {}
                self.enforcer = PolicyEnforcer(self.policy)
                logger.info(f"[ibaseit] Policy loaded for agent {self.agent_id}")
                return self.policy
            else:
                logger.warning(f"[ibaseit] Failed to fetch policy: {resp.status_code}")
        except Exception as e:
            logger.warning(f"[ibaseit] Registry unreachable: {e}")

        self.policy = {}
        self.enforcer = PolicyEnforcer({})
        return self.policy

    def report_violation(self, violation: PolicyViolation):
        """Report a policy violation back to the registry as a threat finding."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "control": violation.control,
            "agentId": self.agent_id,
            "severity": violation.severity,
            "summary": violation.message,
            "detail": json.dumps(violation.details) if violation.details else None,
        }
        try:
            httpx.post(
                f"{self.registry_url}/api/threats/",
                headers=headers,
                json=body,
                timeout=5,
            )
        except Exception:
            pass

    def enforce_request(self, prompt: str, model: str | None = None) -> str:
        """Check prompt against policy. Raises PolicyBlockedError if blocked."""
        if not self.enforcer:
            return prompt

        violations = self.enforcer.check_request(prompt, model)
        blocking = [v for v in violations if v.action in ("block", "quarantine")]
        redacting = [v for v in violations if v.action == "redact"]

        for v in violations:
            self.report_violation(v)
            logger.warning(f"[ibaseit] {v.control}: {v.message} (action={v.action})")

        if blocking:
            fail_mode = self.policy.get("failMode", "fail_open")
            if fail_mode == "fail_closed":
                raise PolicyBlockedError(blocking)
            logger.warning("[ibaseit] Violations found but fail_mode=fail_open, continuing")

        if redacting and self.enforcer:
            prompt = self.enforcer.redact_pii(prompt)

        return prompt

    def enforce_response(self, response: str) -> str:
        """Check response against policy."""
        if not self.enforcer:
            return response

        violations = self.enforcer.check_response(response)
        redacting = [v for v in violations if v.action == "redact"]

        for v in violations:
            self.report_violation(v)
            logger.warning(f"[ibaseit] {v.control}: {v.message} (action={v.action})")

        if redacting and self.enforcer:
            response = self.enforcer.redact_pii(response)

        return response

    def track_tokens(self, count: int):
        """Track token usage."""
        self._session_tokens += count
        self._call_count += 1
        if self.enforcer:
            v = self.enforcer.track_tokens(count)
            if v:
                self.report_violation(v)
                logger.warning(f"[ibaseit] {v.message}")
                if v.action in ("cutoff", "block"):
                    raise PolicyBlockedError([v])


def get_guard() -> AgentGuard | None:
    return _guard


# ── Monkey-patching ───────────────────────────────────────────────────────

def _patch_openai():
    """Monkey-patch openai.ChatCompletion.create and openai.Client."""
    try:
        import openai
    except ImportError:
        return

    # Patch the new-style client (openai >= 1.0)
    if hasattr(openai, "OpenAI"):
        _original_create = openai.resources.chat.completions.Completions.create

        @functools.wraps(_original_create)
        def _wrapped_create(self_inner, *args, **kwargs):
            guard = get_guard()
            if guard:
                messages = kwargs.get("messages", args[0] if args else [])
                last_user = ""
                for msg in reversed(messages):
                    if msg.get("role") == "user":
                        last_user = msg.get("content", "")
                        break
                if last_user:
                    checked = guard.enforce_request(last_user, kwargs.get("model"))
                    for msg in reversed(messages):
                        if msg.get("role") == "user":
                            msg["content"] = checked
                            break

            result = _original_create(self_inner, *args, **kwargs)

            if guard and hasattr(result, "choices") and result.choices:
                content = result.choices[0].message.content or ""
                checked_resp = guard.enforce_response(content)
                result.choices[0].message.content = checked_resp

                usage = getattr(result, "usage", None)
                if usage:
                    guard.track_tokens(usage.total_tokens)

            return result

        openai.resources.chat.completions.Completions.create = _wrapped_create
        logger.info("[ibaseit] Patched openai.chat.completions.create")

    # Patch async variant
    if hasattr(openai, "AsyncOpenAI"):
        try:
            _original_acreate = openai.resources.chat.completions.AsyncCompletions.create

            @functools.wraps(_original_acreate)
            async def _wrapped_acreate(self_inner, *args, **kwargs):
                guard = get_guard()
                if guard:
                    messages = kwargs.get("messages", args[0] if args else [])
                    last_user = ""
                    for msg in reversed(messages):
                        if msg.get("role") == "user":
                            last_user = msg.get("content", "")
                            break
                    if last_user:
                        checked = guard.enforce_request(last_user, kwargs.get("model"))
                        for msg in reversed(messages):
                            if msg.get("role") == "user":
                                msg["content"] = checked
                                break

                result = await _original_acreate(self_inner, *args, **kwargs)

                if guard and hasattr(result, "choices") and result.choices:
                    content = result.choices[0].message.content or ""
                    checked_resp = guard.enforce_response(content)
                    result.choices[0].message.content = checked_resp

                    usage = getattr(result, "usage", None)
                    if usage:
                        guard.track_tokens(usage.total_tokens)

                return result

            openai.resources.chat.completions.AsyncCompletions.create = _wrapped_acreate
            logger.info("[ibaseit] Patched openai.async.chat.completions.create")
        except Exception:
            pass


def _patch_anthropic():
    """Monkey-patch anthropic.Client.messages.create."""
    try:
        import anthropic
    except ImportError:
        return

    if hasattr(anthropic, "Anthropic"):
        try:
            _original = anthropic.resources.messages.Messages.create

            @functools.wraps(_original)
            def _wrapped(self_inner, *args, **kwargs):
                guard = get_guard()
                if guard:
                    messages = kwargs.get("messages", [])
                    for msg in reversed(messages):
                        if msg.get("role") == "user":
                            content = msg.get("content", "")
                            if isinstance(content, str):
                                msg["content"] = guard.enforce_request(content, kwargs.get("model"))
                            break

                result = _original(self_inner, *args, **kwargs)

                if guard and hasattr(result, "content") and result.content:
                    for block in result.content:
                        if hasattr(block, "text"):
                            block.text = guard.enforce_response(block.text)

                    usage = getattr(result, "usage", None)
                    if usage:
                        total = (getattr(usage, "input_tokens", 0) or 0) + (getattr(usage, "output_tokens", 0) or 0)
                        guard.track_tokens(total)

                return result

            anthropic.resources.messages.Messages.create = _wrapped
            logger.info("[ibaseit] Patched anthropic.messages.create")
        except Exception:
            pass


# ── Registration ──────────────────────────────────────────────────────────

def register(
    api_key: str,
    agent_id: str,
    registry_url: str = "http://localhost:8000",
    fetch_policy: bool = True,
):
    """
    Register this process with the Agent Registry and enable policy enforcement.

    Usage:
        from ibaseit import register
        register(api_key="ib_live_a1b2", agent_id="refund-agent-v3")

    All subsequent OpenAI/Anthropic calls will be policy-enforced.
    """
    global _guard
    _guard = AgentGuard(registry_url, api_key, agent_id)

    if fetch_policy:
        _guard.fetch_policy()

    _patch_openai()
    _patch_anthropic()

    logger.info(f"[ibaseit] Agent '{agent_id}' registered with policy enforcement")
    return _guard
