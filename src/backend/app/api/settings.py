from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.config.manager import get_settings, update_settings

router = APIRouter()
KEY_FIELDS = {"llm_api_key", "embedding_api_key"}


class SettingsUpdate(BaseModel):
    llm_api_key: str | None = Field(default=None, max_length=4096)
    llm_base_url: str | None = Field(default=None, min_length=1, max_length=2048)
    llm_model: str | None = Field(default=None, min_length=1, max_length=256)
    embedding_api_key: str | None = Field(default=None, max_length=4096)
    embedding_base_url: str | None = Field(default=None, min_length=1, max_length=2048)
    embedding_model: str | None = Field(default=None, min_length=1, max_length=256)
    chunk_size: int | None = Field(default=None, ge=100, le=200_000)
    chunk_overlap: int | None = Field(default=None, ge=0, le=100_000)
    top_k: int | None = Field(default=None, ge=1, le=50)
    max_prompt_tokens: int | None = Field(default=None, ge=1_000, le=200_000)
    indexed_extensions: list[str] | None = Field(default=None, min_length=1, max_length=100)
    system_prompt: str | None = Field(default=None, min_length=1, max_length=20_000)


def _mask_settings(settings: dict) -> dict:
    result = dict(settings)
    for key in KEY_FIELDS:
        value = result.get(key)
        if value:
            prefix = value[:8] if len(value) > 8 else ""
            result[key] = prefix + "****"
    return result


def _validate_effective_settings(settings: dict) -> None:
    chunk_size = settings["chunk_size"]
    chunk_overlap = settings["chunk_overlap"]
    if chunk_overlap >= chunk_size:
        raise HTTPException(
            status_code=422,
            detail="chunk_overlap must be smaller than chunk_size",
        )


def _normalize_extensions(extensions: list[str]) -> list[str]:
    normalized = []
    for raw in extensions:
        ext = raw.strip().lower()
        if not ext:
            continue
        if "/" in ext or "\\" in ext:
            raise HTTPException(status_code=422, detail="indexed_extensions must be file extensions")
        if not ext.startswith("."):
            ext = f".{ext}"
        if len(ext) > 32:
            raise HTTPException(status_code=422, detail="indexed_extensions contains an invalid extension")
        normalized.append(ext)
    unique = sorted(set(normalized))
    if not unique:
        raise HTTPException(status_code=422, detail="indexed_extensions must not be empty")
    return unique


@router.get("/settings")
def get_settings_endpoint():
    return _mask_settings(get_settings())


@router.put("/settings")
def update_settings_endpoint(req: SettingsUpdate):
    current = get_settings()
    masked_current = _mask_settings(current)
    partial = {}
    for key, value in req.model_dump().items():
        if value is None:
            continue
        if key in KEY_FIELDS and value == masked_current.get(key):
            continue
        partial[key] = value
    if "indexed_extensions" in partial:
        partial["indexed_extensions"] = _normalize_extensions(partial["indexed_extensions"])

    effective = current
    effective.update(partial)
    _validate_effective_settings(effective)
    return _mask_settings(update_settings(partial))


@router.get("/health")
def health_check():
    return {"status": "ok", "version": "2.0.0"}
