import { Cloud, Sparkles, Brain, BarChart3, Flame, Dog, Workflow } from "lucide-react";
import type { ConnectorPlatform } from "../types";

export interface ConnectorField {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "password";
  required?: boolean;
}

export interface ConnectorSpec {
  id: ConnectorPlatform;
  label: string;
  shortLabel: string;
  icon: typeof Cloud;
  color: string;
  chip: string;
  category: "hyperscaler" | "native";
  description: string;
  ingestionNote: string;
  fields: ConnectorField[];
}

export const CONNECTORS: Record<ConnectorPlatform, ConnectorSpec> = {
  bedrock: {
    id: "bedrock",
    label: "Amazon Bedrock AgentCore",
    shortLabel: "Bedrock",
    icon: Cloud,
    color: "text-orange-600 border-orange-600",
    chip: "bg-orange-100 text-orange-700",
    category: "hyperscaler",
    description: "Agents managed in Amazon Bedrock AgentCore. Traces emit to CloudWatch GenAI / X-Ray.",
    ingestionNote: "AgentCore writes spans to CloudWatch GenAI. Configure an OTel collector with the AWS X-Ray receiver to forward into the registry.",
    fields: [
      { key: "region", label: "AWS Region", placeholder: "us-east-1", required: true },
      { key: "accountId", label: "AWS Account ID", placeholder: "123456789012", required: true },
      { key: "logGroup", label: "CloudWatch GenAI Log Group", placeholder: "/aws/bedrock-agentcore/agent-runtime" },
      { key: "roleArn", label: "IAM Role ARN (read-only)", placeholder: "arn:aws:iam::…:role/RegistryReader" },
    ],
  },
  "azure-foundry": {
    id: "azure-foundry",
    label: "Azure AI Foundry",
    shortLabel: "Foundry",
    icon: Sparkles,
    color: "text-sky-600 border-sky-600",
    chip: "bg-sky-100 text-sky-700",
    category: "hyperscaler",
    description: "Agents authored in Azure AI Foundry. Traces emit to Azure Monitor / Application Insights.",
    ingestionNote: "Foundry agents auto-instrument to App Insights. Use the Application Insights Live Metrics API or an OTel exporter to forward into the registry.",
    fields: [
      { key: "subscriptionId", label: "Subscription ID", placeholder: "00000000-0000-0000-0000-000000000000", required: true },
      { key: "resourceGroup", label: "Resource Group", placeholder: "rg-ai-prod", required: true },
      { key: "projectName", label: "Foundry Project", placeholder: "agents-prod", required: true },
      { key: "appInsightsKey", label: "App Insights Instrumentation Key", type: "password" },
    ],
  },
  vertex: {
    id: "vertex",
    label: "Google Vertex AI Agent Engine",
    shortLabel: "Vertex AI",
    icon: Brain,
    color: "text-indigo-600 border-indigo-600",
    chip: "bg-indigo-100 text-indigo-700",
    category: "hyperscaler",
    description: "Agents on Vertex AI Agent Engine. Traces emit to Google Cloud Trace.",
    ingestionNote: "Vertex Agent Engine writes spans to Cloud Trace under the configured service name. Use the Cloud Trace API or OTel GCP exporter to forward.",
    fields: [
      { key: "projectId", label: "GCP Project ID", placeholder: "my-gcp-project", required: true },
      { key: "location", label: "Region", placeholder: "us-central1", required: true },
      { key: "serviceAccount", label: "Service Account Email", placeholder: "registry-reader@…iam.gserviceaccount.com" },
      { key: "keyJson", label: "Service Account Key (JSON)", type: "password" },
    ],
  },
  "azure-monitor": {
    id: "azure-monitor",
    label: "Azure Monitor",
    shortLabel: "Azure Monitor",
    icon: BarChart3,
    color: "text-blue-700 border-blue-700",
    chip: "bg-blue-100 text-blue-800",
    category: "hyperscaler",
    description: "Direct connection to Azure Monitor / Application Insights for any agent in the Azure stack.",
    ingestionNote: "Query Application Insights via the Log Analytics workspace ID + API key. Spans appear under the dependencies and requests tables.",
    fields: [
      { key: "workspaceId", label: "Log Analytics Workspace ID", placeholder: "00000000-0000-0000-0000-000000000000", required: true },
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "appInsightsAppId", label: "App Insights App ID" },
    ],
  },
  phoenix: {
    id: "phoenix",
    label: "Arize Phoenix",
    shortLabel: "Phoenix",
    icon: Flame,
    color: "text-rose-600 border-rose-600",
    chip: "bg-rose-100 text-rose-700",
    category: "native",
    description: "Open-source LLM observability from Arize. OpenInference-instrumented traces.",
    ingestionNote: "Phoenix exposes a GraphQL/REST API at /v1/traces. The registry pulls span data filtered by the `agent.name` resource attribute.",
    fields: [
      { key: "endpoint", label: "Phoenix Endpoint", placeholder: "https://app.phoenix.arize.com", required: true },
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "projectName", label: "Project Name", placeholder: "default" },
    ],
  },
  datadog: {
    id: "datadog",
    label: "Datadog LLM Observability",
    shortLabel: "Datadog",
    icon: Dog,
    color: "text-purple-700 border-purple-700",
    chip: "bg-purple-100 text-purple-800",
    category: "native",
    description: "Datadog's LLM Observability product. Traces, evaluations, and prompt analytics.",
    ingestionNote: "Datadog LLM Obs emits to the Datadog Spans API. The registry queries `/api/v2/llm-obs/spans` filtered by the `ml_app` tag.",
    fields: [
      { key: "site", label: "Datadog Site", placeholder: "datadoghq.com", required: true },
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "appKey", label: "Application Key", type: "password", required: true },
      { key: "mlApp", label: "ml_app tag", placeholder: "my-agent-app" },
    ],
  },
  traceloop: {
    id: "traceloop",
    label: "Traceloop",
    shortLabel: "Traceloop",
    icon: Workflow,
    color: "text-teal-600 border-teal-600",
    chip: "bg-teal-100 text-teal-700",
    category: "native",
    description: "Traceloop / OpenLLMetry — OpenTelemetry-native LLM tracing.",
    ingestionNote: "Traceloop exports OTLP spans with the OpenLLMetry semantic convention. The registry queries via the Traceloop API or an OTel collector.",
    fields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "endpoint", label: "API Endpoint", placeholder: "https://api.traceloop.com" },
      { key: "appName", label: "App Name", placeholder: "agent-app" },
    ],
  },
};

export const CONNECTOR_ORDER: ConnectorPlatform[] = [
  "bedrock", "azure-foundry", "vertex", "azure-monitor",
  "phoenix", "datadog", "traceloop",
];
