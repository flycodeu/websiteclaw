from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from ..core.config import settings
from .base import Base


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def _ensure_sqlite_columns() -> None:
    if not settings.database_url.startswith("sqlite"):
        return

    table_columns = {
        "sites": {
            "platform": "ALTER TABLE sites ADD COLUMN platform VARCHAR(100) NOT NULL DEFAULT ''",
            "ai_enabled": "ALTER TABLE sites ADD COLUMN ai_enabled BOOLEAN NOT NULL DEFAULT 0",
        },
        "crawl_snapshots": {
            "screenshot_upload_status": "ALTER TABLE crawl_snapshots ADD COLUMN screenshot_upload_status VARCHAR(50) NOT NULL DEFAULT 'not_uploaded'",
            "screenshot_file_token": "ALTER TABLE crawl_snapshots ADD COLUMN screenshot_file_token VARCHAR(128)",
            "ai_status": "ALTER TABLE crawl_snapshots ADD COLUMN ai_status VARCHAR(50) NOT NULL DEFAULT 'not_requested'",
            "ai_summary": "ALTER TABLE crawl_snapshots ADD COLUMN ai_summary TEXT",
            "ai_error_message": "ALTER TABLE crawl_snapshots ADD COLUMN ai_error_message TEXT",
        },
        "execution_records": {
            "feishu_sync_status": "ALTER TABLE execution_records ADD COLUMN feishu_sync_status VARCHAR(50) NOT NULL DEFAULT 'not_enabled'",
            "feishu_main_record_id": "ALTER TABLE execution_records ADD COLUMN feishu_main_record_id VARCHAR(128)",
            "feishu_product_sync_count": "ALTER TABLE execution_records ADD COLUMN feishu_product_sync_count INTEGER NOT NULL DEFAULT 0",
            "feishu_sync_error": "ALTER TABLE execution_records ADD COLUMN feishu_sync_error TEXT",
        },
    }

    with engine.begin() as connection:
        for table_name, statements in table_columns.items():
            existing_columns = {
                row[1]
                for row in connection.execute(text(f"PRAGMA table_info({table_name})"))
            }
            for column_name, statement in statements.items():
                if column_name not in existing_columns:
                    connection.execute(text(statement))


def init_db() -> None:
    from ..models import ai_provider, execution_product, execution_record, manual_session, site, snapshot, system_settings, task_log  # noqa: F401

    settings.data_root.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()
