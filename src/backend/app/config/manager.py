import os
from app.config.defaults import DEFAULT_SETTINGS, LEGACY_SYSTEM_PROMPTS
from app.config.defaults import SETTINGS_FILE as _DEFAULT_SETTINGS_FILE
from app.config.defaults import DATA_DIR as _DEFAULT_DATA_DIR
from app.services.json_store import load_json, save_json, update_json

# module-level vars so tests can monkeypatch them
SETTINGS_FILE = _DEFAULT_SETTINGS_FILE
DATA_DIR = _DEFAULT_DATA_DIR


import sys as _sys
import app.config.manager as _self


def _normalize_prompt(prompt: str) -> str:
    return " ".join(prompt.split())


_NORMALIZED_LEGACY_PROMPTS = {
    _normalize_prompt(prompt)
    for prompt in LEGACY_SYSTEM_PROMPTS
}


def _ensure_data_dir():
    os.makedirs(_self.DATA_DIR, exist_ok=True)


def get_settings() -> dict:
    _ensure_data_dir()
    stored = load_json(_self.SETTINGS_FILE, {})
    result = dict(DEFAULT_SETTINGS)
    result.update(stored)
    prompt = stored.get("system_prompt")
    if isinstance(prompt, str) and _normalize_prompt(prompt) in _NORMALIZED_LEGACY_PROMPTS:
        result["system_prompt"] = DEFAULT_SETTINGS["system_prompt"]
    return result


def save_settings(settings: dict) -> None:
    _ensure_data_dir()
    save_json(_self.SETTINGS_FILE, settings)


def update_settings(partial: dict) -> dict:
    def update(current: dict) -> dict:
        result = dict(DEFAULT_SETTINGS)
        result.update(current)
        result.update(partial)
        current.clear()
        current.update(result)
        return dict(result)

    return update_json(_self.SETTINGS_FILE, {}, update)
