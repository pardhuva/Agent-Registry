from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db
from routes import agents, auth, connectors, graph, ingestion, threats


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Agent Registry API",
    description="IBaseIT Agent Registry & LLM Observability — governance control plane",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(connectors.router)
app.include_router(threats.router)
app.include_router(graph.router)
app.include_router(ingestion.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
