from pathlib import Path

from pydantic_settings import BaseSettings

_DB_DIR = Path(__file__).resolve().parent
_DEFAULT_DB = f"sqlite+aiosqlite:///{_DB_DIR / 'agent_registry.db'}"


class Settings(BaseSettings):
    DATABASE_URL: str = _DEFAULT_DB
    SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = {"env_file": ".env", "env_prefix": "AR_", "extra": "ignore"}


settings = Settings()
