from datetime import datetime

from pydantic import BaseModel


class ManualSessionRead(BaseModel):
    session_id: str
    snapshot_id: int
    site_id: int
    status: str
    challenge_reason: str | None
    expires_at: datetime
    instruction: str


class ManualSessionActionResponse(BaseModel):
    session_id: str
    snapshot_id: int
    status: str
    message: str

