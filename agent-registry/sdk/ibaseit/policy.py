"""
Policy enforcement engine — the six runtime security controls.

Evaluates request/response content against the agent's policy schema
fetched from the Agent Registry backend.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

Action = Literal["log", "flag", "redact", "block", "quarantine", "alert", "throttle", "cutoff"]


@dataclass
class PolicyViolation:
    control: str
    severity: str
    message: str
    action: Action
    details: dict = field(default_factory=dict)


# ── PII Detection Patterns ────────────────────────────────────────────────

PII_PATTERNS = {
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),
    "phone": re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "credit_card": re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b"),
    "ip_address": re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
}

# ── Jailbreak Detection Patterns ──────────────────────────────────────────

JAILBREAK_PATTERNS = [
    re.compile(r"ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions", re.I),
    re.compile(r"you\s+are\s+now\s+(?:DAN|evil|unfiltered|unrestricted)", re.I),
    re.compile(r"pretend\s+(?:you(?:'re| are)\s+)?(?:a|an)\s+(?:evil|unrestricted|unfiltered)", re.I),
    re.compile(r"disregard\s+(?:all\s+)?(?:your\s+)?(?:rules|guidelines|instructions|safety)", re.I),
    re.compile(r"do\s+anything\s+now", re.I),
    re.compile(r"jailbreak", re.I),
    re.compile(r"bypass\s+(?:your\s+)?(?:safety|content|ethical)\s+(?:filters|guidelines|restrictions)", re.I),
    re.compile(r"act\s+as\s+(?:if\s+)?(?:you\s+)?(?:have\s+)?no\s+(?:restrictions|limits|rules)", re.I),
    re.compile(r"developer\s+mode", re.I),
]


class PolicyEnforcer:
    """Evaluates content against an agent's policy configuration."""

    def __init__(self, policy: dict):
        self.policy = policy
        self._token_count = 0

    def check_request(self, prompt: str, model: str | None = None) -> list[PolicyViolation]:
        """Check an outgoing prompt against all enabled policies."""
        violations = []

        # S1 — Firewall (basic content check)
        fw = self.policy.get("firewall", {})
        if fw.get("enabled"):
            v = self._check_firewall(prompt, "request")
            if v:
                violations.append(v)

        # S3 — Jailbreak detection
        jb = self.policy.get("jailbreak", {})
        if jb.get("detect", True):
            v = self._check_jailbreak(prompt)
            if v:
                violations.append(v)

        # S4 — PII in outgoing prompt
        pii = self.policy.get("pii", {})
        if pii.get("classes"):
            vs = self._check_pii(prompt, pii)
            violations.extend(vs)

        return violations

    def check_response(self, response: str) -> list[PolicyViolation]:
        """Check an incoming LLM response against policies."""
        violations = []

        fw = self.policy.get("firewall", {})
        if fw.get("enabled"):
            v = self._check_firewall(response, "response")
            if v:
                violations.append(v)

        pii = self.policy.get("pii", {})
        if pii.get("classes"):
            vs = self._check_pii(response, pii)
            violations.extend(vs)

        return violations

    def track_tokens(self, count: int) -> PolicyViolation | None:
        """Track token usage against budget policy."""
        budget = self.policy.get("tokenBudget", {})
        limit = budget.get("limit") or budget.get("dailyLimit")
        if not limit:
            return None

        self._token_count += count
        if self._token_count > limit:
            return PolicyViolation(
                control="token_overuse",
                severity="high",
                message=f"Token budget exceeded: {self._token_count}/{limit}",
                action=budget.get("onExceed", "alert"),
                details={"used": self._token_count, "limit": limit},
            )
        return None

    def redact_pii(self, text: str) -> str:
        """Redact PII patterns from text."""
        pii = self.policy.get("pii", {})
        classes = pii.get("classes", [])
        for cls_name in classes:
            cls_lower = cls_name.lower()
            for pattern_name, pattern in PII_PATTERNS.items():
                if cls_lower in pattern_name or cls_lower == "pii":
                    text = pattern.sub(f"[REDACTED:{pattern_name.upper()}]", text)
        return text

    def _check_firewall(self, content: str, direction: str) -> PolicyViolation | None:
        fw = self.policy.get("firewall", {})
        dangerous_patterns = [
            re.compile(r"(?:exec|eval|system|subprocess|os\.popen)\s*\(", re.I),
            re.compile(r"<script[^>]*>", re.I),
            re.compile(r"(?:DROP|DELETE|TRUNCATE)\s+(?:TABLE|DATABASE)", re.I),
        ]
        for pattern in dangerous_patterns:
            if pattern.search(content):
                return PolicyViolation(
                    control="firewall",
                    severity="high",
                    message=f"Firewall: potentially dangerous content in {direction}",
                    action=fw.get("onViolation", "log"),
                    details={"direction": direction, "pattern": pattern.pattern},
                )
        return None

    def _check_jailbreak(self, prompt: str) -> PolicyViolation | None:
        jb = self.policy.get("jailbreak", {})
        for pattern in JAILBREAK_PATTERNS:
            match = pattern.search(prompt)
            if match:
                return PolicyViolation(
                    control="jailbreak",
                    severity="critical",
                    message=f"Jailbreak attempt detected: '{match.group()}'",
                    action=jb.get("action", "log"),
                    details={"matched": match.group(), "pattern": pattern.pattern},
                )
        return None

    def _check_pii(self, text: str, pii_config: dict) -> list[PolicyViolation]:
        violations = []
        classes = pii_config.get("classes", [])
        action = pii_config.get("action", "log")

        for cls_name in classes:
            cls_lower = cls_name.lower()
            for pattern_name, pattern in PII_PATTERNS.items():
                if cls_lower in pattern_name or cls_lower == "pii":
                    matches = pattern.findall(text)
                    if matches:
                        violations.append(PolicyViolation(
                            control="pii",
                            severity="high",
                            message=f"PII detected: {len(matches)} {pattern_name} pattern(s)",
                            action=action,
                            details={"type": pattern_name, "count": len(matches)},
                        ))
        return violations
