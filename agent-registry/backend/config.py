import logging
from pathlib import Path

from pydantic_settings import BaseSettings

_DB_DIR = Path(__file__).resolve().parent
_DEFAULT_DB = f"sqlite+aiosqlite:///{_DB_DIR / 'agent_registry.db'}"
_INSECURE_KEY = "change-me-in-production-use-openssl-rand-hex-32"

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    DATABASE_URL: str = _DEFAULT_DB
    SECRET_KEY: str = _INSECURE_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = {"env_file": ".env", "env_prefix": "AR_", "extra": "ignore"}


settings = Settings()

if settings.SECRET_KEY == _INSECURE_KEY:
    logger.warning(
        "AR_SECRET_KEY is using the insecure default — set it via environment variable before deploying"
    )
