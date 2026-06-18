import os
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db
from routes import agents, analytics, auth, capture, connectors, graph, ingestion, threats

_gateway_process = None


def _start_gateway():
    global _gateway_process
    gateway_script = Path(__file__).resolve().parent.parent / "gateway" / "gateway.py"
    if not gateway_script.exists():
        return
    try:
        import httpx
        resp = httpx.get("http://localhost:8001/health", timeout=2)
        if resp.status_code == 200:
            return
    except Exception:
        pass
    _gateway_process = subprocess.Popen(
        [sys.executable, str(gateway_script)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _stop_gateway():
    global _gateway_process
    if _gateway_process:
        _gateway_process.terminate()
        _gateway_process = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    _start_gateway()
    yield
    _stop_gateway()


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
app.include_router(capture.router)
app.include_router(analytics.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
