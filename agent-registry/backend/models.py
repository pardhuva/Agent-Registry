import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── User ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    agents: Mapped[list["Agent"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    langfuse_instances: Mapped[list["LangfuseInstance"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    langsmith_instances: Mapped[list["LangSmithInstance"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    helicone_instances: Mapped[list["HeliconeInstance"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    otel_instances: Mapped[list["OtelInstance"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    connector_instances: Mapped[list["ConnectorInstance"]] = relationship(back_populates="user", cascade="all, delete-orphan")


# ── Agent (data schema) ────────────────────────────────────────────────────

class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    system_prompt: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    platforms: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    # Registry / control-plane fields
    owner: Mapped[str | None] = mapped_column(String(255))
    team: Mapped[str | None] = mapped_column(String(255))
    oncall: Mapped[str | None] = mapped_column(String(255))
    capability: Mapped[str | None] = mapped_column(Text)
    version: Mapped[str | None] = mapped_column(String(32))
    lifecycle: Mapped[str] = mapped_column(
        Enum("dev", "staging", "prod", "deprecated", name="lifecycle_stage"),
        default="dev",
    )
    risk_tier: Mapped[str | None] = mapped_column(
        Enum("low", "medium", "high", name="agent_risk_tier"),
    )
    dependencies: Mapped[dict | None] = mapped_column(JSON)
    access_scope: Mapped[list | None] = mapped_column(JSON)
    guardrails: Mapped[str | None] = mapped_column(Text)
    compliance: Mapped[dict | None] = mapped_column(JSON)
    approved_by: Mapped[str | None] = mapped_column(String(255))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    capability_spec: Mapped[dict | None] = mapped_column(JSON)
    data_classifications: Mapped[list | None] = mapped_column(JSON)
    source_platform: Mapped[str | None] = mapped_column(String(50))
    protection_status: Mapped[str] = mapped_column(
        Enum("unprotected", "awaiting_event", "protected", name="protection_status"),
        default="unprotected",
    )
    capture_style: Mapped[str | None] = mapped_column(
        Enum("sdk", "gateway", "proxy", name="capture_style"),
    )
    first_instrumented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Policy schema (stored as JSON for flexibility)
    policy: Mapped[dict | None] = mapped_column(JSON)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="agents")
    audit_log: Mapped[list["AuditEvent"]] = relationship(
        back_populates="agent", cascade="all, delete-orphan", order_by="AuditEvent.at"
    )
    snapshots: Mapped[list["AgentSnapshot"]] = relationship(
        back_populates="agent", cascade="all, delete-orphan", order_by="AgentSnapshot.at"
    )
    threats: Mapped[list["ThreatFinding"]] = relationship(
        back_populates="agent", cascade="all, delete-orphan", order_by="ThreatFinding.detected_at.desc()"
    )


# ── Audit Event ─────────────────────────────────────────────────────────────

class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id"), nullable=False, index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(
        Enum("created", "updated", "promoted", "demoted", "restored", name="audit_action"),
        nullable=False,
    )
    from_state: Mapped[str | None] = mapped_column(String(50))
    to_state: Mapped[str | None] = mapped_column(String(50))
    summary: Mapped[str | None] = mapped_column(Text)
    snapshot_id: Mapped[str | None] = mapped_column(String(36))

    agent: Mapped["Agent"] = relationship(back_populates="audit_log")


# ── Agent Snapshot ──────────────────────────────────────────────────────────

class AgentSnapshot(Base):
    __tablename__ = "agent_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id"), nullable=False, index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)

    agent: Mapped["Agent"] = relationship(back_populates="snapshots")


# ── Threat Finding ──────────────────────────────────────────────────────────

class ThreatFinding(Base):
    __tablename__ = "threat_findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    control: Mapped[str] = mapped_column(
        Enum("firewall", "model_theft", "jailbreak", "coherency", "token_overuse", "pii", name="security_control"),
        nullable=False,
    )
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id"), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(
        Enum("low", "medium", "high", "critical", name="severity_level"),
        nullable=False,
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[str | None] = mapped_column(Text)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    principal: Mapped[str | None] = mapped_column(String(255))

    agent: Mapped["Agent"] = relationship(back_populates="threats")


# ── Observability Connectors ────────────────────────────────────────────────

class LangfuseInstance(Base):
    __tablename__ = "langfuse_instances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    host_url: Mapped[str] = mapped_column(String(512), nullable=False)
    public_key: Mapped[str] = mapped_column(String(512), nullable=False)
    secret_key: Mapped[str] = mapped_column(String(512), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="langfuse_instances")


class LangSmithInstance(Base):
    __tablename__ = "langsmith_instances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    api_url: Mapped[str] = mapped_column(String(512), nullable=False)
    api_key: Mapped[str] = mapped_column(String(512), nullable=False)
    project: Mapped[str] = mapped_column(String(255), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="langsmith_instances")


class HeliconeInstance(Base):
    __tablename__ = "helicone_instances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    api_key: Mapped[str] = mapped_column(String(512), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="helicone_instances")


class OtelInstance(Base):
    __tablename__ = "otel_instances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(512), nullable=False)
    backend: Mapped[str] = mapped_column(
        Enum("jaeger", "tempo", "otlp-http", name="otel_backend"),
        nullable=False,
    )
    query_url: Mapped[str] = mapped_column(String(512), default="")
    service_name: Mapped[str] = mapped_column(String(255), default="")
    headers: Mapped[str] = mapped_column(Text, default="")
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="otel_instances")


# ── Generic Platform Connectors ─────────────────────────────────────────────

class ConnectorInstance(Base):
    __tablename__ = "connector_instances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    platform: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    fields: Mapped[dict] = mapped_column(JSON, default=dict)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="connector_instances")
