from __future__ import annotations

import re
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.canonical_product import CanonicalProduct
from ..models.price_history import PriceHistory


CATEGORY_KEYWORDS = {
    "gpt": ["gpt", "chatgpt", "openai"],
    "claude": ["claude", "anthropic"],
    "gemini": ["gemini", "google ai", "pixel gemini"],
    "cursor": ["cursor"],
    "midjourney": ["midjourney", "mj"],
}

STOCK_STATUS_MAP = {
    "库存充足": "in_stock",
    "库存一般": "in_stock",
    "有货": "in_stock",
    "现货": "in_stock",
    "库存少量": "low_stock",
    "多件满减": "in_stock",
    "库存不足": "low_stock",
    "缺货": "out_of_stock",
    "售罄": "out_of_stock",
    "补货中": "out_of_stock",
}


def _parse_price(text: str | None) -> float | None:
    if not text:
        return None
    match = re.search(r"(\d+(?:\.\d{1,2})?)", text)
    if match:
        return float(match.group(1))
    return None


def _detect_category(name: str) -> str:
    lowered = name.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in lowered for kw in keywords):
            return category
    return "other"


def _detect_stock_status(stock_text: str | None) -> str:
    if not stock_text:
        return "unknown"
    for keyword, status in STOCK_STATUS_MAP.items():
        if keyword in stock_text:
            return status
    if re.search(r"剩余\d+", stock_text):
        return "low_stock"
    return "unknown"


class ProductCatalogService:
    def __init__(self, db: Session):
        self.db = db

    def sync_products_from_execution(
        self,
        *,
        site_id: int,
        site_name: str,
        site_url: str,
        snapshot_id: int | None,
        screenshot_path: str | None,
        products: list[dict],
        captured_at: datetime | None = None,
    ) -> list[CanonicalProduct]:
        now = captured_at or datetime.utcnow()
        seen_keys: set[str] = set()
        result: list[CanonicalProduct] = []

        for product_data in products:
            product_key = product_data.get("product_key") or ""
            if not product_key:
                continue

            seen_keys.add(product_key)
            price_text = str(product_data.get("price") or "")
            price = _parse_price(price_text)
            stock_text = str(product_data.get("stock") or "")
            name = str(product_data.get("name") or "")

            canonical = self.db.scalar(
                select(CanonicalProduct).where(CanonicalProduct.product_key == product_key)
            )

            if canonical:
                canonical.name = name or canonical.name
                canonical.latest_price = price
                canonical.latest_price_text = price_text or canonical.latest_price_text
                canonical.latest_stock = stock_text or canonical.latest_stock
                canonical.latest_screenshot_path = screenshot_path or canonical.latest_screenshot_path
                canonical.warranty = product_data.get("warranty") or canonical.warranty
                canonical.product_url = product_data.get("product_url") or canonical.product_url
                canonical.tags = product_data.get("tags") or canonical.tags
                canonical.is_active = True
                canonical.last_seen_at = now
                canonical.source_site_name = site_name
                canonical.source_url = site_url
            else:
                category = _detect_category(name)
                canonical = CanonicalProduct(
                    product_key=product_key,
                    name=name,
                    category=category,
                    sub_type="",
                    warranty=product_data.get("warranty") or "否",
                    latest_price=price,
                    latest_price_text=price_text,
                    latest_stock=stock_text,
                    latest_screenshot_path=screenshot_path,
                    source_site_name=site_name,
                    source_site_id=site_id,
                    source_url=site_url,
                    product_url=product_data.get("product_url"),
                    tags=product_data.get("tags") or [],
                    is_active=True,
                    first_seen_at=now,
                    last_seen_at=now,
                )
                self.db.add(canonical)

            self.db.flush()

            history = PriceHistory(
                product_id=canonical.id,
                price=price,
                price_text=price_text,
                stock_text=stock_text,
                stock_status=_detect_stock_status(stock_text),
                snapshot_id=snapshot_id,
                captured_at=now,
            )
            self.db.add(history)
            result.append(canonical)

        self._mark_missing_products(site_id, seen_keys)
        self.db.commit()
        return result

    def _mark_missing_products(self, site_id: int, seen_keys: set[str]) -> None:
        stmt = select(CanonicalProduct).where(
            CanonicalProduct.source_site_id == site_id,
            CanonicalProduct.is_active == True,
        )
        active_products = list(self.db.scalars(stmt).all())
        for product in active_products:
            if product.product_key not in seen_keys:
                product.is_active = False

    def list_products(
        self,
        *,
        category: str | None = None,
        active_only: bool = True,
        search: str | None = None,
    ) -> list[CanonicalProduct]:
        stmt = select(CanonicalProduct).order_by(
            CanonicalProduct.category,
            CanonicalProduct.latest_price,
        )
        if category:
            stmt = stmt.where(CanonicalProduct.category == category)
        if active_only:
            stmt = stmt.where(CanonicalProduct.is_active == True)
        if search:
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(CanonicalProduct.name.ilike(pattern))
        return list(self.db.scalars(stmt).all())

    def get_product(self, product_id: int) -> CanonicalProduct | None:
        return self.db.get(CanonicalProduct, product_id)

    def get_price_history(self, product_id: int, *, limit: int = 100) -> list[PriceHistory]:
        stmt = (
            select(PriceHistory)
            .where(PriceHistory.product_id == product_id)
            .order_by(PriceHistory.captured_at.desc())
            .limit(limit)
        )
        return list(self.db.scalars(stmt).all())

    def get_categories_stats(self) -> dict[str, int]:
        products = list(self.db.scalars(
            select(CanonicalProduct).where(CanonicalProduct.is_active == True)
        ).all())
        stats: dict[str, int] = {}
        for product in products:
            stats[product.category] = stats.get(product.category, 0) + 1
        return stats

    def get_summary_stats(self) -> dict:
        all_products = list(self.db.scalars(select(CanonicalProduct)).all())
        active = [p for p in all_products if p.is_active]
        prices = [p.latest_price for p in active if p.latest_price is not None]
        return {
            "total": len(all_products),
            "active": len(active),
            "inactive": len(all_products) - len(active),
            "avg_price": round(sum(prices) / len(prices), 2) if prices else 0,
            "min_price": min(prices) if prices else 0,
            "max_price": max(prices) if prices else 0,
            "categories": self.get_categories_stats(),
        }
