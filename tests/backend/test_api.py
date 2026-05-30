import pytest


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_get_settings_defaults(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    data = r.json()
    assert "llm_model" in data
    assert "chunk_size" in data
    assert "max_prompt_tokens" in data
    assert ".py" in data["indexed_extensions"]
    assert data["chunk_size"] == 1000


def test_get_settings_migrates_legacy_default_prompt(client):
    from app.config.defaults import DEFAULT_SETTINGS, DEFAULT_SYSTEM_PROMPT
    from app.config.manager import save_settings

    legacy_prompt = (
        "You are a code repository assistant. Answer the user's question using the retrieved code snippets.\n"
        "Cite concrete file paths and line numbers. Keep the answer concise and accurate."
    )
    settings = dict(DEFAULT_SETTINGS)
    settings["system_prompt"] = legacy_prompt
    save_settings(settings)

    r = client.get("/api/settings")

    assert r.status_code == 200
    assert r.json()["system_prompt"] == DEFAULT_SYSTEM_PROMPT


def test_update_settings(client):
    r = client.put("/api/settings", json={"top_k": 10, "chunk_size": 500})
    assert r.status_code == 200
    data = r.json()
    assert data["top_k"] == 10
    assert data["chunk_size"] == 500


def test_update_settings_masks_api_keys(client):
    r = client.put(
        "/api/settings",
        json={
            "llm_api_key": "sk-secret123456",
            "embedding_api_key": "emb-secret123456",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["llm_api_key"] == "sk-secre****"
    assert data["embedding_api_key"] == "emb-secr****"

    from app.config.manager import get_settings

    stored = get_settings()
    assert stored["llm_api_key"] == "sk-secret123456"
    assert stored["embedding_api_key"] == "emb-secret123456"

    r2 = client.put("/api/settings", json={})
    assert r2.status_code == 200
    assert r2.json()["llm_api_key"] == "sk-secre****"


def test_update_settings_allows_stars_in_changed_api_key(client):
    r = client.put("/api/settings", json={"llm_api_key": "literal****key"})
    assert r.status_code == 200

    from app.config.manager import get_settings

    assert get_settings()["llm_api_key"] == "literal****key"


def test_update_settings_validates_retrieval_params(client):
    r = client.put("/api/settings", json={"chunk_size": 500, "chunk_overlap": 500})
    assert r.status_code == 422

    r2 = client.put("/api/settings", json={"top_k": 0})
    assert r2.status_code == 422


def test_update_settings_normalizes_indexed_extensions(client):
    r = client.put("/api/settings", json={
        "max_prompt_tokens": 6000,
        "indexed_extensions": ["py", ".TS", "py"],
    })
    assert r.status_code == 200
    data = r.json()
    assert data["max_prompt_tokens"] == 6000
    assert data["indexed_extensions"] == [".py", ".ts"]

    bad = client.put("/api/settings", json={"indexed_extensions": ["../py"]})
    assert bad.status_code == 422


def test_update_settings_allows_stars_in_non_key_fields(client):
    prompt = "Use references. Literal marker: ****"
    r = client.put("/api/settings", json={"system_prompt": prompt})
    assert r.status_code == 200
    assert r.json()["system_prompt"] == prompt


def test_add_repo(client, sample_repo):
    r = client.post("/api/repos", json={"path": sample_repo})
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "pending"
    assert data["repo_id"]
    assert data["name"] == "sample_project"


def test_add_repo_invalid_path(client):
    r = client.post("/api/repos", json={"path": "/nonexistent/path/xyz"})
    assert r.status_code == 400


def test_add_repo_duplicate(client, sample_repo):
    client.post("/api/repos", json={"path": sample_repo})
    r = client.post("/api/repos", json={"path": sample_repo})
    assert r.status_code == 400


def test_list_repos(client, sample_repo):
    client.post("/api/repos", json={"path": sample_repo})
    r = client.get("/api/repos")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_delete_repo(client, sample_repo):
    add = client.post("/api/repos", json={"path": sample_repo})
    repo_id = add.json()["repo_id"]
    r = client.delete(f"/api/repos/{repo_id}")
    assert r.status_code == 204
    assert client.get("/api/repos").json() == []


def test_delete_repo_removes_vector_collection(client, sample_repo, monkeypatch):
    import app.services.repo_service as rs

    deleted = []
    monkeypatch.setattr(rs, "_delete_vector_collection", lambda repo_id: deleted.append(repo_id))
    add = client.post("/api/repos", json={"path": sample_repo})
    repo_id = add.json()["repo_id"]

    r = client.delete(f"/api/repos/{repo_id}")

    assert r.status_code == 204
    assert deleted == [repo_id]


def test_delete_repo_not_found(client):
    r = client.delete("/api/repos/nonexistent")
    assert r.status_code == 404


def test_index_status_not_found(client):
    r = client.get("/api/repos/nonexistent/index/status")
    assert r.status_code == 404


def test_chunk_routes_reject_missing_repo(client):
    chunks = client.get("/api/repos/nonexistent/chunks")
    stats = client.get("/api/repos/nonexistent/stats")

    assert chunks.status_code == 404
    assert stats.status_code == 404


def test_search_rejects_missing_repo_before_embedding(client, monkeypatch):
    import app.services.search_service as ss

    def fail_embed(_query):
        pytest.fail("embedding should not run for an unknown repo")

    monkeypatch.setattr(ss.llm_client, "embed_query", fail_embed)

    r = client.post("/api/search", json={"repo_id": "nonexistent", "query": "hello"})

    assert r.status_code == 400
    assert "Repo not found" in r.json()["detail"]


def test_create_and_get_session(client):
    r = client.post("/api/chat/sessions", json={})
    assert r.status_code == 201
    sid = r.json()["session_id"]
    r2 = client.get(f"/api/chat/sessions/{sid}")
    assert r2.status_code == 200
    assert r2.json()["session_id"] == sid


def test_delete_session(client):
    r = client.post("/api/chat/sessions", json={})
    sid = r.json()["session_id"]
    r2 = client.delete(f"/api/chat/sessions/{sid}")
    assert r2.status_code == 204


def test_list_sessions(client):
    client.post("/api/chat/sessions", json={})
    client.post("/api/chat/sessions", json={})
    r = client.get("/api/chat/sessions")
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_chat_rejects_session_repo_mismatch(client):
    s = client.post("/api/chat/sessions", json={"repo_id": "repo-a"}).json()
    r = client.post(
        "/api/chat",
        json={"session_id": s["session_id"], "repo_id": "repo-b", "message": "hello"},
    )
    assert r.status_code == 400
    assert "different repository" in r.json()["detail"]


def test_prompt_preview_rejects_session_repo_mismatch(client):
    s = client.post("/api/chat/sessions", json={"repo_id": "repo-a"}).json()
    r = client.post(
        "/api/chat/prompt-preview",
        json={"session_id": s["session_id"], "repo_id": "repo-b", "message": "hello"},
    )
    assert r.status_code == 400
    assert "different repository" in r.json()["detail"]


def test_prompt_preview_returns_search_metadata(client, monkeypatch):
    import app.services.chat_service as cs

    def fake_search(query, repo_id, top_k):
        return {
            "query_embedding_preview": [0.1, 0.2],
            "results": [{
                "chunk_id": "repo/file.py#0",
                "content": "def f(): pass",
                "file_path": "file.py",
                "line_start": 1,
                "line_end": 1,
                "score": 0.9,
                "distance": 0.1,
            }],
            "total_searched": 7,
        }

    monkeypatch.setattr(cs.search_service, "search", fake_search)
    r = client.post(
        "/api/chat/prompt-preview",
        json={"repo_id": "repo", "message": "where is f?", "top_k": 1},
    )

    assert r.status_code == 200
    data = r.json()
    assert data["query_embedding_preview"] == [0.1, 0.2]
    assert data["total_searched"] == 7
    assert data["retrieval_results"][0]["file_path"] == "file.py"
