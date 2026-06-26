#!/bin/bash
# ============================================================
# restore.sh — Simple ERP Database Restore
# Restore from GitHub backups branch or local file
# Usage:
#   bash scripts/restore.sh                     # List available backups
#   bash scripts/restore.sh <filename.sql.gz>   # Restore from GitHub
#   bash scripts/restore.sh /path/to/file.sql.gz # Restore from local
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_BRANCH="backups"
WORKTREE_DIR="/tmp/simple-erp-restore-worktree"

# ─── Functions ────────────────────────────────────────────────────────────────
cleanup() {
  if [ -d "$WORKTREE_DIR" ]; then
    git -C "$PROJECT_DIR" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || rm -rf "$WORKTREE_DIR"
  fi
}
trap cleanup EXIT

# ─── Parse DB Credentials ────────────────────────────────────────────────────
DB_USER=""
DB_NAME=""

if [ -f "${PROJECT_DIR}/.env" ]; then
  DB_USER=$(grep -E '^POSTGRES_USER=' "${PROJECT_DIR}/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || true)
  DB_NAME=$(grep -E '^POSTGRES_DB=' "${PROJECT_DIR}/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || true)
fi

if [ -z "$DB_USER" ] && [ -f "${PROJECT_DIR}/server/.env" ]; then
  DB_URL=$(grep -E '^DATABASE_URL=' "${PROJECT_DIR}/server/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || true)
  if [ -n "$DB_URL" ]; then
    DB_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
    DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')
  fi
fi

DB_USER="${DB_USER:-user}"
DB_NAME="${DB_NAME:-simple_erp}"

# ─── Security: validate identifiers before interpolating into SQL ──────────────
# DB_NAME / DB_USER are injected directly into DROP/CREATE DATABASE statements,
# so reject anything that is not a safe SQL identifier (letters, digits, underscore).
if ! [[ "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "❌ DB_NAME tidak valid (hanya huruf, angka, underscore): '$DB_NAME'" >&2
  exit 1
fi
if ! [[ "$DB_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "❌ DB_USER tidak valid (hanya huruf, angka, underscore): '$DB_USER'" >&2
  exit 1
fi

# ─── Find PostgreSQL container ────────────────────────────────────────────────
find_pg_container() {
  # Definitive: the postgres container that actually holds DB_NAME with DB_USER.
  # Robust on multi-instance hosts + postgres:16-alpine tag.
  # Optional override: BACKUP_DB_CONTAINER in .env.
  local cid="${BACKUP_DB_CONTAINER:-}"
  if [ -z "$cid" ]; then
    for c in $(docker ps --filter "ancestor=postgres" --format "{{.ID}}" 2>/dev/null) $(docker ps --format "{{.ID}} {{.Image}}" 2>/dev/null | grep -i postgres | awk "{print \$1}"); do
      if docker exec "$c" psql -U "$DB_USER" -d "$DB_NAME" -tc "SELECT 1" >/dev/null 2>&1; then
        cid="$c"; break
      fi
    done
  fi
  echo "$cid"
}

# ─── Mode: List backups ──────────────────────────────────────────────────────
if [ $# -eq 0 ]; then
  echo "╔══════════════════════════════════════════════════╗"
  echo "║     Simple ERP — Available Database Backups     ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo ""

  git -C "$PROJECT_DIR" fetch origin 2>/dev/null

  if ! git -C "$PROJECT_DIR" show-ref --verify --quiet "refs/remotes/origin/${BACKUP_BRANCH}" 2>/dev/null; then
    echo "❌ No '${BACKUP_BRANCH}' branch found on remote."
    echo "   Run 'bash scripts/backup.sh' first to create the initial backup."
    exit 1
  fi

  echo "Backups (newest first):"
  echo "─────────────────────────────────────────────────"
  git -C "$PROJECT_DIR" ls-tree --name-only "origin/${BACKUP_BRANCH}" | grep '\.sql\.gz$' | sort -r | while read -r f; do
    echo "  📦 $f"
  done
  echo ""
  echo "To restore:  bash scripts/restore.sh <filename>"
  echo "Example:     bash scripts/restore.sh simple_erp_2026-03-17_020000.sql.gz"
  exit 0
fi

# ─── Mode: Restore ────────────────────────────────────────────────────────────
BACKUP_ARG="$1"
RESTORE_FILE=""

if [ -f "$BACKUP_ARG" ]; then
  # Local file path provided
  RESTORE_FILE="$BACKUP_ARG"
  echo "📂 Restoring from local file: ${RESTORE_FILE}"
else
  # Fetch from backups branch
  echo "📥 Fetching backup from GitHub..."
  git -C "$PROJECT_DIR" fetch origin "$BACKUP_BRANCH" 2>/dev/null || {
    echo "❌ Cannot fetch '${BACKUP_BRANCH}' branch from remote."
    exit 1
  }

  # Create worktree to access the file
  if [ -d "$WORKTREE_DIR" ]; then
    git -C "$PROJECT_DIR" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || rm -rf "$WORKTREE_DIR"
  fi

  git -C "$PROJECT_DIR" worktree add --detach "$WORKTREE_DIR" "origin/${BACKUP_BRANCH}" 2>/dev/null

  RESTORE_FILE="${WORKTREE_DIR}/${BACKUP_ARG}"
  if [ ! -f "$RESTORE_FILE" ]; then
    echo "❌ Backup file '${BACKUP_ARG}' not found on backups branch."
    echo ""
    echo "Available backups:"
    ls -1 "${WORKTREE_DIR}"/simple_erp_*.sql.gz 2>/dev/null | xargs -I{} basename {} || echo "  (none)"
    exit 1
  fi
  echo "✅ Found backup: ${BACKUP_ARG}"
fi

FILE_SIZE=$(du -h "$RESTORE_FILE" | cut -f1)
echo ""
echo "┌─────────────────────────────────────────────────┐"
echo "│  ⚠️  WARNING: DESTRUCTIVE OPERATION              │"
echo "│                                                   │"
echo "│  This will DROP and recreate database '${DB_NAME}'  "
echo "│  All current data will be PERMANENTLY LOST.       │"
echo "│                                                   │"
echo "│  Backup file: ${BACKUP_ARG}"
echo "│  File size:   ${FILE_SIZE}"
echo "└─────────────────────────────────────────────────┘"
echo ""
read -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "❌ Aborted."
  exit 0
fi

# ─── Stop application ────────────────────────────────────────────────────────
echo ""
echo "🔄 Stopping application..."
if command -v pm2 &>/dev/null; then
  pm2 stop simple-erp 2>/dev/null || true
fi

# ─── Find container ──────────────────────────────────────────────────────────
CONTAINER_ID=$(find_pg_container)
if [ -z "$CONTAINER_ID" ]; then
  echo "❌ No PostgreSQL container found. Is Docker running?"
  echo "   Run: docker compose up -d"
  exit 1
fi

# ─── Drop + Recreate DB ──────────────────────────────────────────────────────
echo "🗑️  Dropping and recreating database..."
docker exec "$CONTAINER_ID" psql -U "$DB_USER" -d postgres -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity
  WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
" > /dev/null 2>&1 || true

docker exec "$CONTAINER_ID" psql -U "$DB_USER" -d postgres -c "
  DROP DATABASE IF EXISTS ${DB_NAME};
  CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
" > /dev/null

# ─── Restore dump ─────────────────────────────────────────────────────────────
echo "📦 Restoring database from backup..."
gunzip -c "$RESTORE_FILE" | docker exec -i "$CONTAINER_ID" \
  psql -U "$DB_USER" -d "$DB_NAME" --quiet 2>/dev/null

echo "✅ Database restored successfully."

# ─── Restore uploads (attachments) ───────────────────────────────────────────
# Find the matching uploads archive: simple_erp_uploads_<TIMESTAMP>.tar.gz
# derived from the DB filename simple_erp_<TIMESTAMP>.sql.gz, and extract it
# into the app uploads Docker volume. Without this, restored DB rows point to
# attachment files that do not exist.
echo ""
echo "📎 Restoring uploads (attachments)..."
UPLOADS_BASENAME=$(basename "$RESTORE_FILE" | sed -E 's/^simple_erp_(.*)\.sql\.gz$/simple_erp_uploads_\1.tar.gz/')
UPLOADS_ARCHIVE="$(dirname "$RESTORE_FILE")/${UPLOADS_BASENAME}"
if [ -f "$UPLOADS_ARCHIVE" ]; then
  UPLOAD_VOL=$(docker volume ls --format '{{.Name}}' | grep -E '_uploads$' | head -1 || true)
  if [ -n "$UPLOAD_VOL" ]; then
    echo "   Volume: ${UPLOAD_VOL}"
    docker run --rm \
      -v "${UPLOAD_VOL}:/dst" \
      -v "$(dirname "$UPLOADS_ARCHIVE"):/src:ro" \
      alpine:3 \
      sh -c "cd /dst && tar -xzf /src/${UPLOADS_BASENAME}"
    RESTORED_COUNT=$(docker run --rm -v "${UPLOAD_VOL}:/dst" alpine:3 sh -c "find /dst -type f | wc -l")
    echo "   ✅ Uploads restored. Files now in volume: ${RESTORED_COUNT}"
  else
    echo "   ⚠️  uploads volume not found — skipped (attachments NOT restored)."
  fi
else
  echo "   ⚠️  No uploads archive found (${UPLOADS_BASENAME}) — DB-only restore."
fi

# ─── Prisma migrations ────────────────────────────────────────────────────────
echo ""
echo "🔧 Running Prisma migrations (ensure schema is up-to-date)..."
cd "${PROJECT_DIR}/server"
npx prisma migrate deploy 2>/dev/null || echo "⚠️  Prisma migrate skipped (may need npm install first)"

# ─── Restart application ──────────────────────────────────────────────────────
echo ""
echo "🚀 Restarting application..."
if command -v pm2 &>/dev/null; then
  pm2 restart simple-erp 2>/dev/null || pm2 start dist/index.js --name simple-erp 2>/dev/null || true
  echo "✅ Application restarted via PM2"
else
  echo "⚠️  No PM2 found. Start manually: cd server && node dist/index.js"
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║          ✅ Restore Complete!                     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Verify: curl http://localhost:3001/health"
