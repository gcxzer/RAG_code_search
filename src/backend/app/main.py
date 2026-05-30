import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import repos, chunks, search, chat, settings

app = FastAPI(title="Code Knowledge Assistant API", version="2.0.0")

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(repos.router, prefix="/api")
app.include_router(chunks.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
