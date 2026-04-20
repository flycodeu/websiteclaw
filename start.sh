#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

step() {
  printf '==> %s\n' "$1"
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

need_cmd() {
  local command_name="$1"
  local hint="$2"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "$hint"
  fi
}

remove_workspace_venv() {
  if [[ ! -e ".venv" ]]; then
    return
  fi

  local resolved_path
  resolved_path="$(cd .venv && pwd -P)"
  case "$resolved_path" in
    "$ROOT_DIR"/*) ;;
    *) fail "Refusing to remove virtual environment outside the workspace: $resolved_path" ;;
  esac

  rm -rf .venv
}

test_invalid_linux_venv() {
  if [[ ! -d ".venv" ]]; then
    return 1
  fi

  if [[ ! -x ".venv/bin/python" ]]; then
    return 0
  fi

  if [[ -f ".venv/pyvenv.cfg" ]] && grep -qiE '^[[:space:]]*(home|executable|command)[[:space:]]*=[[:space:]]*[A-Za-z]:\\' ".venv/pyvenv.cfg"; then
    return 0
  fi

  return 1
}

ensure_env_file() {
  if [[ -f ".env" ]]; then
    return
  fi

  if [[ ! -f ".env.example" ]]; then
    fail ".env is missing and .env.example was not found."
  fi

  step "Creating .env from .env.example"
  cp ".env.example" ".env"
}

create_linux_venv() {
  if command -v python3 >/dev/null 2>&1; then
    step "Creating Linux/WSL virtual environment"
    python3 -m venv .venv
    return
  fi

  if command -v python >/dev/null 2>&1; then
    step "Creating Linux/WSL virtual environment"
    python -m venv .venv
    return
  fi

  fail "Python 3 was not found. Install python3, then run ./start.sh again."
}

ensure_venv() {
  if test_invalid_linux_venv; then
    step "Removing incompatible virtual environment"
    remove_workspace_venv
  fi

  if [[ ! -x ".venv/bin/python" ]]; then
    create_linux_venv
  fi

  if [[ ! -x ".venv/bin/python" ]]; then
    fail "Failed to create .venv. Install Python 3 and try again."
  fi
}

ensure_python_dependencies() {
  local python_bin="$1"
  if "$python_bin" -c "import fastapi, uvicorn, playwright" >/dev/null 2>&1; then
    return
  fi

  step "Installing backend dependencies"
  "$python_bin" -m pip install -r backend/requirements.txt
}

get_playwright_chromium_install_path() {
  local python_bin="$1"
  local dry_run_output
  dry_run_output="$("$python_bin" -m playwright install --dry-run chromium 2>/dev/null || true)"
  printf '%s\n' "$dry_run_output" | sed -n 's/^[[:space:]]*Install location:[[:space:]]*//p' | head -n 1
}

ensure_playwright_chromium() {
  local python_bin="$1"
  local install_path
  install_path="$(get_playwright_chromium_install_path "$python_bin")"
  if [[ -n "$install_path" && -d "$install_path" ]]; then
    return
  fi

  step "Installing Playwright Chromium"
  "$python_bin" -m playwright install chromium
}

ensure_frontend_assets() {
  local needs_install=0
  local needs_build=0

  if [[ ! -d "frontend/node_modules" ]]; then
    needs_install=1
  fi

  if [[ ! -f "frontend/dist/index.html" ]]; then
    needs_build=1
  fi

  if [[ "$needs_install" -eq 0 && "$needs_build" -eq 0 ]]; then
    return
  fi

  need_cmd npm "npm was not found. Install Node.js and npm, then run ./start.sh again."

  pushd frontend >/dev/null
  if [[ "$needs_install" -eq 1 ]]; then
    step "Installing frontend dependencies"
    npm install
  fi

  if [[ "$needs_build" -eq 1 ]]; then
    step "Building frontend"
    npm run build
  fi
  popd >/dev/null
}

assert_backend_port_available() {
  local python_bin="$1"
  "$python_bin" -c '
import socket
import sys
from backend.app.core.config import settings

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind((settings.backend_host, settings.backend_port))
except OSError as exc:
    sys.stderr.write(
        f"Port {settings.backend_port} on {settings.backend_host} is unavailable: {exc}\n"
        "Set BACKEND_PORT in .env to a free port and try again.\n"
    )
    sys.exit(1)
finally:
    sock.close()
'
}

get_backend_port() {
  local python_bin="$1"
  "$python_bin" -c 'from backend.app.core.config import settings; print(settings.backend_port)'
}

find_listener_pids() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u
    return 0
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u
    return 0
  fi

  return 1
}

is_websiteclaw_pid() {
  local pid="$1"
  local python_bin="$2"

  [[ -d "/proc/$pid" ]] || return 1

  local cmdline=""
  local cwd=""
  local exe=""
  local python_resolved=""

  cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  exe="$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)"
  python_resolved="$(readlink -f "$python_bin" 2>/dev/null || true)"

  [[ "$cmdline" == *"backend.app"* || "$cmdline" == *"backend.app.main:app"* ]] || return 1

  if [[ "$cwd" == "$ROOT_DIR" || "$cwd" == "$ROOT_DIR"/* ]]; then
    return 0
  fi

  if [[ -n "$exe" && "$exe" == "$ROOT_DIR"/* ]]; then
    return 0
  fi

  if [[ -n "$python_resolved" && -n "$exe" && "$exe" == "$python_resolved" ]]; then
    return 0
  fi

  return 1
}

ensure_backend_port_available() {
  local python_bin="$1"
  local port
  port="$(get_backend_port "$python_bin")"

  local pids=""
  if ! pids="$(find_listener_pids "$port" 2>/dev/null)"; then
    assert_backend_port_available "$python_bin"
    return
  fi

  if [[ -z "$pids" ]]; then
    return
  fi

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    if ! is_websiteclaw_pid "$pid" "$python_bin"; then
      fail "Port ${port} is used by another program (PID ${pid}). Stop it or set BACKEND_PORT in .env to a free port and try again."
    fi
  done <<< "$pids"

  step "Stopping existing WebsiteClaw instance on port ${port}"
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill "$pid" 2>/dev/null || true
  done <<< "$pids"

  local attempt=0
  while [[ "$attempt" -lt 20 ]]; do
    sleep 0.25
    if [[ -z "$(find_listener_pids "$port" || true)" ]]; then
      return
    fi
    attempt=$((attempt + 1))
  done

  fail "Failed to stop the existing WebsiteClaw instance on port ${port}. Close it manually and try again."
}

step "Preparing WebsiteClaw for startup"
ensure_env_file
ensure_venv
PYTHON_BIN=".venv/bin/python"
ensure_python_dependencies "$PYTHON_BIN"
ensure_playwright_chromium "$PYTHON_BIN"
ensure_frontend_assets
ensure_backend_port_available "$PYTHON_BIN"

BACKEND_PORT_VALUE="$(get_backend_port "$PYTHON_BIN")"
step "Starting WebsiteClaw on http://localhost:${BACKEND_PORT_VALUE}"
exec "$PYTHON_BIN" -m backend.app
