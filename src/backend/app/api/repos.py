from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form, Request
from pydantic import BaseModel
from app.services import repo_service, index_service
import ipaddress
import os
import tempfile

router = APIRouter()
MAX_UPLOAD_BYTES = 100 * 1024 * 1024


class AddRepoRequest(BaseModel):
    path: str
    name: str | None = None


def _is_loopback_client(request: Request) -> bool:
    host = request.client.host if request.client else ""
    if host in {"localhost", "testclient", ""}:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


@router.post("/repos", status_code=201)
def add_repo(req: AddRepoRequest, request: Request):
    allow_remote = os.getenv("ALLOW_REMOTE_LOCAL_REPOS", "").lower() in {"1", "true", "yes"}
    if not allow_remote and not _is_loopback_client(request):
        raise HTTPException(status_code=403, detail="Adding local server paths is only allowed from loopback clients")
    try:
        return repo_service.add_repo(req.path, req.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/repos/upload", status_code=201)
async def upload_repo(
    file: UploadFile = File(...),
    name: str = Form(default=""),
):
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip archives are supported")
    # Save to temp file then hand off to repo_service
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    total = 0
    try:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Uploaded zip is too large")
            tmp.write(chunk)
        tmp.close()
        return repo_service.add_repo_from_upload(tmp.name, name or None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        if os.path.exists(tmp.name):
            os.remove(tmp.name)
        raise
    finally:
        if not tmp.closed:
            tmp.close()
        await file.close()


@router.get("/repos")
def list_repos():
    return repo_service.list_repos()


@router.delete("/repos/{repo_id}", status_code=204)
def delete_repo(repo_id: str):
    try:
        if not repo_service.delete_repo(repo_id):
            raise HTTPException(status_code=404, detail="Repo not found")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/repos/{repo_id}/index", status_code=202)
def trigger_index(repo_id: str, background_tasks: BackgroundTasks):
    repo = repo_service.get_repo(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")
    repo_service.update_repo(repo_id, {"status": "indexing", "error_msg": None})
    background_tasks.add_task(index_service.index_repo, repo_id)
    return {"status": "indexing", "repo_id": repo_id}


@router.get("/repos/{repo_id}/index/status")
def index_status(repo_id: str):
    repo = repo_service.get_repo(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")
    return {"repo_id": repo_id, "status": repo["status"], "error_msg": repo.get("error_msg")}
