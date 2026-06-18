const BASE = import.meta.env.VITE_API_URL ?? "";

function token(): string | null {
  return localStorage.getItem("ar_token");
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> ?? {}),
  };
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (res.status === 204) return undefined as unknown as T;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

function get<T>(path: string) {
  return request<T>(path);
}

function post<T>(path: string, body?: unknown) {
  return request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

function patch<T>(path: string, body: unknown) {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

function del(path: string) {
  return request<void>(path, { method: "DELETE" });
}

// ── Auth ──────────────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: { id: string; email: string; name: string };
}

export const api = {
  auth: {
    signup: (email: string, password: string, name: string) =>
      post<AuthResponse>("/api/auth/signup", { email, password, name }),
    login: (email: string, password: string) =>
      post<AuthResponse>("/api/auth/login", { email, password }),
    me: () => get<{ id: string; email: string; name: string }>("/api/auth/me"),
  },

  agents: {
    list: (params?: { lifecycle?: string; team?: string }) => {
      const qs = new URLSearchParams();
      if (params?.lifecycle) qs.set("lifecycle", params.lifecycle);
      if (params?.team) qs.set("team", params.team);
      const q = qs.toString();
      return get<any[]>(`/api/agents/${q ? `?${q}` : ""}`);
    },
    get: (id: string) => get<any>(`/api/agents/${id}`),
    create: (data: any) => post<any>("/api/agents/", data),
    update: (id: string, data: any, summary?: string) => {
      const qs = summary ? `?summary=${encodeURIComponent(summary)}` : "";
      return patch<any>(`/api/agents/${id}${qs}`, data);
    },
    delete: (id: string) => del(`/api/agents/${id}`),
    restore: (agentId: string, snapshotId: string) =>
      post<any>(`/api/agents/${agentId}/restore/${snapshotId}`),
    discover: (params?: { q?: string; team?: string; lifecycle?: string; risk_tier?: string }) => {
      const qs = new URLSearchParams();
      Object.entries(params ?? {}).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
      const q = qs.toString();
      return get<any[]>(`/api/agents/discover${q ? `?${q}` : ""}`);
    },
    duplicates: () => get<any[]>("/api/agents/duplicates"),
    merge: (keepId: string, mergeIds: string[]) => post<any>("/api/agents/merge", { keepId, mergeIds }),
    dedupe: (opts?: { removeTraceJunk?: boolean; dryRun?: boolean }) =>
      post<any>("/api/agents/dedupe", { removeTraceJunk: opts?.removeTraceJunk ?? true, dryRun: opts?.dryRun ?? false }),
  },

  connectors: {
    langfuse: {
      list: () => get<any[]>("/api/connectors/langfuse"),
      add: (data: any) => post<any>("/api/connectors/langfuse", data),
      remove: (id: string) => del(`/api/connectors/langfuse/${id}`),
    },
    langsmith: {
      list: () => get<any[]>("/api/connectors/langsmith"),
      add: (data: any) => post<any>("/api/connectors/langsmith", data),
      remove: (id: string) => del(`/api/connectors/langsmith/${id}`),
    },
    helicone: {
      list: () => get<any[]>("/api/connectors/helicone"),
      add: (data: any) => post<any>("/api/connectors/helicone", data),
      remove: (id: string) => del(`/api/connectors/helicone/${id}`),
    },
    otel: {
      list: () => get<any[]>("/api/connectors/otel"),
      add: (data: any) => post<any>("/api/connectors/otel", data),
      remove: (id: string) => del(`/api/connectors/otel/${id}`),
    },
    platforms: {
      list: (platform?: string) => {
        const qs = platform ? `?platform=${platform}` : "";
        return get<any[]>(`/api/connectors/platforms${qs}`);
      },
      add: (data: any) => post<any>("/api/connectors/platforms", data),
      remove: (id: string) => del(`/api/connectors/platforms/${id}`),
    },
  },

  threats: {
    list: (params?: { agent_id?: string; control?: string; severity?: string }) => {
      const qs = new URLSearchParams();
      if (params?.agent_id) qs.set("agent_id", params.agent_id);
      if (params?.control) qs.set("control", params.control);
      if (params?.severity) qs.set("severity", params.severity);
      const q = qs.toString();
      return get<any[]>(`/api/threats/${q ? `?${q}` : ""}`);
    },
    // Returns { findings, content, llm }
    scan: (content = true) => post<any>(`/api/threats/scan?content=${content}`),
    analyze: (data: { prompt: string; response?: string; agentId?: string; store?: boolean; principal?: string }) =>
      post<any>("/api/threats/analyze", data),
    llmStatus: () => get<any>("/api/threats/llm-status"),
    create: (data: any) => post<any>("/api/threats/", data),
    delete: (id: string) => del(`/api/threats/${id}`),
  },

  capture: {
    gatewayStatus: () => get<any>("/api/capture/gateway/status"),
    testCall: (data: { agentId?: string; agentSlug?: string; prompt?: string; provider?: string }) =>
      post<any>("/api/capture/test-call", data),
    instrument: (data: { agentId?: string; agentSlug?: string; captureStyle?: string }) =>
      post<any>("/api/capture/instrument", data),
  },

  analytics: {
    overview: () => get<any>("/api/analytics/overview"),
    repeatOffenders: () => get<any>("/api/analytics/repeat-offenders"),
    jailbreakSignatures: () => get<any>("/api/analytics/jailbreak-signatures"),
    modelTheft: () => get<any>("/api/analytics/model-theft"),
    piiTrend: () => get<any>("/api/analytics/pii-trend"),
    coherencyPull: () => post<any>("/api/analytics/coherency/pull"),
  },

  graph: {
    get: (params?: { team?: string; lifecycle?: string }) => {
      const qs = new URLSearchParams();
      if (params?.team) qs.set("team", params.team);
      if (params?.lifecycle) qs.set("lifecycle", params.lifecycle);
      const q = qs.toString();
      return get<any>(`/api/graph/${q ? `?${q}` : ""}`);
    },
  },

  ingestion: {
    pullLangfuse: () => post<any>("/api/ingestion/langfuse/pull"),
    pullLangsmith: () => post<any>("/api/ingestion/langsmith/pull"),
    pullAll: () => post<any>("/api/ingestion/pull-all"),
  },

  health: () => get<{ status: string }>("/api/health"),
};
