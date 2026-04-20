import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / ".env")


@dataclass
class Settings:
    app_version: str = os.getenv("APP_VERSION", "0.1.0")
    backend_host: str = os.getenv("BACKEND_HOST", "127.0.0.1")
    backend_port: int = int(os.getenv("BACKEND_PORT", "8000"))
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
    data_root: Path = Path(os.getenv("DATA_ROOT", "./data")).resolve()
    frontend_dist_dir: Path = Path(os.getenv("FRONTEND_DIST_DIR", str(ROOT_DIR / "frontend" / "dist"))).resolve()
    cors_origins: list[str] = field(
        default_factory=lambda: [
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
            if origin.strip()
        ]
    )
    playwright_browser: str = os.getenv("PLAYWRIGHT_BROWSER", "chromium")
    playwright_navigation_timeout_ms: int = int(os.getenv("PLAYWRIGHT_NAVIGATION_TIMEOUT_MS", "45000"))
    playwright_manual_session_ttl_minutes: int = int(os.getenv("PLAYWRIGHT_MANUAL_SESSION_TTL_MINUTES", "15"))
    playwright_user_agent: str | None = os.getenv("PLAYWRIGHT_USER_AGENT") or None
    feishu_app_id: str | None = os.getenv("FEISHU_APP_ID") or None
    feishu_app_secret: str | None = os.getenv("FEISHU_APP_SECRET") or None
    feishu_base_url: str = os.getenv("FEISHU_BASE_URL", "https://open.feishu.cn/open-apis")
    ai_base_url: str = os.getenv("AI_BASE_URL", "https://api.deepseek.com")
    ai_model: str = os.getenv("AI_MODEL", "deepseek-chat")
    ai_api_key: str | None = os.getenv("AI_API_KEY") or None
    ai_prompt_template: str | None = os.getenv("AI_PROMPT_TEMPLATE") or None


settings = Settings()
