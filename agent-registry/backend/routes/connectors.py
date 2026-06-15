from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import (
    ConnectorInstance,
    HeliconeInstance,
    LangfuseInstance,
    LangSmithInstance,
    OtelInstance,
    User,
)
from schemas import (
    ConnectorCreate,
    ConnectorOut,
    HeliconeCreate,
    HeliconeOut,
    LangfuseCreate,
    LangfuseOut,
    LangSmithCreate,
    LangSmithOut,
    OtelCreate,
    OtelOut,
)

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


# ── Langfuse ────────────────────────────────────────────────────────────────

@router.get("/langfuse", response_model=list[LangfuseOut])
async def list_langfuse(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(LangfuseInstance).where(LangfuseInstance.user_id == user.id))
    return [
        LangfuseOut(
            id=i.id, name=i.name, hostUrl=i.host_url,
            publicKey=i.public_key, secretKey=i.secret_key, userId=i.user_id,
        )
        for i in result.scalars().all()
    ]


@router.post("/langfuse", response_model=LangfuseOut, status_code=status.HTTP_201_CREATED)
async def add_langfuse(body: LangfuseCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    inst = LangfuseInstance(
        name=body.name, host_url=body.hostUrl,
        public_key=body.publicKey, secret_key=body.secretKey, user_id=user.id,
    )
    db.add(inst)
    await db.commit()
    await db.refresh(inst)
    return LangfuseOut(
        id=inst.id, name=inst.name, hostUrl=inst.host_url,
        publicKey=inst.public_key, secretKey=inst.secret_key, userId=inst.user_id,
    )


@router.delete("/langfuse/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_langfuse(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(LangfuseInstance).where(LangfuseInstance.id == id, LangfuseInstance.user_id == user.id))
    inst = result.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(inst)
    await db.commit()


# ── LangSmith ───────────────────────────────────────────────────────────────

@router.get("/langsmith", response_model=list[LangSmithOut])
async def list_langsmith(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(LangSmithInstance).where(LangSmithInstance.user_id == user.id))
    return [
        LangSmithOut(
            id=i.id, name=i.name, apiUrl=i.api_url,
            apiKey=i.api_key, project=i.project, userId=i.user_id,
        )
        for i in result.scalars().all()
    ]


@router.post("/langsmith", response_model=LangSmithOut, status_code=status.HTTP_201_CREATED)
async def add_langsmith(body: LangSmithCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    inst = LangSmithInstance(
        name=body.name, api_url=body.apiUrl,
        api_key=body.apiKey, project=body.project, user_id=user.id,
    )
    db.add(inst)
    await db.commit()
    await db.refresh(inst)
    return LangSmithOut(
        id=inst.id, name=inst.name, apiUrl=inst.api_url,
        apiKey=inst.api_key, project=inst.project, userId=inst.user_id,
    )


@router.delete("/langsmith/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_langsmith(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(LangSmithInstance).where(LangSmithInstance.id == id, LangSmithInstance.user_id == user.id))
    inst = result.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(inst)
    await db.commit()


# ── Helicone ────────────────────────────────────────────────────────────────

@router.get("/helicone", response_model=list[HeliconeOut])
async def list_helicone(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(HeliconeInstance).where(HeliconeInstance.user_id == user.id))
    return [
        HeliconeOut(id=i.id, name=i.name, apiKey=i.api_key, userId=i.user_id)
        for i in result.scalars().all()
    ]


@router.post("/helicone", response_model=HeliconeOut, status_code=status.HTTP_201_CREATED)
async def add_helicone(body: HeliconeCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    inst = HeliconeInstance(name=body.name, api_key=body.apiKey, user_id=user.id)
    db.add(inst)
    await db.commit()
    await db.refresh(inst)
    return HeliconeOut(id=inst.id, name=inst.name, apiKey=inst.api_key, userId=inst.user_id)


@router.delete("/helicone/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_helicone(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(HeliconeInstance).where(HeliconeInstance.id == id, HeliconeInstance.user_id == user.id))
    inst = result.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(inst)
    await db.commit()


# ── OTel ────────────────────────────────────────────────────────────────────

@router.get("/otel", response_model=list[OtelOut])
async def list_otel(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(OtelInstance).where(OtelInstance.user_id == user.id))
    return [
        OtelOut(
            id=i.id, name=i.name, endpoint=i.endpoint, backend=i.backend,
            queryUrl=i.query_url, serviceName=i.service_name, headers=i.headers, userId=i.user_id,
        )
        for i in result.scalars().all()
    ]


@router.post("/otel", response_model=OtelOut, status_code=status.HTTP_201_CREATED)
async def add_otel(body: OtelCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    inst = OtelInstance(
        name=body.name, endpoint=body.endpoint, backend=body.backend,
        query_url=body.queryUrl, service_name=body.serviceName, headers=body.headers, user_id=user.id,
    )
    db.add(inst)
    await db.commit()
    await db.refresh(inst)
    return OtelOut(
        id=inst.id, name=inst.name, endpoint=inst.endpoint, backend=inst.backend,
        queryUrl=inst.query_url, serviceName=inst.service_name, headers=inst.headers, userId=inst.user_id,
    )


@router.delete("/otel/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_otel(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(OtelInstance).where(OtelInstance.id == id, OtelInstance.user_id == user.id))
    inst = result.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(inst)
    await db.commit()


# ── Generic connectors (Bedrock, Azure Foundry, Vertex, etc.) ──────────────

@router.get("/platforms", response_model=list[ConnectorOut])
async def list_connectors(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    platform: str | None = None,
):
    stmt = select(ConnectorInstance).where(ConnectorInstance.user_id == user.id)
    if platform:
        stmt = stmt.where(ConnectorInstance.platform == platform)
    result = await db.execute(stmt)
    return [
        ConnectorOut(id=c.id, platform=c.platform, name=c.name, fields=c.fields, userId=c.user_id)
        for c in result.scalars().all()
    ]


@router.post("/platforms", response_model=ConnectorOut, status_code=status.HTTP_201_CREATED)
async def add_connector(body: ConnectorCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    inst = ConnectorInstance(platform=body.platform, name=body.name, fields=body.fields, user_id=user.id)
    db.add(inst)
    await db.commit()
    await db.refresh(inst)
    return ConnectorOut(id=inst.id, platform=inst.platform, name=inst.name, fields=inst.fields, userId=inst.user_id)


@router.delete("/platforms/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_connector(id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(ConnectorInstance).where(ConnectorInstance.id == id, ConnectorInstance.user_id == user.id))
    inst = result.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(inst)
    await db.commit()
