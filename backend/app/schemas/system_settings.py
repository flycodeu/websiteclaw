from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SystemSettingsBase(BaseModel):
    export_enabled: bool = True
    export_path: str | None = None


class SystemSettingsUpdate(SystemSettingsBase):
    pass


class SystemSettingsRead(SystemSettingsBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
