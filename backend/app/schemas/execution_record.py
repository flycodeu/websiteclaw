from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ExecutionProductBase(BaseModel):
    name: str = Field(min_length=1)
    price_text: str | None = None
    price_normalized: str | None = None
    stock_text: str | None = None
    stock_normalized: str | None = None
    warranty: str = "否"
    product_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    notes: str | None = None


class ExecutionProductCreate(ExecutionProductBase):
    product_key: str | None = None
    sort_order: int = 0


class ExecutionProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    price_text: str | None = None
    price_normalized: str | None = None
    stock_text: str | None = None
    stock_normalized: str | None = None
    warranty: str | None = None
    product_url: str | None = None
    tags: list[str] | None = None
    notes: str | None = None
    sort_order: int | None = None


class ExecutionProductRead(ExecutionProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    record_id: int
    sort_order: int
    product_key: str | None
    created_at: datetime
    updated_at: datetime


class ExecutionRecordUpdate(BaseModel):
    status: str | None = None
    manual_review_status: str | None = None
    review: str | None = None


class ExecutionRecordListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    site_id: int
    snapshot_id: int | None
    site_name: str
    site_url: str
    final_url: str | None
    platform: str
    status: str
    manual_review_status: str
    review: str | None
    screenshot_path: str | None
    is_accessible: bool | None
    ai_summary: str | None
    stability_level: str
    stability_summary: str | None
    products_summary: str | None
    product_count: int
    share_token: str | None
    captured_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ExecutionRecordRead(ExecutionRecordListItem):
    ai_analysis: dict | None
    products: list[ExecutionProductRead] = Field(default_factory=list)


class ExecutionRecordShareResponse(BaseModel):
    record_id: int
    share_token: str
