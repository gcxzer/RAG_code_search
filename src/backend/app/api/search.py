from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.services import search_service

router = APIRouter()


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=20_000)
    repo_id: str = Field(min_length=1, max_length=128)
    top_k: int | None = Field(default=None, ge=1, le=50)


@router.post("/search")
def search(req: SearchRequest):
    try:
        return search_service.search(req.query, req.repo_id, req.top_k)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
