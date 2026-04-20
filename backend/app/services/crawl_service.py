from __future__ import annotations

from datetime import datetime, timedelta
import uuid

from fastapi import HTTPException
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..db.session import SessionLocal
from ..models.manual_session import ManualSession
from ..models.site import Site
from ..models.snapshot import CrawlSnapshot
from ..models.task_log import TaskLog
from ..schemas.manual_session import ManualSessionActionResponse, ManualSessionRead
from .ai_analysis_service import AIAnalysisService, AIConfigurationError
from .challenge_detection import detect_challenge
from .execution_record_service import ExecutionRecordService
from .export_service import ExportService
from .extractor import extract_fields, merge_product_results
from .product_catalog_service import ProductCatalogService
from .storage import StorageService
from .system_settings_service import SystemSettingsService


class CrawlService:
    _manual_runtime_sessions: dict[str, dict] = {}

    def __init__(self, db: Session):
        self.db = db
        self.storage = StorageService()
        self.ai = AIAnalysisService()

    def list_snapshots_for_site(self, site_id: int) -> list[CrawlSnapshot]:
        stmt = select(CrawlSnapshot).where(CrawlSnapshot.site_id == site_id).order_by(CrawlSnapshot.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def get_snapshot(self, snapshot_id: int) -> CrawlSnapshot | None:
        return self.db.get(CrawlSnapshot, snapshot_id)

    def list_task_logs(self) -> list[TaskLog]:
        stmt = select(TaskLog).order_by(TaskLog.created_at.desc()).limit(200)
        return list(self.db.scalars(stmt).all())

    def create_pending_snapshot(self, site_id: int) -> CrawlSnapshot:
        site = self.db.get(Site, site_id)
        if not site:
            raise HTTPException(status_code=404, detail="Site not found")

        snapshot = CrawlSnapshot(site_id=site.id, source_url=site.url, status="pending")
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)
        self._log(self.db, site.id, snapshot.id, "crawl", "pending", "Manual crawl requested")
        return snapshot

    def run_snapshot(self, snapshot_id: int) -> None:
        db = SessionLocal()
        try:
            snapshot = db.get(CrawlSnapshot, snapshot_id)
            if not snapshot:
                return
            site = db.get(Site, snapshot.site_id)
            if not site:
                snapshot.status = "failed"
                snapshot.error_message = "Site configuration missing"
                db.commit()
                return

            started_at = datetime.utcnow()
            snapshot.status = "running"
            snapshot.error_message = None
            db.commit()
            self._log(db, site.id, snapshot.id, "crawl", "running", "Browser session started")

            try:
                with sync_playwright() as playwright:
                    browser_launcher = getattr(playwright, settings.playwright_browser)
                    browser = browser_launcher.launch(headless=True)
                    context = browser.new_context(**self._context_kwargs())
                    page = context.new_page()
                    page.set_default_timeout(site.timeout_seconds * 1000)
                    page.goto(site.url, wait_until="domcontentloaded")
                    try:
                        page.wait_for_load_state("networkidle", timeout=settings.playwright_navigation_timeout_ms)
                    except PlaywrightTimeoutError:
                        pass

                    self._capture_and_process(db, snapshot, site, page)
                    browser.close()
            except Exception as exc:  # noqa: BLE001
                snapshot.status = "failed"
                snapshot.error_message = str(exc)
                db.add(snapshot)
                db.commit()
                self._log(db, site.id, snapshot.id, "crawl", "failed", str(exc), started_at)
        finally:
            db.close()

    def start_manual_session(self, snapshot_id: int) -> ManualSessionRead | None:
        snapshot = self.db.get(CrawlSnapshot, snapshot_id)
        if not snapshot or snapshot.status not in {"waiting_manual", "challenge_detected"}:
            return None

        site = self.db.get(Site, snapshot.site_id)
        if not site:
            return None

        session_id = uuid.uuid4().hex
        expires_at = datetime.utcnow() + timedelta(minutes=settings.playwright_manual_session_ttl_minutes)

        try:
            playwright = sync_playwright().start()
            browser_launcher = getattr(playwright, settings.playwright_browser)
            browser = browser_launcher.launch(headless=False, slow_mo=100)
            context = browser.new_context(**self._context_kwargs())
            page = context.new_page()
            page.set_default_timeout(site.timeout_seconds * 1000)
            page.goto(site.url, wait_until="domcontentloaded")
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"Unable to open manual session: {exc}") from exc

        manual_session = ManualSession(
            session_id=session_id,
            snapshot_id=snapshot.id,
            site_id=site.id,
            status="active",
            challenge_reason=snapshot.challenge_reason,
            expires_at=expires_at,
        )
        snapshot.status = "waiting_manual"
        self.db.add(manual_session)
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(manual_session)

        self._manual_runtime_sessions[session_id] = {
            "playwright": playwright,
            "browser": browser,
            "context": context,
            "page": page,
            "snapshot_id": snapshot.id,
        }
        self._log(self.db, site.id, snapshot.id, "manual_session", "active", "Manual takeover started")
        return self._to_manual_session_read(manual_session)

    def get_manual_session_for_snapshot(self, snapshot_id: int) -> ManualSessionRead | None:
        manual_session = self.db.scalar(
            select(ManualSession)
            .where(ManualSession.snapshot_id == snapshot_id, ManualSession.status.in_(["active", "resuming"]))
            .order_by(ManualSession.created_at.desc())
        )
        if not manual_session:
            return None
        return self._to_manual_session_read(manual_session)

    def resume_manual_session(self, session_id: str) -> ManualSessionActionResponse | None:
        manual_session = self.db.scalar(select(ManualSession).where(ManualSession.session_id == session_id))
        if not manual_session or session_id not in self._manual_runtime_sessions:
            return None

        manual_session.status = "resuming"
        snapshot = self.db.get(CrawlSnapshot, manual_session.snapshot_id)
        if snapshot:
            snapshot.status = "running"
            self.db.add(snapshot)
        self.db.add(manual_session)
        self.db.commit()
        self._log(self.db, manual_session.site_id, manual_session.snapshot_id, "manual_session", "resuming", "Manual verification completed by operator")
        return ManualSessionActionResponse(
            session_id=session_id,
            snapshot_id=manual_session.snapshot_id,
            status="resuming",
            message="Manual session accepted. The backend is finishing the capture now.",
        )

    def finish_manual_session(self, session_id: str) -> None:
        runtime = self._manual_runtime_sessions.get(session_id)
        if not runtime:
            return

        db = SessionLocal()
        try:
            manual_session = db.scalar(select(ManualSession).where(ManualSession.session_id == session_id))
            if not manual_session:
                return
            snapshot = db.get(CrawlSnapshot, manual_session.snapshot_id)
            site = db.get(Site, manual_session.site_id)
            if not snapshot or not site:
                return

            try:
                page = runtime["page"]
                self._capture_and_process(db, snapshot, site, page)
                manual_session.status = "completed"
            except Exception as exc:  # noqa: BLE001
                snapshot.status = "failed"
                snapshot.error_message = str(exc)
                manual_session.status = "failed"
                db.add(snapshot)
            finally:
                db.add(manual_session)
                db.commit()
                self._log(db, site.id, snapshot.id, "manual_session", manual_session.status, "Manual session finished")
                self._close_runtime_session(session_id)
        finally:
            db.close()

    def cancel_manual_session(self, session_id: str) -> ManualSessionActionResponse | None:
        manual_session = self.db.scalar(select(ManualSession).where(ManualSession.session_id == session_id))
        if not manual_session:
            return None
        snapshot = self.db.get(CrawlSnapshot, manual_session.snapshot_id)
        site = self.db.get(Site, manual_session.site_id)
        if snapshot and snapshot.status == "waiting_manual":
            snapshot.status = "failed"
            snapshot.error_message = "Manual session cancelled by operator"
            self.db.add(snapshot)
        manual_session.status = "cancelled"
        self.db.add(manual_session)
        self.db.commit()
        if snapshot and site:
            ExecutionRecordService(self.db).archive_snapshot(snapshot=snapshot, site=site, products=[], ai_analysis=None)
        self._close_runtime_session(session_id)
        self._log(self.db, manual_session.site_id, manual_session.snapshot_id, "manual_session", "cancelled", "Manual takeover cancelled")
        return ManualSessionActionResponse(
            session_id=session_id,
            snapshot_id=manual_session.snapshot_id,
            status="cancelled",
            message="Manual session cancelled",
        )

    def _capture_and_process(self, db: Session, snapshot: CrawlSnapshot, site: Site, page: Page) -> None:
        started_at = datetime.utcnow()
        title = None
        try:
            title = page.title()
        except PlaywrightError:
            title = None
        try:
            visible_text = page.locator("body").inner_text(timeout=5000)
        except PlaywrightError:
            visible_text = ""

        final_url = page.url
        html = page.content()
        screenshot_bytes: bytes | None = None
        screenshot_error: str | None = None
        if site.capture_screenshot:
            try:
                screenshot_bytes = page.screenshot(full_page=True)
            except Exception as exc:  # noqa: BLE001
                screenshot_error = f"full_page screenshot failed: {exc}"
                try:
                    screenshot_bytes = page.screenshot(full_page=False)
                    screenshot_error = None
                except Exception as fallback_exc:  # noqa: BLE001
                    screenshot_error = f"{screenshot_error}; viewport screenshot failed: {fallback_exc}"

        snapshot.final_url = final_url
        snapshot.title = title
        snapshot.visible_text = visible_text[:12000] if visible_text else None
        snapshot.html_path = self.storage.save_html(site.id, snapshot.id, html)
        if screenshot_bytes:
            snapshot.screenshot_path = self.storage.save_screenshot_bytes(site.id, snapshot.id, screenshot_bytes)
        elif site.capture_screenshot:
            snapshot.error_message = screenshot_error
            self._log(db, site.id, snapshot.id, "screenshot", "failed", screenshot_error, started_at)

        challenge = detect_challenge(final_url, title, visible_text)
        if challenge.detected:
            snapshot.status = "waiting_manual"
            snapshot.challenge_reason = challenge.reason
            snapshot.crawled_at = datetime.utcnow()
            db.add(snapshot)
            db.commit()
            ExecutionRecordService(db).archive_snapshot(snapshot=snapshot, site=site, products=[], ai_analysis=None)
            self._log(db, site.id, snapshot.id, "crawl", "challenge_detected", challenge.reason, started_at)
            return

        snapshot.status = "parsing"
        extractor_rules = dict(site.extractor_rules or {})
        extractor_rules["site_id"] = str(site.id)
        rule_extracted = extract_fields(page, visible_text, site.extractor_type, extractor_rules)
        final_extracted = {
            "page_type": "product_list",
            "site_id": str(site.id),
            "site_name": site.name,
            "source_url": site.url,
            "final_url": final_url,
            "title": title,
            "category": rule_extracted.get("category") or "",
            "products": rule_extracted.get("products") or [],
        }
        analysis_bundle = {
            "page_type": "product_list",
            "rule_extracted": rule_extracted,
            "ai_analysis": None,
            "ai_input": {
                "used_text": bool(visible_text),
                "used_image": False,
            },
            "final_extracted": final_extracted,
        }
        snapshot.ai_status = "not_requested"
        snapshot.ai_summary = None
        snapshot.ai_error_message = None
        if site.ai_enabled:
            snapshot.ai_status = "analyzing"
            db.add(snapshot)
            db.commit()
            self._log(db, site.id, snapshot.id, "ai_analysis", "running", "AI analysis started", started_at)
            try:
                api_key = self._resolve_ai_api_key()
                recent_records = ExecutionRecordService(db).build_history_context(site.id, exclude_snapshot_id=snapshot.id)

                ai_result = self.ai.analyze(
                    base_url=self._resolve_ai_base_url(),
                    api_key=api_key,
                    model=self._resolve_ai_model(),
                    page_title=title,
                    source_url=site.url,
                    final_url=final_url,
                    visible_text=visible_text,
                    screenshot_path=snapshot.screenshot_path,
                    prompt_template=settings.ai_prompt_template,
                    initial_products=rule_extracted.get("products") or [],
                    recent_records=recent_records,
                )
                analysis_bundle["ai_analysis"] = ai_result.analysis
                analysis_bundle["ai_input"]["used_image"] = ai_result.used_image
                analysis_bundle["final_extracted"] = {
                    **analysis_bundle["final_extracted"],
                    **merge_product_results(rule_extracted, ai_result.analysis, site_id=str(site.id)),
                    "site_id": str(site.id),
                    "site_name": site.name,
                    "source_url": site.url,
                    "final_url": final_url,
                    "title": title,
                }
                snapshot.ai_status = "completed"
                snapshot.ai_summary = ai_result.summary
                self._log(db, site.id, snapshot.id, "ai_analysis", "completed", "AI analysis completed", started_at)
            except Exception as exc:  # noqa: BLE001
                snapshot.ai_status = "analysis_failed"
                snapshot.ai_error_message = str(exc)
                self._log(db, site.id, snapshot.id, "ai_analysis", "analysis_failed", str(exc), started_at)
        if not snapshot.ai_summary:
            snapshot.ai_summary = self._build_product_summary(analysis_bundle["final_extracted"].get("products") or [])

        self.storage.save_json(site.id, snapshot.id, analysis_bundle)
        snapshot.extracted_json = analysis_bundle
        snapshot.status = "success"
        snapshot.crawled_at = datetime.utcnow()
        db.add(snapshot)
        db.commit()

        final_products = analysis_bundle["final_extracted"].get("products") or []

        archived_record = ExecutionRecordService(db).archive_snapshot(
            snapshot=snapshot,
            site=site,
            products=final_products,
            ai_analysis=analysis_bundle.get("ai_analysis"),
        )

        ProductCatalogService(db).sync_products_from_execution(
            site_id=site.id,
            site_name=site.name,
            site_url=site.url,
            snapshot_id=snapshot.id,
            screenshot_path=snapshot.screenshot_path,
            products=final_products,
            captured_at=snapshot.crawled_at,
        )

        system_settings = SystemSettingsService(db).get_settings()
        if system_settings.export_enabled:
            try:
                ExportService(db).export_static(system_settings.export_path)
            except Exception as exc:  # noqa: BLE001
                self._log(db, site.id, snapshot.id, "export", "failed", str(exc), started_at)

        message = f"Snapshot captured with {len(final_products)} products"
        self._log(db, site.id, snapshot.id, "crawl", snapshot.status, message, started_at)

    def _build_product_summary(self, products: list[dict]) -> str:
        if not products:
            return "未识别到商品"
        return f"共识别 {len(products)} 个商品"

    def _resolve_ai_api_key(self) -> str:
        if settings.ai_api_key and settings.ai_api_key.strip():
            return settings.ai_api_key.strip()
        raise AIConfigurationError("Missing AI API key. Set AI_API_KEY in the project .env file.")

    def _resolve_ai_base_url(self) -> str:
        if settings.ai_base_url and settings.ai_base_url.strip():
            return settings.ai_base_url.strip()
        raise AIConfigurationError("Missing AI base URL. Set AI_BASE_URL in the project .env file.")

    def _resolve_ai_model(self) -> str:
        if settings.ai_model and settings.ai_model.strip():
            return settings.ai_model.strip()
        raise AIConfigurationError("Missing AI model. Set AI_MODEL in the project .env file.")

    def _log(
        self,
        db: Session,
        site_id: int,
        snapshot_id: int | None,
        task_type: str,
        status: str,
        message: str | None,
        started_at: datetime | None = None,
    ) -> None:
        duration_ms = int((datetime.utcnow() - started_at).total_seconds() * 1000) if started_at else None
        log = TaskLog(
            site_id=site_id,
            snapshot_id=snapshot_id,
            task_type=task_type,
            status=status,
            duration_ms=duration_ms,
            message=message,
        )
        db.add(log)
        db.commit()

    def _context_kwargs(self) -> dict:
        kwargs: dict = {}
        if settings.playwright_user_agent:
            kwargs["user_agent"] = settings.playwright_user_agent
        return kwargs

    def _to_manual_session_read(self, manual_session: ManualSession) -> ManualSessionRead:
        return ManualSessionRead(
            session_id=manual_session.session_id,
            snapshot_id=manual_session.snapshot_id,
            site_id=manual_session.site_id,
            status=manual_session.status,
            challenge_reason=manual_session.challenge_reason,
            expires_at=manual_session.expires_at,
            instruction="A headed browser window is open on the backend host. Complete the challenge there, then click resume in the UI.",
        )

    def _close_runtime_session(self, session_id: str) -> None:
        runtime = self._manual_runtime_sessions.pop(session_id, None)
        if not runtime:
            return

        try:
            runtime["context"].close()
        except Exception:  # noqa: BLE001
            pass
        try:
            runtime["browser"].close()
        except Exception:  # noqa: BLE001
            pass
        try:
            runtime["playwright"].stop()
        except Exception:  # noqa: BLE001
            pass
