#!/bin/bash
# ============================================================
# setup-backup.sh — Entaris Backup System Setup
# One-time setup: verify prerequisites, run initial backup,
# install daily cron job.
# Usage: bash scripts/setup-backup.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_BRANCH="backups"

echo "╔══════════════════════════════════════════════════╗"
echo "║       Entaris — Backup System Setup             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Check prerequisites ─────────────────────────────────────────────
echo "🔍 Checking prerequisites..."

ERRORS=0

# Docker
if command -v docker &>/dev/null; then
  echo "  ✅ Docker installed"
else
  echo "  ❌ Docker NOT installed"
  ERRORS=$((ERRORS + 1))
fi

# Git
if command -v git &>/dev/null; then
  echo "  ✅ Git installed"
else
  echo "  ❌ Git NOT installed"
  ERRORS=$((ERRORS + 1))
fi

# PostgreSQL container
PG_CONTAINER=$(docker ps -qf "ancestor=postgres:16" 2>/dev/null || true)
[ -z "$PG_CONTAINER" ] && PG_CONTAINER=$(docker ps -qf "name=postgres" 2>/dev/null | head -1 || true)
[ -z "$PG_CONTAINER" ] && PG_CONTAINER=$(docker ps -qf "name=db" 2>/dev/null | head -1 || true)

if [ -n "$PG_CONTAINER" ]; then
  echo "  ✅ PostgreSQL container running (${PG_CONTAINER:0:12})"
else
  echo "  ❌ PostgreSQL container NOT running"
  echo "     Run: docker compose up -d"
  ERRORS=$((ERRORS + 1))
fi

# GitHub access
if git -C "$PROJECT_DIR" ls-remote origin &>/dev/null; then
  REMOTE_URL=$(git -C "$PROJECT_DIR" remote get-url origin 2>/dev/null)
  echo "  ✅ GitHub access OK (${REMOTE_URL})"
else
  echo "  ❌ Cannot reach GitHub remote"
  echo "     Ensure SSH key or HTTPS token is configured"
  ERRORS=$((ERRORS + 1))
fi

# gzip
if command -v gzip &>/dev/null; then
  echo "  ✅ gzip installed"
else
  echo "  ❌ gzip NOT installed"
  ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "❌ ${ERRORS} prerequisite(s) failed. Fix them and try again."
  exit 1
fi

echo ""
echo "All prerequisites OK!"

# ─── Step 2: Run initial backup ──────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Running initial backup..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

bash "${SCRIPT_DIR}/backup.sh"

# ─── Step 3: Install cron job ─────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⏰ Setting up daily cron job..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CRON_CMD="0 2 * * * cd ${PROJECT_DIR} && bash scripts/backup.sh >> scripts/backup.log 2>&1"
CRON_MARKER="# Simple ERP daily backup"

if crontab -l 2>/dev/null | grep -q "Simple ERP daily backup"; then
  echo "  ✅ Cron job already exists. Updating..."
  # Remove old entry and add new one
  (crontab -l 2>/dev/null | grep -v "Simple ERP daily backup" | grep -v "scripts/backup.sh"; echo ""; echo "$CRON_MARKER"; echo "$CRON_CMD") | crontab -
else
  # Add new cron entry
  (crontab -l 2>/dev/null; echo ""; echo "$CRON_MARKER"; echo "$CRON_CMD") | crontab -
fi

echo "  ✅ Cron job installed: daily at 02:00 AM"

# ─── Step 4: Verify ──────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Verifying setup..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check backups branch exists
git -C "$PROJECT_DIR" fetch origin 2>/dev/null
if git -C "$PROJECT_DIR" show-ref --verify --quiet "refs/remotes/origin/${BACKUP_BRANCH}" 2>/dev/null; then
  BACKUP_COUNT=$(git -C "$PROJECT_DIR" ls-tree --name-only "origin/${BACKUP_BRANCH}" -- '*.sql.gz' 2>/dev/null | wc -l | tr -d ' ')
  echo "  ✅ Branch '${BACKUP_BRANCH}' exists on GitHub (${BACKUP_COUNT} backup(s))"
else
  echo "  ⚠️  Branch '${BACKUP_BRANCH}' not found on remote (push may have failed)"
fi

# Check cron
if crontab -l 2>/dev/null | grep -q "scripts/backup.sh"; then
  echo "  ✅ Cron job active"
else
  echo "  ⚠️  Cron job not found"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║          ✅ Setup Complete!                       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  📅 Schedule:   Daily at 02:00 AM"
echo "  🔄 Retention:  3 days maximum"
echo "  🌿 Branch:     ${BACKUP_BRANCH}"
echo "  📝 Logs:       ${SCRIPT_DIR}/backup.log"
echo ""
echo "  Commands:"
echo "  ─────────────────────────────────────────────────"
echo "  Manual backup:    bash scripts/backup.sh"
echo "  List backups:     bash scripts/restore.sh"
echo "  Restore backup:   bash scripts/restore.sh <filename>"
echo "  View cron:        crontab -l"
echo "  View logs:        tail -20 scripts/backup.log"
echo ""
