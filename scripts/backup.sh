#!/bin/bash
# ============================================================
# backup.sh — Entaris Daily Database Backup
# Dump PostgreSQL → gzip → push to GitHub (backups branch)
# Usage: bash scripts/backup.sh
# ============================================================

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_BRANCH="backups"
MAX_BACKUPS=3
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILENAME="simple_erp_${TIMESTAMP}.sql.gz"
UPLOADS_FILENAME="simple_erp_uploads_${TIMESTAMP}.tar.gz"
WORKTREE_DIR="/tmp/entaris-backup-worktree"
LOG_FILE="${SCRIPT_DIR}/backup.log"

# ─── Functions ────────────────────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cleanup() {
  # Remove temp files
  rm -f "/tmp/${BACKUP_FILENAME}" "/tmp/${UPLOADS_FILENAME}" 2>/dev/null || true
  # Remove git worktree
  if [ -d "$WORKTREE_DIR" ]; then
    git -C "$PROJECT_DIR" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || rm -rf "$WORKTREE_DIR"
  fi
}
trap cleanup EXIT

# ─── Parse DB Credentials ────────────────────────────────────────────────────
# Try root .env first (Docker Compose env_file), then server/.env
DB_USER=""
DB_NAME=""

# Method 1: Root .env with POSTGRES_* vars
if [ -f "${PROJECT_DIR}/.env" ]; then
  DB_USER=$(grep -E '^POSTGRES_USER=' "${PROJECT_DIR}/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || true)
  DB_NAME=$(grep -E '^POSTGRES_DB=' "${PROJECT_DIR}/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || true)
fi

# Method 2: Fallback to server/.env, parse DATABASE_URL
if [ -z "$DB_USER" ] && [ -f "${PROJECT_DIR}/server/.env" ]; then
  DB_URL=$(grep -E '^DATABASE_URL=' "${PROJECT_DIR}/server/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || true)
  if [ -n "$DB_URL" ]; then
    # Parse: postgresql://user:***@host:port/dbname?schema=public
    # NOTE: we only extract the USER and DB NAME here, never the password.
    #       Neither user nor dbname can contain ':' or '/' in practice, so these
    #       sed captures are safe. The password is intentionally NOT parsed —
    #       pg_dump runs via `docker exec` using trust auth, so password chars
    #       (special or not) are irrelevant to this script.
    DB_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
    DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')
  fi
fi

# Defaults
DB_USER="${DB_USER:-user}"
DB_NAME="${DB_NAME:-simple_erp}"

log "=== Backup Started ==="
log "Database: ${DB_NAME}, User: ${DB_USER}"

# ─── Step 1: pg_dump via Docker ───────────────────────────────────────────────
log "Step 1/4: Dumping database..."

# Detect DB container DEFINITIVELY: the postgres container that actually
# contains database $DB_NAME with role $DB_USER. Robust on multi-instance
# hosts where compose project name != dir name != container name, and where
# the image tag is postgres:16-alpine (ancestor=postgres:16 does NOT match).
# Optional override: set BACKUP_DB_CONTAINER in .env to skip auto-detect.
CONTAINER_ID="${BACKUP_DB_CONTAINER:-}"
if [ -z "$CONTAINER_ID" ]; then
  for cid in $(docker ps --filter "ancestor=postgres" --format "{{.ID}}" 2>/dev/null) $(docker ps --format "{{.ID}} {{.Image}}" 2>/dev/null | grep -i postgres | awk "{print \$1}"); do
    if docker exec "$cid" psql -U "$DB_USER" -d "$DB_NAME" -tc "SELECT 1" >/dev/null 2>&1; then
      CONTAINER_ID="$cid"
      break
    fi
  done
fi

if [ -z "$CONTAINER_ID" ]; then
  log "ERROR: No PostgreSQL container found. Is Docker running?"
  exit 1
fi

DUMP_FILE="/tmp/${BACKUP_FILENAME}"
docker exec "$CONTAINER_ID" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges --clean --if-exists \
  | gzip > "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
log "Dump created: ${BACKUP_FILENAME} (${DUMP_SIZE})"

# ─── Step 1b: Archive uploads volume (attachments) ───────────────────────────
log "Step 1b/4: Archiving uploads volume..."

UPLOADS_FILE="/tmp/${UPLOADS_FILENAME}"
# Find the volume name: docker compose prefixes with project dir name
UPLOAD_VOL=$(docker volume ls --format '{{.Name}}' | grep -E '_uploads$' | head -1 || true)
if [ -n "$UPLOAD_VOL" ]; then
  docker run --rm \
    -v "${UPLOAD_VOL}:/src:ro" \
    -v /tmp:/dst \
    alpine:3 \
    sh -c "cd /src && tar -czf /dst/${UPLOADS_FILENAME} . 2>/dev/null || tar -czf /dst/${UPLOADS_FILENAME} --files-from /dev/null"
  if [ -f "$UPLOADS_FILE" ]; then
    UPLOADS_SIZE=$(du -h "$UPLOADS_FILE" | cut -f1)
    log "Uploads archive: ${UPLOADS_FILENAME} (${UPLOADS_SIZE})"
  else
    log "WARN: uploads archive not produced"
  fi
else
  log "WARN: uploads volume not found, skipping attachment backup"
fi

# ─── Step 2: Prepare git worktree ────────────────────────────────────────────
log "Step 2/4: Preparing git worktree..."

# Clean stale worktree if exists
if [ -d "$WORKTREE_DIR" ]; then
  git -C "$PROJECT_DIR" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || rm -rf "$WORKTREE_DIR"
fi
# Drop stale worktree registrations (e.g. an old temp dir wiped by a reboot)
# so the backups branch is not reported as "already checked out".
git -C "$PROJECT_DIR" worktree prune 2>/dev/null || true

# Fetch latest from remote
git -C "$PROJECT_DIR" fetch origin 2>/dev/null || true

# Check if backups branch exists
if git -C "$PROJECT_DIR" show-ref --verify --quiet "refs/remotes/origin/${BACKUP_BRANCH}" 2>/dev/null; then
  # Branch exists on remote — create worktree tracking it
  if git -C "$PROJECT_DIR" show-ref --verify --quiet "refs/heads/${BACKUP_BRANCH}" 2>/dev/null; then
    git -C "$PROJECT_DIR" worktree add "$WORKTREE_DIR" "$BACKUP_BRANCH"
  else
    git -C "$PROJECT_DIR" worktree add "$WORKTREE_DIR" -b "$BACKUP_BRANCH" "origin/${BACKUP_BRANCH}"
  fi
  # Pull latest
  git -C "$WORKTREE_DIR" pull origin "$BACKUP_BRANCH" --rebase 2>/dev/null || true
elif git -C "$PROJECT_DIR" show-ref --verify --quiet "refs/heads/${BACKUP_BRANCH}" 2>/dev/null; then
  # Branch exists locally only
  git -C "$PROJECT_DIR" worktree add "$WORKTREE_DIR" "$BACKUP_BRANCH"
else
  # Branch doesn't exist — create orphan
  log "Creating orphan branch '${BACKUP_BRANCH}'..."
  git -C "$PROJECT_DIR" worktree add --detach "$WORKTREE_DIR"
  git -C "$WORKTREE_DIR" checkout --orphan "$BACKUP_BRANCH"
  git -C "$WORKTREE_DIR" rm -rf . 2>/dev/null || true

  cat > "${WORKTREE_DIR}/README.md" << 'HEREDOC'
# Entaris — Database Backups

Automated daily backups of the PostgreSQL database.
Maximum 3 days retained.

## Restore

```bash
# List available backups
bash scripts/restore.sh

# Restore specific backup
bash scripts/restore.sh simple_erp_2026-03-17_020000.sql.gz
```

## Files

- `simple_erp_YYYY-MM-DD_HHMMSS.sql.gz` — gzipped pg_dump (plain SQL)
HEREDOC

  git -C "$WORKTREE_DIR" add README.md
  git -C "$WORKTREE_DIR" commit -m "Initialize backups branch"
fi

# ─── Step 3: Copy dump + rotate ──────────────────────────────────────────────
log "Step 3/4: Copying dump and rotating old backups..."

cp "$DUMP_FILE" "${WORKTREE_DIR}/${BACKUP_FILENAME}"
if [ -f "$UPLOADS_FILE" ]; then
  cp "$UPLOADS_FILE" "${WORKTREE_DIR}/${UPLOADS_FILENAME}"
fi

# Rotate: keep only MAX_BACKUPS most recent .sql.gz AND .tar.gz files
cd "$WORKTREE_DIR"
for pattern in 'simple_erp_*.sql.gz' 'simple_erp_uploads_*.tar.gz'; do
  COUNT=$(ls -1 $pattern 2>/dev/null | wc -l | tr -d ' ')
  if [ "$COUNT" -gt "$MAX_BACKUPS" ]; then
    ls -1t $pattern | tail -n +$((MAX_BACKUPS + 1)) | while read -r old_file; do
      log "Rotating out: ${old_file}"
      git rm "$old_file" 2>/dev/null || rm -f "$old_file"
    done
  fi
done

# ─── Step 4: Commit + push ───────────────────────────────────────────────────
log "Step 4/4: Committing and pushing..."

git -C "$WORKTREE_DIR" add -A
git -C "$WORKTREE_DIR" commit -m "Backup ${TIMESTAMP} (${DUMP_SIZE})" 2>/dev/null || {
  log "No changes to commit (backup identical to previous)"
  exit 0
}

git -C "$WORKTREE_DIR" push origin "$BACKUP_BRANCH" 2>&1 | tee -a "$LOG_FILE"

log "=== Backup Complete: ${BACKUP_FILENAME} (${DUMP_SIZE}) ==="
