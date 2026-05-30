import ntpath
import os
import stat
import uuid
import zipfile
import shutil
from datetime import UTC, datetime
from pathlib import PurePosixPath
from app.config.defaults import DATA_DIR
from app.services.json_store import load_json, save_json, update_json

REPOS_FILE = os.path.join(DATA_DIR, "repos.json")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
MAX_ZIP_MEMBERS = 10_000
MAX_EXTRACTED_BYTES = 250 * 1024 * 1024
DEFAULT_INDEXED_EXTENSIONS = (".py",)
SKIP_DIR_NAMES = {
    "__pycache__",
    "node_modules",
    ".venv",
    "venv",
    "dist",
    "build",
    "coverage",
    "out",
    "target",
}
SKIP_FILE_NAMES = {
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "uv.lock",
    "poetry.lock",
    "pipfile.lock",
    "cargo.lock",
    "gemfile.lock",
    "composer.lock",
}
SKIP_FILE_SUFFIXES = (".min.js", ".min.css")
MAX_INDEX_FILE_BYTES = 2 * 1024 * 1024


def _load_repos() -> list[dict]:
    os.makedirs(DATA_DIR, exist_ok=True)
    return load_json(REPOS_FILE, [])


def _save_repos(repos: list[dict]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    save_json(REPOS_FILE, repos)


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _configured_local_roots() -> list[str]:
    raw = os.getenv("LOCAL_REPO_ROOTS", "")
    if not raw.strip():
        return []
    separators = [os.pathsep, ","]
    roots = [raw]
    for separator in separators:
        roots = [part for item in roots for part in item.split(separator)]
    return [
        os.path.realpath(os.path.abspath(os.path.expanduser(part.strip())))
        for part in roots
        if part.strip()
    ]


def _validate_allowed_local_path(path: str) -> None:
    if os.path.islink(path):
        raise ValueError("Repository path must not be a symbolic link")
    roots = _configured_local_roots()
    if not roots:
        return
    resolved = os.path.realpath(path)
    for root in roots:
        try:
            if os.path.commonpath([resolved, root]) == root:
                return
        except ValueError:
            continue
    allowed = ", ".join(roots)
    raise ValueError(f"Path is outside allowed local repository roots: {allowed}")


def _delete_vector_collection(repo_id: str) -> None:
    import chromadb

    try:
        chroma_path = os.path.join(DATA_DIR, "chroma")
        client = chromadb.PersistentClient(path=chroma_path)
        client.delete_collection(f"repo_{repo_id}")
    except chromadb.errors.NotFoundError:
        return
    except Exception as exc:
        raise RuntimeError(f"Could not delete vector collection for repo {repo_id}: {exc}") from exc


def _safe_extract_zip(zf: zipfile.ZipFile, extract_dir: str) -> None:
    members = zf.infolist()
    if len(members) > MAX_ZIP_MEMBERS:
        raise ValueError(f"Zip archive has too many files: {len(members)}")

    base_dir = os.path.abspath(extract_dir)
    total_size = 0
    for member in members:
        name = member.filename
        mode = (member.external_attr >> 16) & 0o170000
        if mode == stat.S_IFLNK:
            raise ValueError(f"Zip archive contains unsupported symlink: {name}")
        if ntpath.isabs(name) or os.path.isabs(name):
            raise ValueError(f"Zip archive contains an absolute path: {name}")

        path = PurePosixPath(name)
        if ".." in path.parts:
            raise ValueError(f"Zip archive contains a parent path reference: {name}")

        target_path = os.path.abspath(os.path.join(extract_dir, *path.parts))
        if target_path != base_dir and not target_path.startswith(base_dir + os.sep):
            raise ValueError(f"Zip archive path escapes the upload directory: {name}")

        if member.is_dir():
            os.makedirs(target_path, exist_ok=True)
            continue

        total_size += member.file_size
        if total_size > MAX_EXTRACTED_BYTES:
            raise ValueError("Zip archive is too large after extraction")

        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        written = 0
        with zf.open(member, "r") as src, open(target_path, "wb") as dst:
            while True:
                chunk = src.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > member.file_size:
                    raise ValueError(f"Zip archive entry exceeded declared size: {name}")
                dst.write(chunk)


def add_repo(path: str, name: str | None = None) -> dict:
    path = os.path.abspath(path)
    if not os.path.isdir(path):
        raise ValueError(f"Path does not exist or is not a directory: {path}")
    _validate_allowed_local_path(path)
    repo = {
        "repo_id": uuid.uuid4().hex[:8],
        "name": name or os.path.basename(path),
        "path": path,
        "status": "pending",
        "created_at": _utc_now(),
        "file_count": 0,
        "chunk_count": 0,
        "error_msg": None,
    }

    def add(repos: list[dict]) -> dict:
        for r in repos:
            if r["path"] == path:
                raise ValueError(f"Repo already exists: {path}")
        repos.append(repo)
        return repo

    update_json(REPOS_FILE, [], add)
    return repo


def add_repo_from_upload(zip_path: str, name: str | None = None) -> dict:
    """Extract uploaded zip to uploads dir and register as a repo."""
    repo_id = uuid.uuid4().hex[:8]
    extract_dir = os.path.join(UPLOADS_DIR, repo_id)
    os.makedirs(extract_dir, exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            _safe_extract_zip(zf, extract_dir)
    except zipfile.BadZipFile:
        shutil.rmtree(extract_dir, ignore_errors=True)
        raise ValueError("Uploaded file is not a valid zip archive")
    except ValueError:
        shutil.rmtree(extract_dir, ignore_errors=True)
        raise
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)

    # If zip contains a single top-level folder, use that as the repo root
    entries = os.listdir(extract_dir)
    if len(entries) == 1 and os.path.isdir(os.path.join(extract_dir, entries[0])):
        repo_path = os.path.join(extract_dir, entries[0])
    else:
        repo_path = extract_dir

    default_name = name or os.path.basename(repo_path)
    repo = {
        "repo_id": repo_id,
        "name": default_name,
        "path": repo_path,
        "status": "pending",
        "created_at": _utc_now(),
        "file_count": 0,
        "chunk_count": 0,
        "error_msg": None,
        "source": "upload",
    }
    update_json(REPOS_FILE, [], lambda repos: repos.append(repo))
    return repo


def list_repos() -> list[dict]:
    return _load_repos()


def get_repo(repo_id: str) -> dict | None:
    for r in _load_repos():
        if r["repo_id"] == repo_id:
            return r
    return None


def update_repo(repo_id: str, updates: dict) -> dict | None:
    def update(repos: list[dict]) -> dict | None:
        for r in repos:
            if r["repo_id"] == repo_id:
                r.update(updates)
                return dict(r)
        return None

    return update_json(REPOS_FILE, [], update)


def delete_repo(repo_id: str) -> bool:
    target = get_repo(repo_id)
    if not target:
        return False

    _delete_vector_collection(repo_id)

    def remove(repos: list[dict]) -> bool:
        original_len = len(repos)
        repos[:] = [r for r in repos if r["repo_id"] != repo_id]
        return len(repos) != original_len

    removed = update_json(REPOS_FILE, [], remove)
    if not removed:
        return False
    # clean up chunk file
    chunks_file = os.path.join(DATA_DIR, f"{repo_id}_chunks.json")
    if os.path.exists(chunks_file):
        os.remove(chunks_file)
    # clean up uploaded files
    upload_dir = os.path.join(UPLOADS_DIR, repo_id)
    if os.path.isdir(upload_dir):
        shutil.rmtree(upload_dir, ignore_errors=True)
    return True


def _is_skipped_file(file_name: str, abs_path: str) -> bool:
    lowered = file_name.lower()
    if lowered in SKIP_FILE_NAMES:
        return True
    if lowered.endswith(SKIP_FILE_SUFFIXES):
        return True
    if os.path.islink(abs_path):
        return True
    try:
        return os.path.getsize(abs_path) > MAX_INDEX_FILE_BYTES
    except OSError:
        return True


def scan_files(repo_path: str, extensions: list[str] | tuple[str, ...] | None = None) -> list[str]:
    allowed_extensions = tuple(
        ext.lower() if ext.startswith(".") else f".{ext.lower()}"
        for ext in (extensions or DEFAULT_INDEXED_EXTENSIONS)
    )
    matched_files = []
    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [
            d for d in dirs
            if (
                not d.startswith(".")
                and d not in SKIP_DIR_NAMES
                and not os.path.islink(os.path.join(root, d))
            )
        ]
        for f in files:
            abs_path = os.path.join(root, f)
            if _is_skipped_file(f, abs_path):
                continue
            if f.lower().endswith(allowed_extensions):
                matched_files.append(abs_path)
    return matched_files
