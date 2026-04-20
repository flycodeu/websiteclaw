from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class SiteBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    url: HttpUrl
    platform: str = Field(default="", max_length=100)
    enabled: bool = True
    timeout_seconds: int = Field(default=45, ge=5, le=300)
    capture_screenshot: bool = True
    extractor_type: str = Field(default="generic_text")
    extractor_rules: dict = Field(default_factory=dict)
    ai_enabled: bool = False
    notes: str | None = None


class SiteCreate(SiteBase):
    pass


class SiteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    url: HttpUrl | None = None
    platform: str | None = Field(default=None, max_length=100)
    enabled: bool | None = None
    timeout_seconds: int | None = Field(default=None, ge=5, le=300)
    capture_screenshot: bool | None = None
    extractor_type: str | None = None
    extractor_rules: dict | None = None
    ai_enabled: bool | None = None
    notes: str | None = None


class SiteRead(SiteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
