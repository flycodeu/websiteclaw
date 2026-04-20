from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base


class CrawlSnapshot(Base):
    __tablename__ = "crawl_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    final_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    visible_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    html_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    screenshot_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ai_status: Mapped[str] = mapped_column(String(50), default="not_requested", nullable=False)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    challenge_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    crawled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    site = relationship("Site", back_populates="snapshots")
    task_logs = relationship("TaskLog", back_populates="snapshot", cascade="all, delete-orphan")
    manual_sessions = relationship("ManualSession", back_populates="snapshot", cascade="all, delete-orphan")
    execution_record = relationship("ExecutionRecord", back_populates="snapshot", uselist=False)
