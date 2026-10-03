#!/bin/sh
set -e

echo "╔══════════════════════════════════════════╗"
echo "║      Entaris — All-in-One Container      ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. Initialize PostgreSQL if needed ──────────────────────────────────────
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[DB] Initializing PostgreSQL database..."
  su-exec postgres initdb -D "$PGDATA" --auth=trust --no-locale --encoding=UTF8

  # Configure PostgreSQL for local connections
  echo "host all all 127.0.0.1/32 md5" >> "$PGDATA/pg_hba.conf"
  echo "listen_addresses = '127.0.0.1'" >> "$PGDATA/postgresql.conf"
  echo "max_connections = 50" >> "$PGDATA/postgresql.conf"
  # Optimize for Raspberry Pi (low memory)
  echo "shared_buffers = 128MB" >> "$PGDATA/postgresql.conf"
  echo "work_mem = 4MB" >> "$PGDATA/postgresql.conf"
  echo "maintenance_work_mem = 64MB" >> "$PGDATA/postgresql.conf"
  echo "effective_cache_size = 256MB" >> "$PGDATA/postgresql.conf"

  # Start temporarily to create user and database
  su-exec postgres pg_ctl -D "$PGDATA" start -w -o "-c listen_addresses=127.0.0.1"

  su-exec postgres psql -c "CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}' SUPERUSER;"
  su-exec postgres psql -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};"

  su-exec postgres pg_ctl -D "$PGDATA" stop -w
  echo "[DB] PostgreSQL initialized successfully."
else
  echo "[DB] PostgreSQL data directory exists, skipping init."
fi

# ── 2. Start PostgreSQL in background ───────────────────────────────────────
echo "[DB] Starting PostgreSQL..."
su-exec postgres pg_ctl -D "$PGDATA" start -w -o "-c listen_addresses=127.0.0.1"

# Wait for PostgreSQL to be ready
until su-exec postgres pg_isready -h 127.0.0.1 -q; do
  echo "[DB] Waiting for PostgreSQL..."
  sleep 1
done
echo "[DB] PostgreSQL is ready."

# ── 3. Set DATABASE_URL for Prisma (persist for `docker exec` sessions) ─────
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}?schema=public"
echo "export DATABASE_URL=\"$DATABASE_URL\"" > /etc/profile.d/entaris.sh

# ── 4. Run Prisma migrations ───────────────────────────────────────────────
echo "[APP] Running database migrations..."
cd /app/server
npx prisma migrate deploy
echo "[APP] Migrations complete."

# ── 4b. Auto-seed jika database masih kosong (pertama kali) ────────────────
USER_COUNT=$(su-exec postgres psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COUNT(*) FROM \"User\";" 2>/dev/null || echo "0")
if [ "$USER_COUNT" = "0" ]; then
  echo "[APP] Database kosong, menjalankan seed data awal..."
  npx tsx prisma/seed.ts
  echo "[APP] Seed selesai."
else
  echo "[APP] Database sudah berisi data ($USER_COUNT user), skip seed."
fi

# ── 5. Start Express server ─────────────────────────────────────────────────
echo "[APP] Starting Entaris on port ${PORT:-3001}..."
echo "═══════════════════════════════════════════"

# Handle shutdown gracefully
cleanup() {
  echo ""
  echo "[APP] Shutting down..."
  kill $NODE_PID 2>/dev/null
  su-exec postgres pg_ctl -D "$PGDATA" stop -w -m fast
  echo "[APP] Stopped. Goodbye!"
  exit 0
}
trap cleanup SIGTERM SIGINT

# Start Node.js
node dist/index.js &
NODE_PID=$!

# Wait for the Node.js process
wait $NODE_PID
