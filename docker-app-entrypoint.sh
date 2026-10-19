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
# Migrasi berupa file .sql lepas (bukan folder Prisma) tidak dijalankan oleh
# `prisma migrate deploy`. Skrip ini menjalankan yang belum tercatat di tabel
# _loose_sql_migrations dan menampilkan galat apa adanya (tidak disembunyikan).
echo "[APP] Applying loose SQL migrations..."
node prisma/apply-loose-sql.mjs \
  || echo "[APP] PERINGATAN: ada migrasi SQL yang gagal, lihat baris [SQL] GAGAL di atas."

# ── 3. Auto-seed jika database kosong ───────────────────────────────────────
# Seed only when the users table is readable and empty. A failed query must never
# count as "empty": re-seeding an existing database recreates the demo accounts.
USER_COUNT=$(node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('SELECT COUNT(*)::int AS c FROM users')
    .then(r => { console.log(r.rows[0].c); pool.end(); })
    .catch(() => { console.log('unknown'); pool.end(); });
" 2>/dev/null || echo "unknown")

if [ "$USER_COUNT" = "unknown" ]; then
  echo "[APP] PERINGATAN: jumlah user tidak bisa dibaca, seed dilewati. Periksa koneksi database dan migrasi."
elif [ "$USER_COUNT" = "0" ]; then
  echo "[APP] Database kosong, menjalankan seed data awal..."
  npx tsx prisma/seed.ts
  echo "[APP] Seed selesai — login: admin@entaris.demo / Adminentaris123!dsw"
else
  echo "[APP] Database sudah berisi data ($USER_COUNT user), skip seed."
fi

# ── 4. Start server ────────────────────────────────────────────────────────
echo "[APP] Starting Entaris on port ${PORT:-3001}..."
echo "═══════════════════════════════════════════"
exec node dist/index.js
