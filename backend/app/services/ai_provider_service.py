from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..models.ai_provider import AIProvider
from ..schemas.ai_provider import AIProviderCreate, AIProviderUpdate


class AIProviderService:
    def __init__(self, db: Session):
        self.db = db

    def list_providers(self) -> list[AIProvider]:
        stmt = select(AIProvider).order_by(AIProvider.is_default.desc(), AIProvider.updated_at.desc())
        return list(self.db.scalars(stmt).all())

    def create_provider(self, payload: AIProviderCreate) -> AIProvider:
        data = self._normalize_data(payload.model_dump(mode="json"))
        provider = AIProvider(**data)
        if provider.is_default:
            self._clear_default_provider()
            provider.enabled = True
        self.db.add(provider)
        self.db.commit()
        self.db.refresh(provider)
        return provider

    def update_provider(self, provider_id: int, payload: AIProviderUpdate) -> AIProvider | None:
        provider = self.db.get(AIProvider, provider_id)
        if not provider:
            return None

        updates = self._normalize_data(payload.model_dump(exclude_unset=True, mode="json"))
        for field, value in updates.items():
            setattr(provider, field, value)

        if provider.is_default:
            self._clear_default_provider(exclude_id=provider.id)
            provider.enabled = True
        elif provider.enabled is False:
            provider.is_default = False

        self.db.add(provider)
        self.db.commit()
        self.db.refresh(provider)
        return provider

    def get_default_provider(self) -> AIProvider | None:
        stmt = (
            select(AIProvider)
            .where(AIProvider.is_default.is_(True), AIProvider.enabled.is_(True))
            .order_by(AIProvider.updated_at.desc())
        )
        return self.db.scalar(stmt)

    def _clear_default_provider(self, exclude_id: int | None = None) -> None:
        stmt = update(AIProvider).where(AIProvider.is_default.is_(True))
        if exclude_id is not None:
            stmt = stmt.where(AIProvider.id != exclude_id)
        self.db.execute(stmt.values(is_default=False))

    def _normalize_data(self, data: dict) -> dict:
        normalized = dict(data)
        for field in ["name", "base_url", "model"]:
            if field in normalized and isinstance(normalized[field], str):
                normalized[field] = normalized[field].strip()

        if "prompt_template" in normalized and isinstance(normalized["prompt_template"], str):
            normalized["prompt_template"] = normalized["prompt_template"].strip() or None

        if normalized.get("enabled") is False:
            normalized["is_default"] = False

        if normalized.get("is_default") is True:
            normalized["enabled"] = True

        return normalized
