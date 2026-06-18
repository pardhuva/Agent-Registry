import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type {
  Agent,
  LangfuseInstance,
  LangSmithInstance,
  HeliconeInstance,
  OtelInstance,
  ConnectorInstance,
  ConnectorPlatform,
} from "../types";
import { useAuth } from "./AuthContext";
import { api } from "../lib/api";

interface DataContextType {
  agents: Agent[];
  langfuseInstances: LangfuseInstance[];
  langsmithInstances: LangSmithInstance[];
  heliconeInstances: HeliconeInstance[];
  otelInstances: OtelInstance[];
  addAgent: (a: Omit<Agent, "id" | "createdAt" | "userId">) => Promise<Agent>;
  updateAgent: (id: string, a: Partial<Agent>, opts?: { actor?: string; summary?: string }) => Promise<void>;
  restoreSnapshot: (agentId: string, snapshotId: string) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  addLangfuse: (i: Omit<LangfuseInstance, "id" | "userId">) => Promise<void>;
  removeLangfuse: (id: string) => Promise<void>;
  addLangSmith: (i: Omit<LangSmithInstance, "id" | "userId">) => Promise<void>;
  removeLangSmith: (id: string) => Promise<void>;
  addHelicone: (i: Omit<HeliconeInstance, "id" | "userId">) => Promise<void>;
  removeHelicone: (id: string) => Promise<void>;
  addOtel: (i: Omit<OtelInstance, "id" | "userId">) => Promise<void>;
  removeOtel: (id: string) => Promise<void>;
  connectorInstances: ConnectorInstance[];
  addConnector: (i: Omit<ConnectorInstance, "id" | "userId">) => Promise<void>;
  removeConnector: (id: string) => Promise<void>;
  connectorsFor: (platform: ConnectorPlatform) => ConnectorInstance[];
  refreshAgents: () => Promise<void>;
  agentsError: string | null;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [langfuseInstances, setLangfuse] = useState<LangfuseInstance[]>([]);
  const [langsmithInstances, setLangSmith] = useState<LangSmithInstance[]>([]);
  const [heliconeInstances, setHelicone] = useState<HeliconeInstance[]>([]);
  const [otelInstances, setOtel] = useState<OtelInstance[]>([]);
  const [connectorInstances, setConnectors] = useState<ConnectorInstance[]>([]);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  const refreshAgents = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.agents.list();
      setAgents(data);
      setAgentsError(null);
    } catch (e) {
      setAgentsError(e instanceof Error ? e.message : "Failed to load agents");
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refreshAgents();
    api.connectors.langfuse.list().then(setLangfuse).catch(() => {});
    api.connectors.langsmith.list().then(setLangSmith).catch(() => {});
    api.connectors.helicone.list().then(setHelicone).catch(() => {});
    api.connectors.otel.list().then(setOtel).catch(() => {});
    api.connectors.platforms.list().then(setConnectors).catch(() => {});
  }, [user, refreshAgents]);

  const addAgent = useCallback(
    async (data: Omit<Agent, "id" | "createdAt" | "userId">) => {
      const agent = await api.agents.create(data);
      setAgents((prev) => [agent, ...prev]);
      return agent;
    },
    []
  );

  const updateAgent = useCallback(
    async (id: string, data: Partial<Agent>, opts?: { actor?: string; summary?: string }) => {
      const updated = await api.agents.update(id, data, opts?.summary);
      setAgents((prev) => prev.map((a) => (a.id === id ? updated : a)));
    },
    []
  );

  const restoreSnapshot = useCallback(
    async (agentId: string, snapshotId: string) => {
      const restored = await api.agents.restore(agentId, snapshotId);
      setAgents((prev) => prev.map((a) => (a.id === agentId ? restored : a)));
    },
    []
  );

  const deleteAgent = useCallback(
    async (id: string) => {
      await api.agents.delete(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
    },
    []
  );

  // ── Langfuse ───────────────────────────────────────────────────────────

  const addLangfuse = useCallback(
    async (data: Omit<LangfuseInstance, "id" | "userId">) => {
      const inst = await api.connectors.langfuse.add(data);
      setLangfuse((prev) => [...prev, inst]);
    },
    []
  );

  const removeLangfuse = useCallback(async (id: string) => {
    await api.connectors.langfuse.remove(id);
    setLangfuse((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // ── LangSmith ──────────────────────────────────────────────────────────

  const addLangSmith = useCallback(
    async (data: Omit<LangSmithInstance, "id" | "userId">) => {
      const inst = await api.connectors.langsmith.add(data);
      setLangSmith((prev) => [...prev, inst]);
    },
    []
  );

  const removeLangSmith = useCallback(async (id: string) => {
    await api.connectors.langsmith.remove(id);
    setLangSmith((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // ── Helicone ───────────────────────────────────────────────────────────

  const addHelicone = useCallback(
    async (data: Omit<HeliconeInstance, "id" | "userId">) => {
      const inst = await api.connectors.helicone.add(data);
      setHelicone((prev) => [...prev, inst]);
    },
    []
  );

  const removeHelicone = useCallback(async (id: string) => {
    await api.connectors.helicone.remove(id);
    setHelicone((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // ── OTel ───────────────────────────────────────────────────────────────

  const addOtel = useCallback(
    async (data: Omit<OtelInstance, "id" | "userId">) => {
      const inst = await api.connectors.otel.add(data);
      setOtel((prev) => [...prev, inst]);
    },
    []
  );

  const removeOtel = useCallback(async (id: string) => {
    await api.connectors.otel.remove(id);
    setOtel((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // ── Generic connectors ─────────────────────────────────────────────────

  const addConnector = useCallback(
    async (data: Omit<ConnectorInstance, "id" | "userId">) => {
      const inst = await api.connectors.platforms.add(data);
      setConnectors((prev) => [...prev, inst]);
    },
    []
  );

  const removeConnector = useCallback(async (id: string) => {
    await api.connectors.platforms.remove(id);
    setConnectors((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const connectorsFor = useCallback(
    (platform: ConnectorPlatform) => connectorInstances.filter((c) => c.platform === platform),
    [connectorInstances]
  );

  return (
    <DataContext.Provider
      value={{
        agents,
        langfuseInstances,
        langsmithInstances,
        heliconeInstances,
        otelInstances,
        addAgent,
        updateAgent,
        restoreSnapshot,
        deleteAgent,
        addLangfuse,
        removeLangfuse,
        addLangSmith,
        removeLangSmith,
        addHelicone,
        removeHelicone,
        addOtel,
        removeOtel,
        connectorInstances,
        addConnector,
        removeConnector,
        connectorsFor,
        refreshAgents,
        agentsError,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}
