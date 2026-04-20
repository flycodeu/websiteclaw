from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.site import Site
from ..schemas.site import SiteCreate, SiteUpdate
from .storage import StorageService


class SiteService:
    def __init__(self, db: Session):
        self.db = db
        self.storage = StorageService()

    def list_sites(self) -> list[Site]:
        return list(self.db.scalars(select(Site).order_by(Site.updated_at.desc())).all())

    def create_site(self, payload: SiteCreate) -> Site:
        site = Site(**payload.model_dump(mode="json"))
        self.db.add(site)
        self.db.commit()
        self.db.refresh(site)
        return site

    def update_site(self, site_id: int, payload: SiteUpdate) -> Site | None:
        site = self.db.get(Site, site_id)
        if not site:
            return None

        for field, value in payload.model_dump(exclude_unset=True, mode="json").items():
            setattr(site, field, value)

        self.db.add(site)
        self.db.commit()
        self.db.refresh(site)
        return site

    def delete_site(self, site_id: int) -> bool:
        site = self.db.get(Site, site_id)
        if not site:
            return False

        self.db.delete(site)
        self.db.commit()
        self.storage.remove_site_data(site_id)
        return True
