from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


# ── Auth ────────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: str
    password: str
    name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: str
    email: str
    name: str

    model_config = {"from_attributes": True}


# ── Policy sub-schemas (matching TypeScript PolicySchema) ───────────────────

ViolationAction = Literal["log", "flag", "redact", "block", "quarantine", "alert", "throttle", "cutoff"]
GuardrailProvider = Literal["llm-guard", "lakera", "nemo", "azure-content-safety"]
DataClass = Literal["PII", "PHI", "financial", "public"]
FailMode = Literal["fail_open", "fail_closed"]


class FirewallPolicy(BaseModel):
    enabled: bool = False
    provider: GuardrailProvider | None = None
    onViolation: ViolationAction = "log"


class JailbreakPolicy(BaseModel):
    detect: bool = True
    action: ViolationAction = "log"


class PIIPolicy(BaseModel):
    classes: list[DataClass] = []
    action: ViolationAction = "log"


class TokenBudgetPolicy(BaseModel):
    limit: int | None = None
    window: Literal["hour", "day", "month"] = "day"
    onExceed: ViolationAction = "alert"


class ModelTheftPolicy(BaseModel):
    detection: bool = True
    threshold: Literal["low", "medium", "high"] = "medium"


class CoherencyPolicy(BaseModel):
    minScore: float | None = None
    gatePromotion: bool = False


class PolicySchema(BaseModel):
    firewall: FirewallPolicy = Field(default_factory=FirewallPolicy)
    jailbreak: JailbreakPolicy = Field(default_factory=JailbreakPolicy)
    pii: PIIPolicy = Field(default_factory=PIIPolicy)
    tokenBudget: TokenBudgetPolicy = Field(default_factory=TokenBudgetPolicy)
    modelTheft: ModelTheftPolicy = Field(default_factory=ModelTheftPolicy)
    coherency: CoherencyPolicy = Field(default_factory=CoherencyPolicy)
    failMode: FailMode = "fail_open"


# ── Agent dependencies ──────────────────────────────────────────────────────

class AgentDependencies(BaseModel):
    models: list[str] = []
    tools: list[str] = []
    dataSources: list[str] = []
    agents: list[str] = []


class CapabilitySpec(BaseModel):
    inputs: list[str] = []
    outputs: list[str] = []
    examples: list[str] = []


class ComplianceMetadata(BaseModel):
    dataClassification: Literal["public", "internal", "confidential", "restricted"] | None = None
    euAiActTier: Literal["minimal", "limited", "high", "unacceptable"] | None = None
    soc2Scope: bool | None = None
    notes: str | None = None


# ── Agent CRUD ──────────────────────────────────────────────────────────────

LifecycleStage = Literal["dev", "staging", "prod", "deprecated"]
ProtectionStatus = Literal["unprotected", "awaiting_event", "protected"]
CaptureStyle = Literal["sdk", "gateway", "proxy"]
AgentRiskTier = Literal["low", "medium", "high"]
Platform = Literal[
    "langfuse", "langsmith", "helicone", "otel",
    "bedrock", "azure-foundry", "vertex", "azure-monitor",
    "phoenix", "datadog", "traceloop",
]


class AgentCreate(BaseModel):
    name: str
    slug: str
    description: str = ""
    systemPrompt: str = ""
    tags: list[str] = []
    platforms: list[Platform] = []
    owner: str | None = None
    team: str | None = None
    oncall: str | None = None
    capability: str | None = None
    version: str | None = None
    lifecycle: LifecycleStage = "dev"
    dependencies: AgentDependencies | None = None
    accessScope: list[str] | None = None
    guardrails: str | None = None
    compliance: ComplianceMetadata | None = None
    capabilitySpec: CapabilitySpec | None = None
    riskTier: AgentRiskTier | None = None
    dataClassifications: list[DataClass] | None = None
    sourcePlatform: Platform | None = None
    protectionStatus: ProtectionStatus = "unprotected"
    captureStyle: CaptureStyle | None = None
    policy: PolicySchema | None = None


class AgentUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    systemPrompt: str | None = None
    tags: list[str] | None = None
    platforms: list[Platform] | None = None
    owner: str | None = None
    team: str | None = None
    oncall: str | None = None
    capability: str | None = None
    version: str | None = None
    lifecycle: LifecycleStage | None = None
    dependencies: AgentDependencies | None = None
    accessScope: list[str] | None = None
    guardrails: str | None = None
    compliance: ComplianceMetadata | None = None
    approvedBy: str | None = None
    capabilitySpec: CapabilitySpec | None = None
    riskTier: AgentRiskTier | None = None
    dataClassifications: list[DataClass] | None = None
    sourcePlatform: Platform | None = None
    protectionStatus: ProtectionStatus | None = None
    captureStyle: CaptureStyle | None = None
    policy: PolicySchema | None = None


class AuditEventOut(BaseModel):
    id: str
    at: str
    actor: str
    action: str
    from_state: str | None = Field(None, alias="from")
    to_state: str | None = Field(None, alias="to")
    summary: str | None = None
    snapshotId: str | None = None

    model_config = {"from_attributes": True, "populate_by_name": True}


class AgentSnapshotOut(BaseModel):
    id: str
    at: str
    data: dict

    model_config = {"from_attributes": True}


class ThreatFindingOut(BaseModel):
    id: str
    control: str
    agentId: str
    severity: str
    summary: str
    detail: str | None = None
    detectedAt: str
    principal: str | None = None

    model_config = {"from_attributes": True}


class AgentOut(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    systemPrompt: str
    tags: list[str]
    platforms: list[str]
    createdAt: str
    userId: str
    owner: str | None = None
    team: str | None = None
    oncall: str | None = None
    capability: str | None = None
    version: str | None = None
    lifecycle: str | None = None
    dependencies: AgentDependencies | None = None
    accessScope: list[str] | None = None
    guardrails: str | None = None
    compliance: ComplianceMetadata | None = None
    approvedBy: str | None = None
    approvedAt: str | None = None
    capabilitySpec: CapabilitySpec | None = None
    riskTier: str | None = None
    dataClassifications: list[str] | None = None
    sourcePlatform: str | None = None
    protectionStatus: str | None = None
    captureStyle: str | None = None
    firstInstrumentedAt: str | None = None
    policy: PolicySchema | None = None
    auditLog: list[AuditEventOut] = []
    snapshots: list[AgentSnapshotOut] = []
    threats: list[ThreatFindingOut] = []

    model_config = {"from_attributes": True}


# ── Connectors ──────────────────────────────────────────────────────────────

class LangfuseCreate(BaseModel):
    name: str
    hostUrl: str
    publicKey: str
    secretKey: str


class LangfuseOut(BaseModel):
    id: str
    name: str
    hostUrl: str
    publicKey: str
    secretKey: str
    userId: str

    model_config = {"from_attributes": True}


class LangSmithCreate(BaseModel):
    name: str
    apiUrl: str
    apiKey: str
    project: str


class LangSmithOut(BaseModel):
    id: str
    name: str
    apiUrl: str
    apiKey: str
    project: str
    userId: str

    model_config = {"from_attributes": True}


class HeliconeCreate(BaseModel):
    name: str
    apiKey: str


class HeliconeOut(BaseModel):
    id: str
    name: str
    apiKey: str
    userId: str

    model_config = {"from_attributes": True}


class OtelCreate(BaseModel):
    name: str
    endpoint: str
    backend: Literal["jaeger", "tempo", "otlp-http"]
    queryUrl: str = ""
    serviceName: str = ""
    headers: str = ""


class OtelOut(BaseModel):
    id: str
    name: str
    endpoint: str
    backend: str
    queryUrl: str
    serviceName: str
    headers: str
    userId: str

    model_config = {"from_attributes": True}


class ConnectorCreate(BaseModel):
    platform: str
    name: str
    fields: dict[str, str] = {}


class ConnectorOut(BaseModel):
    id: str
    platform: str
    name: str
    fields: dict[str, str]
    userId: str

    model_config = {"from_attributes": True}


# ── Threat ──────────────────────────────────────────────────────────────────

class ThreatCreate(BaseModel):
    control: Literal["firewall", "model_theft", "jailbreak", "coherency", "token_overuse", "pii"]
    agentId: str
    severity: Literal["low", "medium", "high", "critical"]
    summary: str
    detail: str | None = None
    principal: str | None = None


# ── Graph ───────────────────────────────────────────────────────────────────

class GraphNode(BaseModel):
    id: str
    type: Literal["agent", "model", "tool", "data"]
    label: str


class GraphEdge(BaseModel):
    source: str
    target: str


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    blastRadius: dict[str, list[str]] = {}
