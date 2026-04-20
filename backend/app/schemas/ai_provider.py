from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AIProviderBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    base_url: str = Field(min_length=1)
    model: str = Field(min_length=1, max_length=255)
    prompt_template: str | None = None
    enabled: bool = True
    is_default: bool = False


class AIProviderCreate(AIProviderBase):
    pass


class AIProviderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    base_url: str | None = Field(default=None, min_length=1)
    model: str | None = Field(default=None, min_length=1, max_length=255)
    prompt_template: str | None = None
    enabled: bool | None = None
    is_default: bool | None = None


class AIProviderRead(AIProviderBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
