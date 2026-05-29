import os

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC_DIR = os.path.dirname(BACKEND_DIR)
BASE_DIR = os.path.dirname(SRC_DIR)
DATA_DIR = os.path.join(BASE_DIR, "data")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")

DEFAULT_SYSTEM_PROMPT = """You are a code repository assistant. Answer the user's question using the retrieved code snippets.
Cite concrete file paths and line numbers. Keep the answer concise and accurate."""

DEFAULT_SETTINGS = {
    "llm_api_key": "",
    "llm_base_url": "https://api.openai.com/v1",
    "llm_model": "gpt-4o",
    "embedding_api_key": "",
    "embedding_base_url": "https://api.openai.com/v1",
    "embedding_model": "text-embedding-3-small",
    "chunk_size": 1000,
    "chunk_overlap": 200,
    "top_k": 5,
    "system_prompt": DEFAULT_SYSTEM_PROMPT,
}
