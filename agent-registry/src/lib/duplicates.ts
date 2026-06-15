import type { Agent } from "../types";

function signature(a: Agent): string {
  return (a.capability || a.description || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60);
}

export function duplicateMap(agents: Agent[]): Map<string, string[]> {
  const bySig = new Map<string, Agent[]>();
  for (const a of agents) {
    const sig = signature(a);
    if (!sig) continue;
    bySig.set(sig, [...(bySig.get(sig) ?? []), a]);
  }
  const m = new Map<string, string[]>();
  for (const [, group] of bySig) {
    if (group.length < 2) continue;
    for (const a of group) {
      const others = group.filter((g) => g.id !== a.id).map((g) => g.slug);
      m.set(a.id, [...(m.get(a.id) ?? []), ...others]);
    }
  }
  return m;
}

export function duplicateGroups(agents: Agent[]): Array<{ key: string; agents: Agent[] }> {
  const bySig = new Map<string, Agent[]>();
  for (const a of agents) {
    const sig = signature(a);
    if (!sig) continue;
    bySig.set(sig, [...(bySig.get(sig) ?? []), a]);
  }
  return [...bySig.entries()]
    .filter(([, g]) => g.length > 1)
    .map(([key, agents]) => ({ key, agents }));
}
