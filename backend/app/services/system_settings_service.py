from sqlalchemy.orm import Session

from ..models.system_settings import SystemSettings
from ..schemas.system_settings import SystemSettingsUpdate


class SystemSettingsService:
    SINGLETON_ID = 1

    def __init__(self, db: Session):
        self.db = db

    def get_settings(self) -> SystemSettings:
        settings = self.db.get(SystemSettings, self.SINGLETON_ID)
        if settings:
            return settings

        settings = SystemSettings(id=self.SINGLETON_ID)
        self.db.add(settings)
        self.db.commit()
        self.db.refresh(settings)
        return settings

    def update_settings(self, payload: SystemSettingsUpdate) -> SystemSettings:
        settings = self.get_settings()
        data = payload.model_dump(mode="json")
        for key, value in data.items():
            if isinstance(value, str):
                value = value.strip() or None
            setattr(settings, key, value)

        self.db.add(settings)
        self.db.commit()
        self.db.refresh(settings)
        return settings
