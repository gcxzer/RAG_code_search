import json
import os
import tempfile
import threading
from typing import Any, Callable, TypeVar

_GLOBAL_LOCK = threading.RLock()
_LOCKS: dict[str, threading.RLock] = {}
T = TypeVar("T")


def _lock_for(path: str) -> threading.RLock:
    resolved = os.path.abspath(path)
    with _GLOBAL_LOCK:
        if resolved not in _LOCKS:
            _LOCKS[resolved] = threading.RLock()
        return _LOCKS[resolved]


def load_json(path: str, default: Any) -> Any:
    lock = _lock_for(path)
    with lock:
        return _load_json_unlocked(path, default)


def save_json(path: str, data: Any) -> None:
    lock = _lock_for(path)
    with lock:
        _save_json_unlocked(path, data)


def update_json(path: str, default: Any, mutator: Callable[[Any], T]) -> T:
    """Run a read-modify-write cycle under one per-file lock."""
    lock = _lock_for(path)
    with lock:
        data = _load_json_unlocked(path, default)
        result = mutator(data)
        _save_json_unlocked(path, data)
        return result


def _load_json_unlocked(path: str, default: Any) -> Any:
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_json_unlocked(path: str, data: Any) -> None:
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        dir=directory,
        prefix=f".{os.path.basename(path)}.",
        suffix=".tmp",
        text=True,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise
