import os
import uuid
from app.config.defaults import DATA_DIR
from app.config.manager import get_settings
from app.services import repo_service, llm_client
from app.services.json_store import load_json, save_json


def _chunks_file(repo_id: str) -> str:
    return os.path.join(DATA_DIR, f"{repo_id}_chunks.json")


def _load_chunks(repo_id: str) -> list[dict]:
    f = _chunks_file(repo_id)
    return load_json(f, [])


def _save_chunks(repo_id: str, chunks: list[dict]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    save_json(_chunks_file(repo_id), chunks)


def _require_repo(repo_id: str) -> dict:
    repo = repo_service.get_repo(repo_id)
    if not repo:
        raise ValueError(f"Repo not found: {repo_id}")
    return repo


def _require_indexed_repo(repo_id: str) -> dict:
    repo = _require_repo(repo_id)
    if repo.get("status") != "indexed":
        raise ValueError(f"Repo is not indexed yet: {repo_id}. Please index first.")
    return repo


def chunk_text(content: str, file_path: str, repo_id: str,
               chunk_size: int, overlap: int) -> list[dict]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than 0")
    if overlap < 0:
        raise ValueError("chunk_overlap must not be negative")
    if overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")

    lines = content.splitlines(keepends=True)
    chunks = []
    line_starts = []  # char offset of each line start
    pos = 0
    for line in lines:
        line_starts.append(pos)
        pos += len(line)
    line_starts.append(pos)  # sentinel

    def char_to_line(char_offset: int) -> int:
        for i, ls in enumerate(line_starts):
            if ls > char_offset:
                return i  # 1-based line number
        return len(lines)

    chunk_index = 0
    start_char = 0
    while start_char < len(content):
        end_char = min(start_char + chunk_size, len(content))
        # extend to line boundary
        if end_char < len(content):
            newline_pos = content.find("\n", end_char)
            if newline_pos != -1:
                end_char = newline_pos + 1

        chunk_content = content[start_char:end_char]
        line_start = char_to_line(start_char)
        line_end = char_to_line(end_char - 1)

        # overlap markers
        overlap_start = None
        overlap_end = None
        if chunk_index > 0:
            overlap_end_char = start_char + overlap
            overlap_start = line_start
            overlap_end = char_to_line(min(overlap_end_char, end_char) - 1)

        chunk_id = f"{repo_id}/{file_path}#{chunk_index}"
        chunks.append({
            "chunk_id": chunk_id,
            "repo_id": repo_id,
            "content": chunk_content,
            "file_path": file_path,
            "line_start": line_start,
            "line_end": line_end,
            "char_count": len(chunk_content),
            "chunk_index": chunk_index,
            "overlap_start": overlap_start,
            "overlap_end": overlap_end,
        })

        if end_char >= len(content):
            break
        next_start = end_char - overlap
        if next_start <= start_char:
            next_start = start_char + max(1, chunk_size - overlap)
        start_char = next_start
        chunk_index += 1

    return chunks


def index_repo(repo_id: str) -> None:
    repo = repo_service.get_repo(repo_id)
    if not repo:
        return
    try:
        settings = get_settings()
        if os.path.islink(repo["path"]):
            raise ValueError("Repository path must not be a symbolic link")
        files = repo_service.scan_files(repo["path"], settings.get("indexed_extensions"))
        all_chunks = []
        for abs_path in files:
            rel_path = os.path.relpath(abs_path, repo["path"])
            try:
                with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
            except Exception:
                continue
            file_chunks = chunk_text(
                content, rel_path, repo_id,
                settings["chunk_size"], settings["chunk_overlap"]
            )
            all_chunks.extend(file_chunks)

        # embed and store in ChromaDB
        import chromadb
        chroma_path = os.path.join(DATA_DIR, "chroma")
        client = chromadb.PersistentClient(path=chroma_path)
        collection_name = f"repo_{repo_id}"
        suffix = uuid.uuid4().hex[:12]
        temp_collection_name = f"{collection_name}_tmp_{suffix}"
        backup_collection_name = f"{collection_name}_bak_{suffix}"
        temp_chunks_file = f"{_chunks_file(repo_id)}.{suffix}.tmp"
        temp_promoted = False
        backup_created = False

        collection = client.create_collection(
            temp_collection_name,
            metadata={"hnsw:space": "cosine"},
        )

        try:
            batch_size = 6
            for i in range(0, len(all_chunks), batch_size):
                batch = all_chunks[i:i + batch_size]
                texts = [c["content"] for c in batch]
                ids = [c["chunk_id"] for c in batch]
                metadatas = [{
                    "file_path": c["file_path"],
                    "line_start": c["line_start"],
                    "line_end": c["line_end"],
                    "chunk_index": c["chunk_index"],
                } for c in batch]
                embeddings = llm_client.embed_texts(texts)
                collection.add(ids=ids, embeddings=embeddings,
                               documents=texts, metadatas=metadatas)

            save_json(temp_chunks_file, all_chunks)

            try:
                old_collection = client.get_collection(collection_name)
            except chromadb.errors.NotFoundError:
                old_collection = None

            if old_collection is not None:
                old_collection.modify(name=backup_collection_name)
                backup_created = True

            collection.modify(name=collection_name)
            temp_promoted = True
            os.replace(temp_chunks_file, _chunks_file(repo_id))

            if backup_created:
                try:
                    client.delete_collection(backup_collection_name)
                except Exception:
                    pass

            repo_service.update_repo(repo_id, {
                "status": "indexed",
                "file_count": len(files),
                "chunk_count": len(all_chunks),
            })
        except Exception:
            if os.path.exists(temp_chunks_file):
                os.remove(temp_chunks_file)
            try:
                if temp_promoted:
                    client.delete_collection(collection_name)
                else:
                    client.delete_collection(temp_collection_name)
            except chromadb.errors.NotFoundError:
                pass
            except Exception:
                pass

            if backup_created:
                try:
                    backup_collection = client.get_collection(backup_collection_name)
                    backup_collection.modify(name=collection_name)
                except Exception:
                    pass
            raise
    except Exception as e:
        repo_service.update_repo(repo_id, {"status": "error", "error_msg": str(e)})


def get_chunks(repo_id: str) -> list[dict]:
    _require_indexed_repo(repo_id)
    return _load_chunks(repo_id)


def get_chunk(repo_id: str, chunk_id: str) -> dict | None:
    for c in _load_chunks(repo_id):
        if c["chunk_id"] == chunk_id:
            return c
    return None


def get_chunk_context(repo_id: str, chunk_id: str) -> dict:
    repo = _require_indexed_repo(repo_id)
    chunk = get_chunk(repo_id, chunk_id)
    if not chunk:
        raise ValueError(f"Chunk not found: {chunk_id}")
    repo_root = os.path.realpath(repo["path"])
    abs_path = os.path.realpath(os.path.join(repo["path"], chunk["file_path"]))
    try:
        if os.path.commonpath([repo_root, abs_path]) != repo_root:
            raise ValueError("Chunk path escapes the repository root")
    except ValueError:
        raise ValueError("Chunk path escapes the repository root")
    if os.path.islink(os.path.join(repo["path"], chunk["file_path"])):
        raise ValueError("Chunk path points to a symbolic link")
    try:
        with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
            file_content = f.read()
    except Exception as e:
        raise ValueError(f"Cannot read file: {e}")
    total_lines = len(file_content.splitlines())
    return {
        "chunk": chunk,
        "file_content": file_content,
        "file_path": chunk["file_path"],
        "total_lines": total_lines,
        "highlight_start": chunk["line_start"],
        "highlight_end": chunk["line_end"],
    }


def get_stats(repo_id: str) -> dict:
    _require_indexed_repo(repo_id)
    chunks = _load_chunks(repo_id)
    settings = get_settings()
    file_dist: dict[str, int] = {}
    for c in chunks:
        file_dist[c["file_path"]] = file_dist.get(c["file_path"], 0) + 1

    # get embedding dim from first chunk if available
    embedding_dim = 0
    try:
        import chromadb
        chroma_path = os.path.join(DATA_DIR, "chroma")
        client = chromadb.PersistentClient(path=chroma_path)
        col = client.get_collection(f"repo_{repo_id}")
        result = col.get(limit=1, include=["embeddings"])
        embs = result["embeddings"]
        if embs is not None and len(embs) > 0:
            embedding_dim = len(embs[0])
    except Exception:
        pass

    return {
        "total_chunks": len(chunks),
        "total_files": len(file_dist),
        "embedding_dim": embedding_dim,
        "chunk_size": settings["chunk_size"],
        "chunk_overlap": settings["chunk_overlap"],
        "file_distribution": [
            {"file_path": fp, "chunk_count": cnt}
            for fp, cnt in sorted(file_dist.items(), key=lambda x: -x[1])
        ],
    }
