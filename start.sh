#!/usr/bin/env bash
#
# KSV Jabbeke — Clubplatform: start the full stack (database + backend + frontend).
#
#   ./start.sh
#
# Press Ctrl+C to stop the backend and frontend again. The Postgres container is
# left running (data persists); stop it with:  (cd backend && docker compose down)
#
# Override the backend port with:  BACKEND_PORT=8000 ./start.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
BACKEND_HOST="127.0.0.1"
FRONTEND_PORT="5173"

say() { printf "\033[0;32m▸ %s\033[0m\n" "$*"; }
warn() { printf "\033[0;33m! %s\033[0m\n" "$*"; }

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# Pick a free backend port. 8000 is the default, but Docker Desktop sometimes
# holds it on macOS — fall back to 8080, then 8001.
choose_backend_port() {
  for p in "${BACKEND_PORT:-}" 8000 8080 8001; do
    [ -z "$p" ] && continue
    port_busy "$p" || { echo "$p"; return; }
  done
  echo 8080
}

# ---------------------------------------------------------------------------
# 1. Database (Docker Postgres)
# ---------------------------------------------------------------------------
if ! docker info >/dev/null 2>&1; then
  warn "Docker isn't running — trying to start Docker Desktop..."
  open -a Docker >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 2; done
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not available. Start Docker Desktop and re-run ./start.sh" >&2
  exit 1
fi

say "Starting database (Postgres)..."
( cd "$BACKEND_DIR" && docker compose up -d )
for _ in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' football_db 2>/dev/null || echo '')"
  [ "$status" = "healthy" ] && break
  sleep 1
done
say "Database is healthy."

# ---------------------------------------------------------------------------
# 2. Backend (FastAPI) — set up venv / env on first run
# ---------------------------------------------------------------------------
if [ ! -d "$BACKEND_DIR/.venv" ]; then
  say "Creating Python virtualenv and installing dependencies (first run)..."
  python3 -m venv "$BACKEND_DIR/.venv"
  "$BACKEND_DIR/.venv/bin/pip" install --quiet --upgrade pip
  "$BACKEND_DIR/.venv/bin/pip" install --quiet -r "$BACKEND_DIR/requirements.txt"
fi
[ -f "$BACKEND_DIR/.env" ] || cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"

BACKEND_PORT="$(choose_backend_port)"
[ "$BACKEND_PORT" != "8000" ] && warn "Port 8000 busy — using backend port $BACKEND_PORT."

# ---------------------------------------------------------------------------
# 3. Frontend (Vite) — install deps / env on first run
# ---------------------------------------------------------------------------
[ -f "$FRONTEND_DIR/.env" ] || cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env"
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  say "Installing frontend dependencies (first run)..."
  ( cd "$FRONTEND_DIR" && npm install )
fi

# ---------------------------------------------------------------------------
# 4. Launch backend + frontend; Ctrl+C stops both
# ---------------------------------------------------------------------------
PIDS=()
cleanup() {
  echo ""
  say "Stopping backend and frontend..."
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

say "Starting backend on http://localhost:$BACKEND_PORT ..."
( cd "$BACKEND_DIR" && exec .venv/bin/uvicorn app.main:app \
    --host "$BACKEND_HOST" --port "$BACKEND_PORT" ) &
PIDS+=($!)

say "Starting frontend on http://localhost:$FRONTEND_PORT ..."
( cd "$FRONTEND_DIR" && VITE_API_TARGET="http://localhost:$BACKEND_PORT" \
    exec node_modules/.bin/vite --port "$FRONTEND_PORT" ) &
PIDS+=($!)

sleep 2
echo ""
say "KSV Jabbeke Clubplatform is running:"
echo "    Frontend : http://localhost:$FRONTEND_PORT"
echo "    Backend  : http://localhost:$BACKEND_PORT  (API docs: /docs)"
echo "    Login    : admin@ksvjabbeke.be / ChangeMe123!  (or koen@ / wout@)"
echo ""
echo "  (First time on an empty database? seed demo data with:"
echo "     cd backend && .venv/bin/python -m app.seed --demo )"
echo ""
say "Press Ctrl+C to stop."
wait
