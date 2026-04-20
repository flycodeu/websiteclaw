from __future__ import annotations

import csv
import io
import secrets
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import Select, desc, or_, select
from sqlalchemy.orm import Session, selectinload

from ..core.config import settings
from ..models.execution_product import ExecutionProduct
from ..models.execution_record import ExecutionRecord
from ..models.site import Site
from ..models.snapshot import CrawlSnapshot
from ..schemas.execution_record import ExecutionProductCreate, ExecutionProductUpdate, ExecutionRecordUpdate


class ExecutionRecordService:
    def __init__(self, db: Session):
        self.db = db

    def list_records(
        self,
        *,
        platform: str | None = None,
        status: str | None = None,
        manual_review_status: str | None = None,
        accessible: bool | None = None,
        query: str | None = None,
    ) -> list[ExecutionRecord]:
        stmt: Select[tuple[ExecutionRecord]] = select(ExecutionRecord).options(selectinload(ExecutionRecord.products)).order_by(
            desc(ExecutionRecord.captured_at), desc(ExecutionRecord.created_at)
        )
        if platform:
            stmt = stmt.where(ExecutionRecord.platform == platform)
        if status:
            stmt = stmt.where(ExecutionRecord.status == status)
        if manual_review_status:
            stmt = stmt.where(ExecutionRecord.manual_review_status == manual_review_status)
        if query:
            pattern = f"%{query.strip()}%"
            stmt = stmt.where(
                or_(
                    ExecutionRecord.site_name.ilike(pattern),
                    ExecutionRecord.site_url.ilike(pattern),
                    ExecutionRecord.final_url.ilike(pattern),
                    ExecutionRecord.ai_summary.ilike(pattern),
                    ExecutionRecord.products_summary.ilike(pattern),
                )
            )
        records = list(self.db.scalars(stmt).all())
        if accessible is None:
            return records
        return [record for record in records if record.is_accessible is accessible]

    def get_record(self, record_id: int) -> ExecutionRecord | None:
        stmt = (
            select(ExecutionRecord)
            .options(selectinload(ExecutionRecord.products))
            .where(ExecutionRecord.id == record_id)
        )
        return self.db.scalar(stmt)

    def get_record_by_share_token(self, share_token: str) -> ExecutionRecord | None:
        stmt = (
            select(ExecutionRecord)
            .options(selectinload(ExecutionRecord.products))
            .where(ExecutionRecord.share_token == share_token)
        )
        return self.db.scalar(stmt)

    def update_record(self, record_id: int, payload: ExecutionRecordUpdate) -> ExecutionRecord | None:
        record = self.db.get(ExecutionRecord, record_id)
        if not record:
            return None
        for field, value in payload.model_dump(exclude_unset=True, mode="json").items():
            setattr(record, field, value)
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    def add_product(self, record_id: int, payload: ExecutionProductCreate) -> ExecutionProduct | None:
        record = self.db.get(ExecutionRecord, record_id)
        if not record:
            return None
        product = ExecutionProduct(record_id=record_id, **payload.model_dump(mode="json"))
        self.db.add(product)
        self.db.flush()
        products = list(
            self.db.scalars(select(ExecutionProduct).where(ExecutionProduct.record_id == record_id).order_by(ExecutionProduct.sort_order, ExecutionProduct.id)).all()
        )
        record.manual_review_status = "completed_manually"
        record.product_count = len(products)
        record.products_summary = self._build_products_summary(products)
        self.db.add(record)
        self.db.commit()
        self.db.refresh(product)
        return product

    def update_product(self, product_id: int, payload: ExecutionProductUpdate) -> ExecutionProduct | None:
        product = self.db.get(ExecutionProduct, product_id)
        if not product:
            return None
        for field, value in payload.model_dump(exclude_unset=True, mode="json").items():
            setattr(product, field, value)

        record = self.db.get(ExecutionRecord, product.record_id)
        if record:
            record.manual_review_status = "completed_manually"
            products = list(
                self.db.scalars(
                    select(ExecutionProduct).where(ExecutionProduct.record_id == record.id).order_by(ExecutionProduct.sort_order, ExecutionProduct.id)
                ).all()
            )
            record.products_summary = self._build_products_summary(products)
            record.product_count = len(products)
            self.db.add(record)

        self.db.add(product)
        self.db.commit()
        self.db.refresh(product)
        return product

    def delete_record(self, record_id: int) -> bool:
        record = self.db.get(ExecutionRecord, record_id)
        if not record:
            return False
        self.db.delete(record)
        self.db.commit()
        return True

    def clear_records(self) -> int:
        records = list(self.db.scalars(select(ExecutionRecord)).all())
        for record in records:
            self.db.delete(record)
        if records:
            self.db.commit()
        return len(records)

    def ensure_share_token(self, record_id: int) -> str | None:
        record = self.db.get(ExecutionRecord, record_id)
        if not record:
            return None
        if not record.share_token:
            record.share_token = secrets.token_urlsafe(16)
            self.db.add(record)
            self.db.commit()
            self.db.refresh(record)
        return record.share_token

    def export_records_csv(self, *, record_id: int | None = None) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "记录ID",
                "网站名称",
                "网站地址",
                "最终地址",
                "平台",
                "状态",
                "人工校验状态",
                "是否可访问",
                "抓取时间",
                "AI分析",
                "稳定性",
                "评价",
                "商品名称",
                "价格原文",
                "价格标准化",
                "库存原文",
                "库存标准化",
                "是否质保",
                "商品链接",
                "商品备注",
            ]
        )
        stmt = (
            select(ExecutionRecord)
            .options(selectinload(ExecutionRecord.products))
            .order_by(desc(ExecutionRecord.captured_at), desc(ExecutionRecord.created_at))
        )
        if record_id is not None:
            stmt = stmt.where(ExecutionRecord.id == record_id)
        records = list(self.db.scalars(stmt).all())
        for record in records:
            if not record.products:
                writer.writerow(
                    [
                        record.id,
                        record.site_name,
                        record.site_url,
                        record.final_url or "",
                        record.platform,
                        record.status,
                        record.manual_review_status,
                        self._export_accessible_label(record.is_accessible),
                        record.captured_at.isoformat() if record.captured_at else "",
                        record.ai_summary or "",
                        record.stability_summary or "",
                        record.review or "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                    ]
                )
                continue

            for product in sorted(record.products, key=lambda item: (item.sort_order, item.id)):
                writer.writerow(
                    [
                        record.id,
                        record.site_name,
                        record.site_url,
                        record.final_url or "",
                        record.platform,
                        record.status,
                        record.manual_review_status,
                        self._export_accessible_label(record.is_accessible),
                        record.captured_at.isoformat() if record.captured_at else "",
                        record.ai_summary or "",
                        record.stability_summary or "",
                        record.review or "",
                        product.name,
                        product.price_text or "",
                        product.price_normalized or "",
                        product.stock_text or "",
                        product.stock_normalized or "",
                        product.warranty,
                        product.product_url or "",
                        product.notes or "",
                    ]
                )
        return output.getvalue()

    def get_screenshot_path(self, record_id: int) -> Path | None:
        record = self.db.get(ExecutionRecord, record_id)
        if not record or not record.screenshot_path:
            return None
        target = Path(record.screenshot_path).resolve()
        try:
            target.relative_to(settings.data_root)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid screenshot path") from exc
        if not target.is_file():
            return None
        return target

    def archive_snapshot(
        self,
        *,
        snapshot: CrawlSnapshot,
        site: Site,
        products: list[dict],
        ai_analysis: dict | None = None,
    ) -> ExecutionRecord:
        record = self.db.scalar(select(ExecutionRecord).where(ExecutionRecord.snapshot_id == snapshot.id))
        if not record:
            record = ExecutionRecord(snapshot_id=snapshot.id, site_id=site.id)

        record.site_name = site.name
        record.site_url = site.url
        record.final_url = snapshot.final_url
        record.platform = site.platform or ""
        record.status = self._map_record_status(snapshot.status, products)
        record.manual_review_status = self._map_manual_status(snapshot.status, products)
        record.screenshot_path = snapshot.screenshot_path
        record.ai_summary = snapshot.ai_summary
        record.ai_analysis = ai_analysis
        record.stability_level = self._extract_stability_level(ai_analysis)
        record.stability_summary = self._extract_stability_summary(ai_analysis)
        record.products_summary = self._build_products_summary(products)
        record.product_count = len(products)
        record.captured_at = snapshot.crawled_at or snapshot.created_at
        self.db.flush()

        self.db.query(ExecutionProduct).filter(ExecutionProduct.record_id == record.id).delete()
        for index, product in enumerate(products):
            self.db.add(
                ExecutionProduct(
                    record_id=record.id,
                    sort_order=index,
                    product_key=str(product.get("product_key") or "") or None,
                    name=str(product.get("name") or ""),
                    price_text=str(product.get("price") or "") or None,
                    price_normalized=str(product.get("price") or "") or None,
                    stock_text=str(product.get("stock") or "") or None,
                    stock_normalized=str(product.get("stock") or "") or None,
                    warranty=str(product.get("warranty") or "否") or "否",
                    product_url=str(product.get("product_url") or "") or None,
                    tags=self._normalize_tags(product.get("tags")),
                    notes=str(product.get("notes") or "") or None,
                )
            )

        self.db.commit()
        refreshed = self.get_record(record.id)
        if not refreshed:
            raise RuntimeError("Archived record missing after commit")
        return refreshed

    def build_history_context(self, site_id: int, *, limit: int = 5, exclude_snapshot_id: int | None = None) -> list[dict]:
        stmt = (
            select(ExecutionRecord)
            .options(selectinload(ExecutionRecord.products))
            .where(ExecutionRecord.site_id == site_id)
            .order_by(desc(ExecutionRecord.captured_at), desc(ExecutionRecord.created_at))
            .limit(limit + 3)
        )
        records = list(self.db.scalars(stmt).all())
        items: list[dict] = []
        for record in records:
            if exclude_snapshot_id is not None and record.snapshot_id == exclude_snapshot_id:
                continue
            items.append(
                {
                    "captured_at": record.captured_at.isoformat() if record.captured_at else "",
                    "status": record.status,
                    "manual_review_status": record.manual_review_status,
                    "product_count": record.product_count,
                    "products_summary": record.products_summary or "",
                    "review": record.review or "",
                    "ai_summary": record.ai_summary or "",
                    "products": [
                        {
                            "name": product.name,
                            "price": product.price_normalized or product.price_text or "",
                            "stock": product.stock_normalized or product.stock_text or "",
                            "warranty": product.warranty,
                        }
                        for product in sorted(record.products, key=lambda item: (item.sort_order, item.id))[:10]
                    ],
                }
            )
            if len(items) >= limit:
                break
        return items

    def _build_products_summary(self, products: list[ExecutionProduct | dict]) -> str:
        normalized_names: list[str] = []
        for product in products[:3]:
            name = product.name if isinstance(product, ExecutionProduct) else str(product.get("name") or "")
            price = (
                product.price_normalized if isinstance(product, ExecutionProduct) else str(product.get("price") or "")
            )
            name = name.strip()
            price = price.strip() if isinstance(price, str) else ""
            if not name:
                continue
            normalized_names.append(f"{name}{f' {price}' if price else ''}")
        if not normalized_names:
            return "未识别到商品"
        suffix = " 等" if len(products) > 3 else ""
        return "；".join(normalized_names) + suffix

    def _normalize_tags(self, value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        tags: list[str] = []
        for item in value:
            if not isinstance(item, str):
                continue
            cleaned = item.strip()
            if cleaned and cleaned not in tags:
                tags.append(cleaned)
        return tags

    def _map_record_status(self, snapshot_status: str, products: list[dict]) -> str:
        if snapshot_status in {"waiting_manual", "challenge_detected"}:
            return "waiting_manual"
        if snapshot_status == "failed":
            return "failed"
        if not products:
            return "needs_manual_completion"
        return "captured"

    def _map_manual_status(self, snapshot_status: str, products: list[dict]) -> str:
        if snapshot_status in {"waiting_manual", "challenge_detected"}:
            return "needs_manual_verification"
        if not products:
            return "needs_manual_completion"
        return "auto_captured"

    def _extract_stability_level(self, ai_analysis: dict | None) -> str:
        if not isinstance(ai_analysis, dict):
            return "unknown"
        level = ai_analysis.get("stability_level")
        if isinstance(level, str) and level.strip():
            return level.strip()
        return "unknown"

    def _extract_stability_summary(self, ai_analysis: dict | None) -> str | None:
        if not isinstance(ai_analysis, dict):
            return None
        summary = ai_analysis.get("stability_summary")
        if isinstance(summary, str) and summary.strip():
            return summary.strip()
        return None

    def _export_accessible_label(self, value: bool | None) -> str:
        if value is True:
            return "可访问"
        if value is False:
            return "不可访问"
        return "未知"
