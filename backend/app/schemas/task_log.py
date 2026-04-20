from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TaskLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    site_id: int
    snapshot_id: int | None
    task_type: str
    status: str
    duration_ms: int | None
    message: str | None
    created_at: datetime

