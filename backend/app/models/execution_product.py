from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.base import Base


class ExecutionProduct(Base):
    __tablename__ = "execution_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    record_id: Mapped[int] = mapped_column(ForeignKey("execution_records.id"), nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    product_key: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    price_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_normalized: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stock_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    stock_normalized: Mapped[str | None] = mapped_column(String(255), nullable=True)
    warranty: Mapped[str] = mapped_column(String(50), default="否", nullable=False)
    product_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    record = relationship("ExecutionRecord", back_populates="products")
