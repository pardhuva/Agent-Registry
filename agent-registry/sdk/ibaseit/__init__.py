"""
IBaseIT Agent Registry SDK (Style 1 — Sidecar SDK)

Auto-instruments LLM client libraries to enforce per-agent policies
(firewall, PII redaction, jailbreak detection, token budgets)
while coexisting with existing observability (Langfuse, LangSmith).

Usage:
    from ibaseit import register
    register(api_key="ib_live_a1b2", agent_id="refund-agent-v3")
    # Every OpenAI / Anthropic / LangChain call is now policy-enforced
"""

from .core import register, AgentGuard, get_guard
from .policy import PolicyEnforcer

__version__ = "0.1.0"
__all__ = ["register", "AgentGuard", "get_guard", "PolicyEnforcer"]
