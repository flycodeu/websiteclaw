from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base


class ExecutionRecord(Base):
    __tablename__ = "execution_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    snapshot_id: Mapped[int | None] = mapped_column(ForeignKey("crawl_snapshots.id"), nullable=True, index=True)
    site_name: Mapped[str] = mapped_column(String(255), nullable=False)
    site_url: Mapped[str] = mapped_column(Text, nullable=False)
    final_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    platform: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="captured", nullable=False)
    manual_review_status: Mapped[str] = mapped_column(String(50), default="auto_captured", nullable=False)
    review: Mapped[str | None] = mapped_column(Text, nullable=True)
    screenshot_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_analysis: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    stability_level: Mapped[str] = mapped_column(String(50), default="unknown", nullable=False)
    stability_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    products_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    share_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    site = relationship("Site", back_populates="execution_records")
    snapshot = relationship("CrawlSnapshot", back_populates="execution_record")
    products = relationship("ExecutionProduct", back_populates="record", cascade="all, delete-orphan")

    @property
    def is_accessible(self) -> bool | None:
        if self.status == "failed":
            return False
        if self.status in {"waiting_manual", "challenge_detected"}:
            return None
        if self.final_url or self.screenshot_path or self.product_count > 0:
            return True
        return None
