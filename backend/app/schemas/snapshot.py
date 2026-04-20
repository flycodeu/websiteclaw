from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SnapshotListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    site_id: int
    status: str
    sync_status: str
    ai_status: str
    screenshot_upload_status: str
    title: str | None
    final_url: str | None
    screenshot_path: str | None
    crawled_at: datetime | None
    challenge_reason: str | None
    error_message: str | None
    created_at: datetime


class SnapshotRead(SnapshotListItem):
    source_url: str
    visible_text: str | None
    html_path: str | None
    extracted_json: dict | None
    screenshot_file_token: str | None
    ai_summary: str | None
    ai_error_message: str | None
    feishu_record_id: str | None
    updated_at: datetime
