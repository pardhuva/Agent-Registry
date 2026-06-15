from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Agent, User
from schemas import GraphEdge, GraphNode, GraphResponse

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("/", response_model=GraphResponse)
async def get_dependency_graph(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    team: str | None = Query(None),
    lifecycle: str | None = Query(None),
):
    stmt = select(Agent).where(Agent.user_id == user.id)
    if team:
        stmt = stmt.where(Agent.team == team)
    if lifecycle:
        stmt = stmt.where(Agent.lifecycle == lifecycle)

    result = await db.execute(stmt)
    agents = result.scalars().all()

    nodes: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []
    reverse_edges: dict[str, set[str]] = defaultdict(set)

    for agent in agents:
        nodes[agent.id] = GraphNode(id=agent.id, type="agent", label=agent.name)

        deps = agent.dependencies or {}

        for model_name in deps.get("models", []):
            mid = f"model:{model_name}"
            nodes.setdefault(mid, GraphNode(id=mid, type="model", label=model_name))
            edges.append(GraphEdge(source=agent.id, target=mid))
            reverse_edges[mid].add(agent.id)

        for tool_name in deps.get("tools", []):
            tid = f"tool:{tool_name}"
            nodes.setdefault(tid, GraphNode(id=tid, type="tool", label=tool_name))
            edges.append(GraphEdge(source=agent.id, target=tid))
            reverse_edges[tid].add(agent.id)

        for ds_name in deps.get("dataSources", []):
            did = f"data:{ds_name}"
            nodes.setdefault(did, GraphNode(id=did, type="data", label=ds_name))
            edges.append(GraphEdge(source=agent.id, target=did))
            reverse_edges[did].add(agent.id)

        for dep_agent in deps.get("agents", []):
            edges.append(GraphEdge(source=agent.id, target=dep_agent))
            reverse_edges[dep_agent].add(agent.id)

    blast_radius: dict[str, list[str]] = {}
    for node_id in nodes:
        impacted: set[str] = set()
        queue = [node_id]
        visited: set[str] = set()
        while queue:
            current = queue.pop()
            if current in visited:
                continue
            visited.add(current)
            impacted.add(current)
            for dependent in reverse_edges.get(current, set()):
                if dependent not in visited:
                    queue.append(dependent)
        if len(impacted) > 1:
            blast_radius[node_id] = sorted(impacted - {node_id})

    return GraphResponse(
        nodes=list(nodes.values()),
        edges=edges,
        blastRadius=blast_radius,
    )
