import os
from app.services.index_service import chunk_text
import pytest
import zipfile


def test_chunk_text_basic():
    content = "line1\nline2\nline3\nline4\nline5\n"
    chunks = chunk_text(content, "test.py", "repo1", chunk_size=20, overlap=5)
    assert len(chunks) >= 1
    for c in chunks:
        assert c["chunk_id"].startswith("repo1/test.py#")
        assert c["file_path"] == "test.py"
        assert c["repo_id"] == "repo1"
        assert c["line_start"] >= 1
        assert c["line_end"] >= c["line_start"]
        assert c["char_count"] > 0


def test_chunk_text_overlap_marker():
    content = "a" * 50 + "\n" + "b" * 50 + "\n" + "c" * 50 + "\n"
    chunks = chunk_text(content, "f.py", "r1", chunk_size=60, overlap=10)
    assert len(chunks) >= 2
    # second chunk should have overlap_start set
    if len(chunks) > 1:
        assert chunks[1]["overlap_start"] is not None


def test_chunk_text_single_chunk():
    content = "short content\n"
    chunks = chunk_text(content, "f.py", "r1", chunk_size=1000, overlap=200)
    assert len(chunks) == 1
    assert chunks[0]["chunk_index"] == 0
    assert chunks[0]["overlap_start"] is None


def test_chunk_text_ids_unique():
    content = "\n".join([f"line {i}" for i in range(100)]) + "\n"
    chunks = chunk_text(content, "f.py", "r1", chunk_size=100, overlap=20)
    ids = [c["chunk_id"] for c in chunks]
    assert len(ids) == len(set(ids))


def test_chunk_text_rejects_invalid_overlap():
    with pytest.raises(ValueError, match="chunk_overlap"):
        chunk_text("abc", "f.py", "r1", chunk_size=100, overlap=100)


def test_scan_files(tmp_path):
    from app.services.repo_service import scan_files
    (tmp_path / "a.py").write_text("x=1")
    (tmp_path / "b.txt").write_text("hello")
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "c.py").write_text("y=2")
    files = scan_files(str(tmp_path))
    assert len(files) == 2
    assert all(f.endswith(".py") for f in files)


def test_scan_files_uses_configured_extensions(tmp_path):
    from app.services.repo_service import scan_files
    (tmp_path / "a.py").write_text("x=1")
    (tmp_path / "b.ts").write_text("export const x = 1")
    (tmp_path / "c.txt").write_text("notes")

    files = scan_files(str(tmp_path), [".py", "ts"])

    assert sorted(os.path.basename(p) for p in files) == ["a.py", "b.ts"]


def test_scan_files_skips_generated_lock_and_symlink_files(tmp_path):
    from app.services.repo_service import scan_files

    repo = tmp_path / "repo"
    repo.mkdir()
    src = repo / "src"
    src.mkdir()
    (src / "app.ts").write_text("export const ok = true")
    (repo / "package-lock.json").write_text("{}")
    dist = repo / "dist"
    dist.mkdir()
    (dist / "bundle.js").write_text("generated")
    (repo / "vendor.min.js").write_text("minified")

    outside = tmp_path / "outside.py"
    outside.write_text("secret = True")
    linked = src / "linked.py"
    try:
        linked.symlink_to(outside)
    except OSError:
        linked = None

    files = scan_files(str(repo), [".py", ".ts", ".js", ".json"])
    rels = sorted(os.path.relpath(path, repo) for path in files)

    assert rels == [os.path.join("src", "app.ts")]
    if linked is not None:
        assert str(linked) not in files


def test_add_repo_rejects_symlink_root_inside_allowed_root(tmp_data_dir, monkeypatch):
    import app.services.repo_service as rs

    allowed = tmp_data_dir / "allowed"
    outside = tmp_data_dir / "outside"
    allowed.mkdir()
    outside.mkdir()
    link = allowed / "linked_repo"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("symlink creation is not available on this platform")

    monkeypatch.setenv("LOCAL_REPO_ROOTS", str(allowed))
    with pytest.raises(ValueError, match="symbolic link"):
        rs.add_repo(str(link))


def test_get_chunk_context(tmp_path, monkeypatch):
    import app.config.defaults as defaults
    import app.services.repo_service as rs
    monkeypatch.setattr(defaults, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(rs, "REPOS_FILE", str(tmp_path / "repos.json"))

    repo_dir = tmp_path / "proj"
    repo_dir.mkdir()
    (repo_dir / "main.py").write_text("def foo():\n    pass\n")

    repo = rs.add_repo(str(repo_dir))
    repo_id = repo["repo_id"]
    rs.update_repo(repo_id, {"status": "indexed"})

    from app.services.index_service import chunk_text, _save_chunks, get_chunk_context
    monkeypatch.setattr(defaults, "DATA_DIR", str(tmp_path))
    chunks = chunk_text("def foo():\n    pass\n", "main.py", repo_id, 1000, 200)
    _save_chunks(repo_id, chunks)

    ctx = get_chunk_context(repo_id, chunks[0]["chunk_id"])
    assert ctx["file_path"] == "main.py"
    assert "def foo" in ctx["file_content"]
    assert ctx["highlight_start"] == chunks[0]["line_start"]
    assert ctx["highlight_end"] == chunks[0]["line_end"]


def test_get_chunk_context_rejects_escaped_chunk_path(tmp_data_dir, monkeypatch):
    import app.services.repo_service as rs

    repo_dir = tmp_data_dir / "proj"
    repo_dir.mkdir()
    secret = tmp_data_dir / "secret.py"
    secret.write_text("token = 'nope'\n")

    repo = rs.add_repo(str(repo_dir))
    repo_id = repo["repo_id"]
    rs.update_repo(repo_id, {"status": "indexed"})

    from app.services.index_service import _save_chunks, get_chunk_context

    chunk = {
        "chunk_id": f"{repo_id}/../secret.py#0",
        "repo_id": repo_id,
        "content": "token = 'nope'\n",
        "file_path": "../secret.py",
        "line_start": 1,
        "line_end": 1,
        "char_count": 15,
        "chunk_index": 0,
        "overlap_start": None,
        "overlap_end": None,
    }
    _save_chunks(repo_id, [chunk])

    with pytest.raises(ValueError, match="escapes"):
        get_chunk_context(repo_id, chunk["chunk_id"])


def test_uploaded_zip_rejects_path_traversal(tmp_path, monkeypatch):
    import app.services.repo_service as rs

    monkeypatch.setattr(rs, "REPOS_FILE", str(tmp_path / "repos.json"))
    monkeypatch.setattr(rs, "UPLOADS_DIR", str(tmp_path / "uploads"))

    zip_path = tmp_path / "bad.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("../evil.py", "print('nope')")

    with pytest.raises(ValueError, match="parent path"):
        rs.add_repo_from_upload(str(zip_path), name="bad")

    assert not (tmp_path / "evil.py").exists()
    assert not zip_path.exists()


@pytest.mark.asyncio
async def test_chat_stream_emits_error_on_retrieval_failure(tmp_data_dir, monkeypatch):
    import app.services.chat_service as cs

    session = cs.create_session("repo1")

    def fail_search(*args, **kwargs):
        raise ValueError("search failed")

    monkeypatch.setattr(cs.search_service, "search", fail_search)
    events = [event async for event in cs.chat_stream("hello", session["session_id"], "repo1")]

    assert events == [{"type": "error", "message": "search failed"}]


def test_build_prompt_trims_context_to_budget(tmp_data_dir, monkeypatch):
    import app.services.chat_service as cs

    def fake_settings():
        return {
            "system_prompt": "sys",
            "top_k": 1,
            "max_prompt_tokens": 80,
        }

    def fake_search(*args, **kwargs):
        return {
            "query_embedding_preview": [0.1],
            "results": [{
                "chunk_id": "repo/file.py#0",
                "content": "x" * 2000,
                "file_path": "file.py",
                "line_start": 1,
                "line_end": 20,
                "score": 0.99,
                "distance": 0.01,
            }],
            "total_searched": 1,
        }

    monkeypatch.setattr(cs, "get_settings", fake_settings)
    monkeypatch.setattr(cs.search_service, "search", fake_search)

    preview = cs.build_prompt("what does this do?", None, "repo", 1)

    assert preview["total_tokens_estimate"] <= 80
    assert "truncated to fit prompt budget" in preview["prompt_parts"]["context"]
    assert preview["retrieval_results"][0]["content"] == "x" * 2000


@pytest.mark.asyncio
async def test_chat_stream_persists_partial_response_when_closed(tmp_data_dir, monkeypatch):
    import app.services.chat_service as cs

    session = cs.create_session("repo1")

    def fake_search(*args, **kwargs):
        return {
            "query_embedding_preview": [0.1],
            "results": [{
                "chunk_id": "repo1/file.py#0",
                "content": "def f(): pass",
                "file_path": "file.py",
                "line_start": 1,
                "line_end": 1,
                "score": 0.99,
                "distance": 0.01,
            }],
            "total_searched": 1,
        }

    async def fake_stream(*args, **kwargs):
        yield "partial"
        yield " response"

    monkeypatch.setattr(cs.search_service, "search", fake_search)
    monkeypatch.setattr(cs.llm_client, "stream_chat", fake_stream)

    stream = cs.chat_stream("hello", session["session_id"], "repo1")
    assert (await stream.__anext__())["type"] == "retrieval"
    assert (await stream.__anext__())["type"] == "prompt"
    chunk = await stream.__anext__()
    assert chunk == {"type": "chunk", "content": "partial"}

    await stream.aclose()

    saved = cs.get_session(session["session_id"])
    assert saved is not None
    assert saved["messages"][0] == {
        "role": "user",
        "content": "hello",
        "status": "interrupted",
    }
    assert saved["messages"][1]["role"] == "assistant"
    assert saved["messages"][1]["content"] == "partial"
    assert saved["messages"][1]["status"] == "interrupted"
    assert saved["messages"][1]["rag_data"]["status"] == "interrupted"
