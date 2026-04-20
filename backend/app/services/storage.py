from __future__ import annotations

import json
from pathlib import Path
import shutil

from ..core.config import settings


class StorageService:
    def __init__(self) -> None:
        self.root = settings.data_root

    def _target_dir(self, folder: str, site_id: int) -> Path:
        path = self.root / folder / str(site_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_html(self, site_id: int, snapshot_id: int, html: str) -> str:
        path = self._target_dir("raw_html", site_id) / f"{snapshot_id}.html"
        path.write_text(html, encoding="utf-8")
        return str(path)

    def save_screenshot_bytes(self, site_id: int, snapshot_id: int, content: bytes) -> str:
        path = self._target_dir("screenshots", site_id) / f"{snapshot_id}.png"
        path.write_bytes(content)
        return str(path)

    def save_json(self, site_id: int, snapshot_id: int, payload: dict) -> str:
        path = self._target_dir("extracted", site_id) / f"{snapshot_id}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return str(path)

    def remove_site_data(self, site_id: int) -> None:
        for folder in ("raw_html", "screenshots", "extracted"):
            target = self.root / folder / str(site_id)
            if target.is_dir():
                shutil.rmtree(target, ignore_errors=True)
