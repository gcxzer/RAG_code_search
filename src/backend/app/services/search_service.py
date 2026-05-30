import os
from app.config.defaults import DATA_DIR
from app.config.manager import get_settings
from app.services import llm_client, repo_service


def _normalize_top_k(top_k: int) -> int:
    if top_k < 1 or top_k > 50:
        raise ValueError("top_k must be between 1 and 50")
    return top_k


def _require_indexed_repo(repo_id: str) -> dict:
    repo = repo_service.get_repo(repo_id)
    if not repo:
        raise ValueError(f"Repo not found: {repo_id}")
    if repo.get("status") != "indexed":
        raise ValueError(f"Repo is not indexed yet: {repo_id}. Please index first.")
    return repo


def search(query: str, repo_id: str, top_k: int | None = None) -> dict:
    settings = get_settings()
    k = _normalize_top_k(top_k if top_k is not None else settings["top_k"])
    if not query.strip():
        raise ValueError("Query must not be empty")
    _require_indexed_repo(repo_id)

    query_embedding = llm_client.embed_query(query)
    query_embedding_preview = query_embedding[:10]

    import chromadb
    chroma_path = os.path.join(DATA_DIR, "chroma")
    client = chromadb.PersistentClient(path=chroma_path)
    try:
        collection = client.get_collection(f"repo_{repo_id}")
    except Exception:
        raise ValueError(f"No index found for repo: {repo_id}. Please index first.")

    # warn if collection was indexed before cosine distance was enabled
    col_meta = collection.metadata or {}
    if col_meta.get("hnsw:space") != "cosine":
        raise ValueError(
            f"Repo {repo_id} was indexed with L2 distance. "
            "Please re-index to enable cosine similarity scores."
        )

    total_searched = collection.count()
    if total_searched == 0:
        return {
            "query_embedding_preview": [round(v, 6) for v in query_embedding_preview],
            "results": [],
            "total_searched": 0,
        }

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(k, total_searched),
        include=["documents", "metadatas", "distances"],
    )

    hits = []
    ids = results["ids"][0]
    docs = results["documents"][0]
    metas = results["metadatas"][0]
    distances = results["distances"][0]

    for chunk_id, doc, meta, dist in zip(ids, docs, metas, distances):
        score = max(0.0, 1.0 - dist)
        hits.append({
            "chunk_id": chunk_id,
            "content": doc,
            "file_path": meta.get("file_path", ""),
            "line_start": meta.get("line_start", 0),
            "line_end": meta.get("line_end", 0),
            "score": round(score, 4),
            "distance": round(dist, 6),
        })

    return {
        "query_embedding_preview": [round(v, 6) for v in query_embedding_preview],
        "results": hits,
        "total_searched": total_searched,
    }
