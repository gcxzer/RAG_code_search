# Code Knowledge Assistant

A repository knowledge Q&A system. Add a local repository or upload a ZIP archive, index code into chunks, and ask questions with semantic retrieval.

## Core Features

- **Repository management** - Add a local path or upload a ZIP archive, then index Python files.
- **Code chunking** - Split files by character count with overlap and line-boundary alignment.
- **Vector search** - Store embeddings in ChromaDB and search by cosine similarity.
- **RAG chat** - Retrieve relevant code snippets before streaming LLM answers with file paths and line numbers.
- **Chunk inspection** - View the exact source location for every indexed chunk.
- **Retrieval trace** - Persist RAG retrieval data for each chat turn and inspect it later.

## Tech Stack

| Layer | Technology |
|---|------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | FastAPI + Python |
| Vector store | ChromaDB (cosine) |
| LLM | OpenAI-compatible API (configurable) |
| Embedding | text-embedding-3-small (configurable) |

## Project Structure

```
code-knowledge-assistant/
├── pyproject.toml           # Python project and dependency configuration
├── uv.lock                  # uv lock file
├── package.json             # Frontend dependencies and scripts
├── package-lock.json        # npm lock file
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript project references
├── tsconfig.app.json        # Frontend TypeScript configuration
├── tsconfig.node.json       # Vite/Node TypeScript configuration
├── tailwind.config.js       # Tailwind configuration
├── postcss.config.js        # PostCSS configuration
├── index.html               # Frontend HTML entry
├── public/                  # Static assets
├── .python-version          # Python version used by uv
├── data/                    # Runtime data storage (JSON + ChromaDB)
├── src/
│   ├── backend/             # Backend (FastAPI)
│   │   ├── app/
│   │   │   ├── api/         # API endpoints (repos, chunks, search, chat, settings)
│   │   │   ├── services/    # Business logic (indexing, retrieval, chat, LLM client)
│   │   │   ├── config/      # Configuration management
│   │   │   └── main.py      # FastAPI entry point
│   └── frontend/            # Frontend source (React + Vite)
│       ├── pages/           # Pages (Chat, Repos, Chunks, Search, Settings)
│       ├── components/      # Components (MarkdownMessage, RagPanel)
│       ├── services/        # API client
│       ├── types/           # TypeScript types
│       ├── lib/             # Frontend utilities
│       ├── App.tsx
│       ├── index.css
│       └── main.tsx
├── tests/
│   └── backend/             # Backend tests
├── scripts/                 # Startup scripts
│   └── start-macos.sh
└── README.md
```

## Quick Start

### Requirements

- uv for Python 3.12+ environment and dependency management
- Node.js 18+

### One-command Start

#### macOS

```bash
# Add execute permission on first run
chmod +x scripts/start-macos.sh

# Start services
./scripts/start-macos.sh
```

After startup, open:

- **Frontend UI**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API docs**: http://localhost:8000/docs

On first startup, configure the LLM and embedding API keys on the Settings page.

### Manual Startup

For development and debugging, you can start the backend and frontend separately.

#### Backend

```bash
uv sync --all-groups
uv run --project . --directory src/backend python -m uvicorn app.main:app --reload --port 8000
```

#### Frontend

```bash
npm install
npm run dev
```

## Workflow

1. **Configure models** - Add API keys, base URLs, and model names on the Settings page.
2. **Add a repository** - Enter a local path or upload a ZIP archive on the Repositories page.
3. **Index code** - Start indexing and wait for chunking and embedding to finish.
4. **Start chatting** - Create a chat session and ask questions about the repository.
5. **Inspect retrieval** - Open the retrieval trace below an assistant message to review RAG details.

## API Endpoints

| Method | Path | Description |
|------|------|------|
| GET | `/api/health` | Health check |
| POST | `/api/repos` | Add a local repository |
| POST | `/api/repos/upload` | Upload a ZIP repository |
| GET | `/api/repos` | List repositories |
| DELETE | `/api/repos/{repo_id}` | Delete a repository |
| POST | `/api/repos/{repo_id}/index` | Trigger indexing |
| GET | `/api/repos/{repo_id}/index/status` | Get indexing status |
| GET | `/api/repos/{repo_id}/chunks` | List indexed chunks |
| GET | `/api/repos/{repo_id}/chunks/{chunk_id}/context` | Get source context for a chunk |
| GET | `/api/repos/{repo_id}/stats` | Get repository index statistics |
| POST | `/api/search` | Run vector search |
| POST | `/api/chat/prompt-preview` | Preview assembled prompt parts |
| POST | `/api/chat` | Stream chat responses (SSE) |
| GET | `/api/chat/sessions` | List chat sessions |
| POST | `/api/chat/sessions` | Create a chat session |
| GET | `/api/chat/sessions/{session_id}` | Get a chat session |
| DELETE | `/api/chat/sessions/{session_id}` | Delete a chat session |
| GET/PUT | `/api/settings` | Read or update settings |

## License

MIT
