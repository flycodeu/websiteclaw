from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("canonical_products.id"), nullable=False, index=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stock_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stock_status: Mapped[str] = mapped_column(String(50), default="unknown", nullable=False)
    snapshot_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
