from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base


class CanonicalProduct(Base):
    __tablename__ = "canonical_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_key: Mapped[str] = mapped_column(String(512), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="other", nullable=False, index=True)
    sub_type: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    warranty: Mapped[str] = mapped_column(String(10), default="否", nullable=False)
    latest_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    latest_price_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    latest_stock: Mapped[str | None] = mapped_column(String(255), nullable=True)
    latest_screenshot_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_site_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    source_site_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    price_history = relationship("PriceHistory", back_populates="product", cascade="all, delete-orphan", order_by="desc(PriceHistory.captured_at)")
