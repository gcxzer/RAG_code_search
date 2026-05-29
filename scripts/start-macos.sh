#!/bin/bash

# ============================================
#   Code Knowledge Assistant - one-command startup
#   For macOS
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "============================================"
echo "  Code Knowledge Assistant v2.0 - Startup"
echo "============================================"
echo ""

# Check uv
if ! command -v uv &> /dev/null; then
    echo -e "${RED}[Error] uv was not found. Install uv first: https://docs.astral.sh/uv/${NC}"
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[Error] Node.js was not found. Install Node.js 18+ first${NC}"
    exit 1
fi

echo -e "${BLUE}[Info] uv version:${NC} $(uv --version)"
echo -e "${BLUE}[Info] Node.js version:${NC} $(node --version)"
echo ""

# ========== Step 1: Python environment ==========
echo -e "${YELLOW}[Step 1/3] Syncing Python environment and backend dependencies...${NC}"
uv sync --all-groups
echo -e "${GREEN}[OK] Python environment synced${NC}"

# ========== Step 2: Frontend dependencies ==========
echo ""
echo -e "${YELLOW}[Step 2/3] Installing frontend dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}[Info] First install detected, running npm install...${NC}"
    npm install
else
    echo -e "${BLUE}[Info] node_modules already exists, skipping install${NC}"
fi
echo -e "${GREEN}[OK] Frontend dependencies are ready${NC}"
echo ""

# ========== Step 3: Start services ==========
echo -e "${YELLOW}[Step 3/3] Starting services...${NC}"
echo ""
echo "  Backend API:  http://localhost:8000"
echo "  Frontend UI:  http://localhost:5173"
echo "  API docs:     http://localhost:8000/docs"
echo ""
echo "============================================"
echo "  Press Ctrl+C to stop all services"
echo "============================================"
echo ""

# Background process PID
BACKEND_PID=""

# Cleanup
cleanup() {
    echo ""
    echo -e "${YELLOW}[Info] Stopping services...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}[OK] Services stopped${NC}"
    exit 0
}

# Catch Ctrl+C
trap cleanup SIGINT SIGTERM

# Start backend in the background
echo -e "${BLUE}[Info] Starting backend service...${NC}"
uv run --project . --directory src/backend python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait for backend startup
echo -e "${BLUE}[Info] Waiting for backend startup...${NC}"
sleep 3

# Start frontend in the foreground
echo -e "${BLUE}[Info] Starting frontend service...${NC}"
npm run dev

# If the frontend exits, stop the backend
cleanup
