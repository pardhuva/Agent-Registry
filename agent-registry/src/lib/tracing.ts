import type { LangfuseInstance, LangSmithInstance, HeliconeInstance, OtelInstance, Trace, Platform } from "../types";

export interface DiscoveredAgent {
  slug: string;
  platform: Platform;
  source: string;
  lastSeen: string;
  count: number;
}

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  raw.split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k && v) out[k] = v;
    }
  });
  return out;
}

export async function fetchOtelTraces(
  instance: OtelInstance,
  agentSlug: string
): Promise<Trace[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...parseHeaders(instance.headers),
  };
  const base = instance.queryUrl.replace(/\/$/, "");

  if (instance.backend === "jaeger") {
    const url = `${base}/api/traces?service=${encodeURIComponent(instance.serviceName)}&operation=${encodeURIComponent(agentSlug)}&limit=20`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Jaeger API error: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const items = data.data ?? [];
    return items.map((t: Record<string, unknown>) => {
      const spans = (t.spans as Array<Record<string, unknown>>) ?? [];
      const root = spans[0] ?? {};
      const startUs = (root.startTime as number) ?? 0;
      const durUs = (root.duration as number) ?? 0;
      const tags = (root.tags as Array<Record<string, unknown>>) ?? [];
      const errorTag = tags.find((tag) => tag.key === "error");
      return {
        id: t.traceID as string,
        name: (root.operationName as string) ?? agentSlug,
        timestamp: new Date(startUs / 1000).toISOString(),
        duration: Math.round(durUs / 1000),
        status: (errorTag ? "error" : "success") as Trace["status"],
        input: undefined,
        output: undefined,
        tokens: undefined,
        model: undefined,
        platform: "otel",
        url: `${base}/trace/${t.traceID}`,
      };
    });
  }

  if (instance.backend === "tempo") {
    const url = `${base}/api/search?tags=service.name%3D${encodeURIComponent(instance.serviceName)}+name%3D${encodeURIComponent(agentSlug)}&limit=20`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Tempo API error: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const items = data.traces ?? [];
    return items.map((t: Record<string, unknown>) => ({
      id: t.traceID as string,
      name: (t.rootServiceName as string) ?? agentSlug,
      timestamp: new Date((t.startTimeUnixNano as number) / 1_000_000).toISOString(),
      duration: t.durationMs as number | undefined,
      status: "success" as Trace["status"],
      platform: "otel" as const,
      url: `${base}/trace/${t.traceID}`,
    }));
  }

  // generic otlp-http query (custom backend)
  const url = `${base}/v1/traces?service=${encodeURIComponent(instance.serviceName)}&name=${encodeURIComponent(agentSlug)}&limit=20`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`OTLP query error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const items = (data.resourceSpans ?? data.traces ?? []) as Array<Record<string, unknown>>;
  return items.slice(0, 20).map((t, i) => ({
    id: (t.traceId as string) ?? `otel-${i}`,
    name: agentSlug,
    timestamp: new Date().toISOString(),
    status: "success" as Trace["status"],
    platform: "otel" as const,
  }));
}

export async function fetchLangfuseTraces(
  instance: LangfuseInstance,
  agentSlug: string
): Promise<Trace[]> {
  const credentials = btoa(`${instance.publicKey}:${instance.secretKey}`);
  const url = `${instance.hostUrl.replace(/\/$/, "")}/api/public/traces?name=${encodeURIComponent(agentSlug)}&limit=20`;

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!res.ok) {
    throw new Error(`Langfuse API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const items = data.data ?? [];

  return items.map((t: Record<string, unknown>) => ({
    id: t.id as string,
    name: (t.name as string) ?? agentSlug,
    timestamp: t.timestamp as string,
    duration: t.latency != null ? Math.round((t.latency as number) * 1000) : undefined,
    status: (t.level === "ERROR" ? "error" : "success") as Trace["status"],
    input: t.input ? JSON.stringify(t.input) : undefined,
    output: t.output ? JSON.stringify(t.output) : undefined,
    tokens: (t.totalTokens as number) ?? undefined,
    model: t.metadata ? (t.metadata as Record<string, unknown>).model as string : undefined,
    platform: "langfuse",
    url: `${instance.hostUrl.replace(/\/$/, "")}/trace/${t.id}`,
  }));
}

export async function fetchLangSmithTraces(
  instance: LangSmithInstance,
  agentSlug: string
): Promise<Trace[]> {
  const baseUrl = (instance.apiUrl || "https://api.smith.langchain.com").replace(/\/$/, "");
  const headers = { "x-api-key": instance.apiKey, "Content-Type": "application/json" };

  // Step 1: resolve project name → session ID
  const sessRes = await fetch(
    `${baseUrl}/sessions?name=${encodeURIComponent(instance.project)}&limit=1`,
    { headers }
  );
  if (!sessRes.ok) throw new Error(`LangSmith API error: ${sessRes.status} ${sessRes.statusText}`);
  const sessions = await sessRes.json();
  const sessionId = (Array.isArray(sessions) ? sessions[0] : sessions?.sessions?.[0])?.id;
  if (!sessionId) throw new Error(`LangSmith project "${instance.project}" not found`);

  // Step 2: query runs for this agent slug
  const runsRes = await fetch(`${baseUrl}/runs/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      session: [sessionId],
      filter: `eq(name, "${agentSlug}")`,
      is_root: true,
      limit: 20,
    }),
  });
  if (!runsRes.ok) throw new Error(`LangSmith API error: ${runsRes.status} ${runsRes.statusText}`);

  const data = await runsRes.json();
  const items: Record<string, unknown>[] = Array.isArray(data) ? data : data.runs ?? [];

  return items.map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? agentSlug,
    timestamp: (r.start_time as string) ?? new Date().toISOString(),
    duration: r.end_time && r.start_time
      ? new Date(r.end_time as string).getTime() - new Date(r.start_time as string).getTime()
      : undefined,
    status: (r.error ? "error" : "success") as Trace["status"],
    input: r.inputs ? JSON.stringify(r.inputs) : undefined,
    output: r.outputs ? JSON.stringify(r.outputs) : undefined,
    tokens: (r.total_tokens as number) ?? undefined,
    model: (r.extra as Record<string, unknown>)?.model_name as string | undefined,
    platform: "langsmith",
    url: `${baseUrl.replace("api.", "")}/o/default/projects/p/${sessionId}/r/${r.id}`,
  }));
}

export async function fetchHeliconeTraces(
  instance: HeliconeInstance,
  agentSlug: string
): Promise<Trace[]> {
  const url = `https://www.helicone.ai/api/v1/request?limit=20&property_filters=[{"key":"agent","value":"${agentSlug}"}]`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${instance.apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Helicone API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const items = data.data ?? [];

  return items.map((r: Record<string, unknown>) => {
    const req = (r.request as Record<string, unknown>) ?? {};
    const resp = (r.response as Record<string, unknown>) ?? {};
    return {
      id: r.id as string,
      name: agentSlug,
      timestamp: (req.created_at as string) ?? new Date().toISOString(),
      duration: resp.delay_ms as number | undefined,
      status: (resp.status === 200 ? "success" : "error") as Trace["status"],
      input: req.body ? JSON.stringify(req.body) : undefined,
      output: resp.body ? JSON.stringify(resp.body) : undefined,
      tokens: (resp.completion_tokens as number) ?? undefined,
      model: (req.model as string) ?? undefined,
      platform: "helicone",
      url: `https://www.helicone.ai/requests/${r.id}`,
    };
  });
}

// ─── Discovery: surface trace names that have no matching registered agent ───

function aggregate(
  items: Array<{ name?: string; timestamp?: string }>,
  platform: Platform,
  source: string,
): DiscoveredAgent[] {
  const m = new Map<string, DiscoveredAgent>();
  for (const it of items) {
    const slug = (it.name ?? "").trim();
    if (!slug) continue;
    const ts = it.timestamp ?? new Date().toISOString();
    const cur = m.get(slug);
    if (cur) {
      cur.count++;
      if (ts > cur.lastSeen) cur.lastSeen = ts;
    } else {
      m.set(slug, { slug, platform, source, lastSeen: ts, count: 1 });
    }
  }
  return [...m.values()];
}

export async function discoverLangfuseAgents(instance: LangfuseInstance): Promise<DiscoveredAgent[]> {
  const credentials = btoa(`${instance.publicKey}:${instance.secretKey}`);
  const url = `${instance.hostUrl.replace(/\/$/, "")}/api/public/traces?limit=100`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${credentials}` } });
  if (!res.ok) throw new Error(`Langfuse: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const items = ((data.data ?? []) as Array<Record<string, unknown>>).map((t) => ({
    name: t.name as string,
    timestamp: t.timestamp as string,
  }));
  return aggregate(items, "langfuse", instance.name);
}

export async function discoverLangSmithAgents(instance: LangSmithInstance): Promise<DiscoveredAgent[]> {
  const baseUrl = (instance.apiUrl || "https://api.smith.langchain.com").replace(/\/$/, "");
  const headers = { "x-api-key": instance.apiKey, "Content-Type": "application/json" };
  const sessRes = await fetch(`${baseUrl}/sessions?name=${encodeURIComponent(instance.project)}&limit=1`, { headers });
  if (!sessRes.ok) throw new Error(`LangSmith: ${sessRes.status} ${sessRes.statusText}`);
  const sessions = await sessRes.json();
  const sessionId = (Array.isArray(sessions) ? sessions[0] : sessions?.sessions?.[0])?.id;
  if (!sessionId) throw new Error(`LangSmith project "${instance.project}" not found`);

  const runsRes = await fetch(`${baseUrl}/runs/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({ session: [sessionId], is_root: true, limit: 100 }),
  });
  if (!runsRes.ok) throw new Error(`LangSmith: ${runsRes.status} ${runsRes.statusText}`);
  const data = await runsRes.json();
  const items = ((Array.isArray(data) ? data : data.runs ?? []) as Array<Record<string, unknown>>).map((r) => ({
    name: r.name as string,
    timestamp: r.start_time as string,
  }));
  return aggregate(items, "langsmith", instance.name);
}

export async function discoverHeliconeAgents(instance: HeliconeInstance): Promise<DiscoveredAgent[]> {
  const url = `https://www.helicone.ai/api/v1/request?limit=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${instance.apiKey}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Helicone: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const items = ((data.data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const props = (r.properties as Record<string, unknown>) ?? {};
    const req = (r.request as Record<string, unknown>) ?? {};
    return {
      name: (props.agent as string) ?? (props["Helicone-Property-Agent"] as string) ?? "",
      timestamp: (req.created_at as string) ?? new Date().toISOString(),
    };
  });
  return aggregate(items, "helicone", instance.name);
}

export async function discoverOtelAgents(instance: OtelInstance): Promise<DiscoveredAgent[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...parseHeaders(instance.headers),
  };
  const base = instance.queryUrl.replace(/\/$/, "");

  if (instance.backend === "jaeger") {
    const url = `${base}/api/services/${encodeURIComponent(instance.serviceName)}/operations`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Jaeger: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const ops = ((data.data ?? []) as string[]).map((name) => ({ name, timestamp: new Date().toISOString() }));
    return aggregate(ops, "otel", instance.name);
  }
  if (instance.backend === "tempo") {
    const url = `${base}/api/search/tag/name/values`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Tempo: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const items = ((data.tagValues ?? []) as string[]).map((name) => ({ name, timestamp: new Date().toISOString() }));
    return aggregate(items, "otel", instance.name);
  }
  return [];
}
