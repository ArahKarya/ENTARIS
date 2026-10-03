#!/bin/sh
set -e

echo "╔══════════════════════════════════════════╗"
echo "║         Entaris — App Container          ║"
echo "╚══════════════════════════════════════════╝"

cd /app/server

# ── 1. Wait for PostgreSQL ──────────────────────────────────────────────────
echo "[APP] Waiting for database..."
until wget -qO- http://localhost:3001/health 2>/dev/null || node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('SELECT 1').then(() => { pool.end(); process.exit(0); }).catch(() => process.exit(1));
" 2>/dev/null; do
  sleep 2
done
echo "[APP] Database connected."

# ── 2. Run migrations ──────────────────────────────────────────────────────
echo "[APP] Running database migrations..."
npx prisma migrate deploy
echo "[APP] Migrations complete."

# ── 2b. Apply loose SQL migrations ──────────────────────────────────────────
# Sebagian migration di repo ini berupa file .sql lepas (bukan folder Prisma),
# yang TIDAK di-apply oleh `prisma migrate deploy`. File-file ini idempotent
# (IF NOT EXISTS / DO-block), jadi aman dijalankan setiap startup.
echo "[APP] Applying loose SQL migrations..."
# Prisma 7: `db execute` baca datasource dari prisma.config.ts — JANGAN pakai
# --schema (opsi itu invalid di Prisma 7 dan bikin SEMUA file gagal di-skip).
for f in $(ls prisma/migrations/*.sql 2>/dev/null | sort); do
  echo "[APP]  - $(basename "$f")"
  npx prisma db execute --file "$f" 2>/dev/null \
    || echo "[APP]    (skip: $(basename "$f") — sudah ter-apply / non-idempotent)"
done
echo "[APP] Loose SQL migrations done."

# ── 3. Auto-seed jika database kosong ───────────────────────────────────────
USER_COUNT=$(node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('SELECT COUNT(*)::int AS c FROM users')
    .then(r => { console.log(r.rows[0].c); pool.end(); })
    .catch(() => { console.log('0'); pool.end(); });
" 2>/dev/null || echo "0")

if [ "$USER_COUNT" = "0" ]; then
  echo "[APP] Database kosong, menjalankan seed data awal..."
  npx tsx prisma/seed.ts
  echo "[APP] Seed selesai — login: admin@entaris.local / Adminentaris123!dsw"
else
  echo "[APP] Database sudah berisi data ($USER_COUNT user), skip seed."
fi

# ── 4. Start server ────────────────────────────────────────────────────────
echo "[APP] Starting Entaris on port ${PORT:-3001}..."
echo "═══════════════════════════════════════════"
exec node dist/index.js
