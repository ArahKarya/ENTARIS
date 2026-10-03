#!/bin/bash
# ============================================================
# deploy.sh — Entaris Deployment Script
# Run on the Raspberry Pi / production server
# Usage: bash deploy.sh
# ============================================================

set -e

echo "🚀 Entaris — Deploy"
echo "========================"

# 1. Pull latest code
echo ""
echo "📥 1/7 Pulling latest code..."
git pull origin main

# 2. Install server dependencies
echo ""
echo "📦 2/7 Installing server dependencies..."
cd server
npm install

# 3. Generate Prisma client + run migrations
echo ""
echo "🗃️  3/7 Running database migrations..."
npx prisma generate
npx prisma migrate deploy

# 4. Seed database (safe — upserts existing users)
echo ""
echo "🌱 4/7 Seeding database..."
npx prisma db seed || echo "⚠️  Seed skipped (may need ts-node). Run manually if needed."

# 5. Build server
echo ""
echo "🔨 5/7 Building server..."
npm run build

# 6. Build client
echo ""
echo "🎨 6/7 Building client..."
cd ../client
npm install
npm run build

# 7. Restart server
echo ""
echo "🔄 7/7 Restarting server..."
cd ..

# Try PM2 first, then systemd, then just show instructions
if command -v pm2 &> /dev/null; then
  pm2 restart keuangan-erp 2>/dev/null || pm2 start server/dist/index.js --name keuangan-erp
  pm2 save
  echo "✅ Server restarted via PM2"
elif systemctl is-active --quiet keuangan-erp 2>/dev/null; then
  sudo systemctl restart keuangan-erp
  echo "✅ Server restarted via systemd"
else
  echo "⚠️  No process manager detected."
  echo "   Start manually:  cd server && node dist/index.js"
  echo "   Or install PM2:  npm install -g pm2"
  echo "                    pm2 start server/dist/index.js --name keuangan-erp"
  echo "                    pm2 save && pm2 startup"
fi

echo ""
echo "✅ Deploy complete!"
echo "   Check: curl http://localhost:3001/health"
