from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.canonical_product import CanonicalProduct
from ..models.price_history import PriceHistory


class ExportService:
    def __init__(self, db: Session):
        self.db = db

    def export_static(self, output_dir: str | None = None) -> Path:
        target = Path(output_dir) if output_dir else settings.data_root / "export"
        target.mkdir(parents=True, exist_ok=True)

        api_dir = target / "api"
        api_dir.mkdir(parents=True, exist_ok=True)
        img_dir = target / "screenshots"
        img_dir.mkdir(parents=True, exist_ok=True)

        products = list(self.db.scalars(
            select(CanonicalProduct).order_by(CanonicalProduct.category, CanonicalProduct.latest_price)
        ).all())

        products_data = []
        for product in products:
            history = list(self.db.scalars(
                select(PriceHistory)
                .where(PriceHistory.product_id == product.id)
                .order_by(PriceHistory.captured_at.asc())
            ).all())

            screenshot_filename = None
            if product.latest_screenshot_path:
                src = Path(product.latest_screenshot_path)
                if src.is_file():
                    screenshot_filename = f"{product.id}.png"
                    shutil.copy2(src, img_dir / screenshot_filename)

            history_data = [
                {
                    "price": h.price,
                    "price_text": h.price_text or "",
                    "stock_text": h.stock_text or "",
                    "stock_status": h.stock_status,
                    "captured_at": h.captured_at.isoformat() if h.captured_at else "",
                }
                for h in history
            ]

            products_data.append({
                "id": product.id,
                "product_key": product.product_key,
                "name": product.name,
                "category": product.category,
                "sub_type": product.sub_type,
                "warranty": product.warranty,
                "latest_price": product.latest_price,
                "latest_price_text": product.latest_price_text or "",
                "latest_stock": product.latest_stock or "",
                "source_site_name": product.source_site_name,
                "source_url": product.source_url or "",
                "product_url": product.product_url or "",
                "tags": product.tags or [],
                "is_active": product.is_active,
                "screenshot": screenshot_filename,
                "first_seen_at": product.first_seen_at.isoformat() if product.first_seen_at else "",
                "last_seen_at": product.last_seen_at.isoformat() if product.last_seen_at else "",
                "price_history": history_data,
            })

        categories: dict[str, int] = {}
        active_count = 0
        prices: list[float] = []
        for p in products_data:
            cat = p["category"]
            categories[cat] = categories.get(cat, 0) + 1
            if p["is_active"]:
                active_count += 1
                if p["latest_price"] is not None:
                    prices.append(p["latest_price"])

        meta = {
            "exported_at": datetime.utcnow().isoformat(),
            "total_products": len(products_data),
            "active_products": active_count,
            "categories": categories,
            "avg_price": round(sum(prices) / len(prices), 2) if prices else 0,
            "min_price": min(prices) if prices else 0,
            "max_price": max(prices) if prices else 0,
        }

        self._write_json(api_dir / "products.json", products_data)
        self._write_json(api_dir / "meta.json", meta)

        by_category: dict[str, list] = {}
        for p in products_data:
            by_category.setdefault(p["category"], []).append(p)
        for cat, items in by_category.items():
            self._write_json(api_dir / f"products-{cat}.json", items)

        return target

    def _write_json(self, path: Path, data: object) -> None:
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
