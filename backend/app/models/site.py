from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=45, nullable=False)
    capture_screenshot: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    extractor_type: Mapped[str] = mapped_column(String(50), default="generic_text", nullable=False)
    extractor_rules: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    ai_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    snapshots = relationship("CrawlSnapshot", back_populates="site", cascade="all, delete-orphan")
    task_logs = relationship("TaskLog", back_populates="site", cascade="all, delete-orphan")
    execution_records = relationship("ExecutionRecord", back_populates="site", cascade="all, delete-orphan")
