#!/bin/sh
set -e

echo "╔══════════════════════════════════════════╗"
echo "║      Keuangan ERP — App Container       ║"
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

# ── 3. Auto-seed jika database kosong ───────────────────────────────────────
USER_COUNT=$(node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('SELECT COUNT(*)::int AS c FROM \"User\"')
    .then(r => { console.log(r.rows[0].c); pool.end(); })
    .catch(() => { console.log('0'); pool.end(); });
" 2>/dev/null || echo "0")

if [ "$USER_COUNT" = "0" ]; then
  echo "[APP] Database kosong, menjalankan seed data awal..."
  npx tsx prisma/seed.ts
  echo "[APP] Seed selesai — login: admin@arahkarya.com / Adminarahkarya123!dsw"
else
  echo "[APP] Database sudah berisi data ($USER_COUNT user), skip seed."
fi

# ── 4. Start server ────────────────────────────────────────────────────────
echo "[APP] Starting Keuangan ERP on port ${PORT:-3001}..."
echo "═══════════════════════════════════════════"
exec node dist/index.js
