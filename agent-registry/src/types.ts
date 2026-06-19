export interface User {
  id: string;
  email: string;
  name: string;
}

export type LifecycleStage = "dev" | "staging" | "prod" | "deprecated";
export type RiskTier = "minimal" | "limited" | "high" | "unacceptable";

export interface AgentDependencies {
  models: string[];
  tools: string[];
  dataSources: string[];
  agents: string[];
}

export interface ComplianceMetadata {
  dataClassification?: "public" | "internal" | "confidential" | "restricted";
  euAiActTier?: RiskTier;
  soc2Scope?: boolean;
  notes?: string;
}

// Per the IBaseIT implementation spec
export type DataClass = "PII" | "PHI" | "financial" | "public";
export type AgentRiskTier = "low" | "medium" | "high";
export type ProtectionStatus = "unprotected" | "awaiting_event" | "protected";
export type CaptureStyle = "sdk" | "gateway" | "proxy";
export type FailMode = "fail_open" | "fail_closed";
export type GuardrailProvider = "llm-guard" | "lakera" | "nemo" | "azure-content-safety";
export type ViolationAction = "log" | "flag" | "redact" | "block" | "quarantine" | "alert" | "throttle" | "cutoff";

export interface FirewallPolicy {
  enabled: boolean;
  provider?: GuardrailProvider;
  onViolation: ViolationAction;
}
export interface JailbreakPolicy {
  detect: boolean;
  action: ViolationAction;
}
export interface PIIPolicy {
  classes: DataClass[];
  action: ViolationAction;
}
export interface TokenBudgetPolicy {
  limit?: number;
  window: "hour" | "day" | "month";
  onExceed: ViolationAction;
}
export interface ModelTheftPolicy {
  detection: boolean;
  threshold: "low" | "medium" | "high";
}
export interface CoherencyPolicy {
  minScore?: number;
  gatePromotion: boolean;
}

export interface PolicySchema {
  firewall: FirewallPolicy;
  jailbreak: JailbreakPolicy;
  pii: PIIPolicy;
  tokenBudget: TokenBudgetPolicy;
  modelTheft: ModelTheftPolicy;
  coherency: CoherencyPolicy;
  failMode: FailMode;
}

export function defaultPolicy(): PolicySchema {
  return {
    firewall: { enabled: false, onViolation: "log" },
    jailbreak: { detect: true, action: "log" },
    pii: { classes: [], action: "log" },
    tokenBudget: { window: "day", onExceed: "alert" },
    modelTheft: { detection: true, threshold: "medium" },
    coherency: { gatePromotion: false },
    failMode: "fail_open",
  };
}

export type SecurityControlId = "firewall" | "model_theft" | "jailbreak" | "coherency" | "token_overuse" | "pii";

export interface ThreatFinding {
  id: string;
  control: SecurityControlId;
  agentId: string;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  detail?: string;
  detectedAt: string;
  principal?: string;
}

export interface CapabilitySpec {
  inputs: string[];
  outputs: string[];
  examples: string[];
}

export type AuditAction =
  | "created"
  | "updated"
  | "promoted"
  | "demoted"
  | "restored";

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: AuditAction;
  from?: string;
  to?: string;
  summary?: string;
  snapshotId?: string;
}

export interface AgentSnapshot {
  id: string;
  at: string;
  data: Omit<Agent, "auditLog" | "snapshots">;
}

export interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string;
  systemPrompt: string;
  tags: string[];
  platforms: Platform[];
  createdAt: string;
  userId: string;

  // Registry / control-plane fields (all optional for backward compat)
  owner?: string;
  team?: string;
  oncall?: string;
  capability?: string;
  version?: string;
  lifecycle?: LifecycleStage;
  dependencies?: AgentDependencies;
  accessScope?: string[];
  guardrails?: string;
  compliance?: ComplianceMetadata;
  approvedBy?: string;
  approvedAt?: string;
  capabilitySpec?: CapabilitySpec;
  auditLog?: AuditEvent[];
  snapshots?: AgentSnapshot[];

  // Spec-aligned fields
  riskTier?: AgentRiskTier;
  dataClassifications?: DataClass[];
  sourcePlatform?: Platform;
  protectionStatus?: ProtectionStatus;
  captureStyle?: CaptureStyle;
  firstInstrumentedAt?: string;
  policy?: PolicySchema;
  threats?: ThreatFinding[];
}

export interface LangfuseInstance {
  id: string;
  name: string;
  hostUrl: string;
  publicKey: string;
  secretKey: string;
  userId: string;
}

export interface LangSmithInstance {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  project: string;
  userId: string;
}

export interface HeliconeInstance {
  id: string;
  name: string;
  apiKey: string;
  userId: string;
}

export interface OtelInstance {
  id: string;
  name: string;
  endpoint: string;
  backend: "jaeger" | "tempo" | "otlp-http";
  queryUrl: string;
  serviceName: string;
  headers: string;
  userId: string;
}

export interface Trace {
  id: string;
  name: string;
  timestamp: string;
  duration?: number;
  status: "success" | "error" | "running";
  input?: string;
  output?: string;
  tokens?: number;
  model?: string;
  invokedBy?: string;
  platform: Platform;
  url?: string;
}

export type ConnectorPlatform =
  | "bedrock"
  | "azure-foundry"
  | "vertex"
  | "azure-monitor"
  | "phoenix"
  | "datadog"
  | "traceloop";

export type Platform =
  | "langfuse"
  | "langsmith"
  | "helicone"
  | "otel"
  | ConnectorPlatform;

export interface ConnectorInstance {
  id: string;
  platform: ConnectorPlatform;
  name: string;
  fields: Record<string, string>;
  userId: string;
}
