from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse, Response

from ..core.config import settings
from ..db.session import init_db
from ..schemas.execution_record import (
    ExecutionProductCreate,
    ExecutionProductRead,
    ExecutionProductUpdate,
    ExecutionRecordRead,
    ExecutionRecordShareResponse,
    ExecutionRecordUpdate,
)
from ..schemas.manual_session import ManualSessionActionResponse, ManualSessionRead
from ..schemas.site import SiteCreate, SiteRead, SiteUpdate
from ..schemas.snapshot import SnapshotListItem, SnapshotRead
from ..schemas.system_settings import SystemSettingsRead, SystemSettingsUpdate
from ..schemas.task_log import TaskLogRead
from ..services.crawl_service import CrawlService
from ..services.execution_record_service import ExecutionRecordService
from ..services.export_service import ExportService
from ..services.product_catalog_service import ProductCatalogService
from ..services.site_service import SiteService
from ..services.system_settings_service import SystemSettingsService
from .deps import get_db

router = APIRouter()
STARTED_AT = datetime.now(timezone.utc).isoformat()


@router.get("/system/health")
def healthcheck() -> dict[str, str]:
    init_db()
    return {"status": "ok"}


@router.get("/system/info")
def system_info() -> dict:
    return {
        "version": settings.app_version,
        "started_at": STARTED_AT,
        "features": {
            "record_center": True,
            "system_settings": True,
            "product_catalog": True,
        },
    }


@router.get("/system/settings", response_model=SystemSettingsRead)
def get_system_settings(db: Session = Depends(get_db)) -> SystemSettingsRead:
    return SystemSettingsService(db).get_settings()


@router.put("/system/settings", response_model=SystemSettingsRead)
def update_system_settings(payload: SystemSettingsUpdate, db: Session = Depends(get_db)) -> SystemSettingsRead:
    return SystemSettingsService(db).update_settings(payload)


@router.get("/sites", response_model=list[SiteRead])
def list_sites(db: Session = Depends(get_db)) -> list[SiteRead]:
    return SiteService(db).list_sites()


@router.post("/sites", response_model=SiteRead)
def create_site(payload: SiteCreate, db: Session = Depends(get_db)) -> SiteRead:
    return SiteService(db).create_site(payload)


@router.put("/sites/{site_id}", response_model=SiteRead)
def update_site(site_id: int, payload: SiteUpdate, db: Session = Depends(get_db)) -> SiteRead:
    site = SiteService(db).update_site(site_id, payload)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return site


@router.delete("/sites/{site_id}", status_code=204)
def delete_site(site_id: int, db: Session = Depends(get_db)) -> Response:
    deleted = SiteService(db).delete_site(site_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Site not found")
    return Response(status_code=204)


@router.post("/sites/{site_id}/crawl", response_model=SnapshotRead, status_code=202)
def trigger_crawl(site_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> SnapshotRead:
    service = CrawlService(db)
    snapshot = service.create_pending_snapshot(site_id)
    background_tasks.add_task(service.run_snapshot, snapshot.id)
    return snapshot


@router.get("/sites/{site_id}/snapshots", response_model=list[SnapshotListItem])
def list_site_snapshots(site_id: int, db: Session = Depends(get_db)) -> list[SnapshotListItem]:
    return CrawlService(db).list_snapshots_for_site(site_id)


@router.get("/snapshots/{snapshot_id}", response_model=SnapshotRead)
def get_snapshot(snapshot_id: int, db: Session = Depends(get_db)) -> SnapshotRead:
    snapshot = CrawlService(db).get_snapshot(snapshot_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snapshot


@router.post("/snapshots/{snapshot_id}/manual-session/start", response_model=ManualSessionRead, status_code=202)
def start_manual_session(snapshot_id: int, db: Session = Depends(get_db)) -> ManualSessionRead:
    session = CrawlService(db).start_manual_session(snapshot_id)
    if not session:
        raise HTTPException(status_code=404, detail="Snapshot not available for manual takeover")
    return session


@router.get("/snapshots/{snapshot_id}/manual-session", response_model=ManualSessionRead)
def get_manual_session(snapshot_id: int, db: Session = Depends(get_db)) -> ManualSessionRead:
    session = CrawlService(db).get_manual_session_for_snapshot(snapshot_id)
    if not session:
        raise HTTPException(status_code=404, detail="Manual session not found")
    return session


@router.post("/manual-sessions/{session_id}/resume", response_model=ManualSessionActionResponse, status_code=202)
def resume_manual_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> ManualSessionActionResponse:
    service = CrawlService(db)
    response = service.resume_manual_session(session_id)
    if not response:
        raise HTTPException(status_code=404, detail="Manual session not found")
    background_tasks.add_task(service.finish_manual_session, session_id)
    return response


@router.post("/manual-sessions/{session_id}/cancel", response_model=ManualSessionActionResponse)
def cancel_manual_session(session_id: str, db: Session = Depends(get_db)) -> ManualSessionActionResponse:
    response = CrawlService(db).cancel_manual_session(session_id)
    if not response:
        raise HTTPException(status_code=404, detail="Manual session not found")
    return response


@router.get("/task-logs", response_model=list[TaskLogRead])
def list_task_logs(db: Session = Depends(get_db)) -> list[TaskLogRead]:
    return CrawlService(db).list_task_logs()


@router.get("/records", response_model=list[ExecutionRecordRead])
def list_records(
    platform: str | None = Query(default=None),
    status: str | None = Query(default=None),
    manual_review_status: str | None = Query(default=None),
    accessible: bool | None = Query(default=None),
    query: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[ExecutionRecordRead]:
    return ExecutionRecordService(db).list_records(
        platform=platform,
        status=status,
        manual_review_status=manual_review_status,
        accessible=accessible,
        query=query,
    )


@router.get("/records/export")
def export_records(record_id: int | None = Query(default=None), db: Session = Depends(get_db)) -> Response:
    csv_text = ExecutionRecordService(db).export_records_csv(record_id=record_id)
    filename = f"record-{record_id}.csv" if record_id is not None else "records-export.csv"
    return Response(
        content=csv_text.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/records/{record_id}", response_model=ExecutionRecordRead)
def get_record(record_id: int, db: Session = Depends(get_db)) -> ExecutionRecordRead:
    record = ExecutionRecordService(db).get_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@router.patch("/records/{record_id}", response_model=ExecutionRecordRead)
def update_record(record_id: int, payload: ExecutionRecordUpdate, db: Session = Depends(get_db)) -> ExecutionRecordRead:
    record = ExecutionRecordService(db).update_record(record_id, payload)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@router.delete("/records/{record_id}", status_code=204)
def delete_record(record_id: int, db: Session = Depends(get_db)) -> Response:
    deleted = ExecutionRecordService(db).delete_record(record_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Record not found")
    return Response(status_code=204)


@router.delete("/records", status_code=204)
def clear_records(db: Session = Depends(get_db)) -> Response:
    ExecutionRecordService(db).clear_records()
    return Response(status_code=204)


@router.post("/records/{record_id}/products", response_model=ExecutionProductRead)
def add_record_product(record_id: int, payload: ExecutionProductCreate, db: Session = Depends(get_db)) -> ExecutionProductRead:
    product = ExecutionRecordService(db).add_product(record_id, payload)
    if not product:
        raise HTTPException(status_code=404, detail="Record not found")
    return product


@router.patch("/products/{product_id}", response_model=ExecutionProductRead)
def update_product(product_id: int, payload: ExecutionProductUpdate, db: Session = Depends(get_db)) -> ExecutionProductRead:
    product = ExecutionRecordService(db).update_product(product_id, payload)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.post("/records/{record_id}/share", response_model=ExecutionRecordShareResponse)
def share_record(record_id: int, db: Session = Depends(get_db)) -> ExecutionRecordShareResponse:
    token = ExecutionRecordService(db).ensure_share_token(record_id)
    if not token:
        raise HTTPException(status_code=404, detail="Record not found")
    return ExecutionRecordShareResponse(record_id=record_id, share_token=token)


@router.get("/records/{record_id}/screenshot")
def get_record_screenshot(record_id: int, db: Session = Depends(get_db)) -> FileResponse:
    path = ExecutionRecordService(db).get_screenshot_path(record_id)
    if not path:
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return FileResponse(path)


@router.get("/shared-records/{share_token}", response_model=ExecutionRecordRead)
def get_shared_record(share_token: str, db: Session = Depends(get_db)) -> ExecutionRecordRead:
    record = ExecutionRecordService(db).get_record_by_share_token(share_token)
    if not record:
        raise HTTPException(status_code=404, detail="Shared record not found")
    return record


# ── Public API (for user portal) ──


@router.get("/public/products")
def public_list_products(
    category: str | None = Query(default=None),
    active: bool = Query(default=True),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[dict]:
    service = ProductCatalogService(db)
    products = service.list_products(category=category, active_only=active, search=search)
    result = []
    for p in products:
        history = service.get_price_history(p.id, limit=30)
        result.append({
            "id": p.id,
            "name": p.name,
            "category": p.category,
            "sub_type": p.sub_type,
            "warranty": p.warranty,
            "latest_price": p.latest_price,
            "latest_price_text": p.latest_price_text or "",
            "latest_stock": p.latest_stock or "",
            "source_site_name": p.source_site_name,
            "source_url": p.source_url or "",
            "product_url": p.product_url or "",
            "tags": p.tags or [],
            "is_active": p.is_active,
            "first_seen_at": p.first_seen_at.isoformat() if p.first_seen_at else "",
            "last_seen_at": p.last_seen_at.isoformat() if p.last_seen_at else "",
            "price_history": [
                {
                    "price": h.price,
                    "price_text": h.price_text or "",
                    "stock_text": h.stock_text or "",
                    "stock_status": h.stock_status,
                    "captured_at": h.captured_at.isoformat() if h.captured_at else "",
                }
                for h in history
            ],
        })
    return result


@router.get("/public/stats")
def public_stats(db: Session = Depends(get_db)) -> dict:
    return ProductCatalogService(db).get_summary_stats()


@router.get("/public/categories")
def public_categories(db: Session = Depends(get_db)) -> dict[str, int]:
    return ProductCatalogService(db).get_categories_stats()


@router.post("/export")
def trigger_export(db: Session = Depends(get_db)) -> dict:
    system_settings = SystemSettingsService(db).get_settings()
    path = ExportService(db).export_static(system_settings.export_path)
    return {"status": "ok", "path": str(path)}
