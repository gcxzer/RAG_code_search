#!/bin/bash

# ============================================
#   Code Knowledge Assistant - 一键启动脚本
#   适用于 macOS
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 获取项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "============================================"
echo "  Code Knowledge Assistant v2.0 - 一键启动脚本"
echo "============================================"
echo ""

# 检查 uv
if ! command -v uv &> /dev/null; then
    echo -e "${RED}[错误] 未找到 uv，请先安装 uv: https://docs.astral.sh/uv/${NC}"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[错误] 未找到 Node.js，请先安装 Node.js 18+${NC}"
    exit 1
fi

echo -e "${BLUE}[信息] uv 版本:${NC} $(uv --version)"
echo -e "${BLUE}[信息] Node.js 版本:${NC} $(node --version)"
echo ""

# ========== 步骤 1: Python 环境 ==========
echo -e "${YELLOW}[步骤 1/3] 同步 Python 环境和后端依赖...${NC}"
uv sync --all-groups
echo -e "${GREEN}[成功] Python 环境同步完成${NC}"

# ========== 步骤 2: 前端依赖 ==========
echo ""
echo -e "${YELLOW}[步骤 2/3] 安装前端依赖...${NC}"
cd frontend
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}[信息] 首次安装，运行 npm install...${NC}"
    npm install
else
    echo -e "${BLUE}[信息] node_modules 已存在，跳过安装${NC}"
fi
cd ..
echo -e "${GREEN}[成功] 前端依赖检查完成${NC}"
echo ""

# ========== 步骤 3: 启动服务 ==========
echo -e "${YELLOW}[步骤 3/3] 启动服务...${NC}"
echo ""
echo "  后端 API:  http://localhost:8000"
echo "  前端界面:  http://localhost:5173"
echo "  API 文档:  http://localhost:8000/docs"
echo ""
echo "============================================"
echo "  按 Ctrl+C 停止所有服务"
echo "============================================"
echo ""

# 存储后台进程 PID
BACKEND_PID=""

# 清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}[信息] 正在停止服务...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}[成功] 服务已停止${NC}"
    exit 0
}

# 捕获 Ctrl+C
trap cleanup SIGINT SIGTERM

# 启动后端（后台运行）
echo -e "${BLUE}[信息] 启动后端服务...${NC}"
cd backend
uv run --project .. python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# 等待后端启动
echo -e "${BLUE}[信息] 等待后端启动...${NC}"
sleep 3

# 启动前端（前台运行）
echo -e "${BLUE}[信息] 启动前端服务...${NC}"
cd frontend
npm run dev

# 如果前端退出，清理后端
cleanup
