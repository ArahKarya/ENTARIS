#!/usr/bin/env bash
# Build buku manual PDF dari 12 file markdown.
# Deps: pandoc + wkhtmltopdf. Jalankan dari root repo atau docs/manual.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/ERP-PMD-Manual.pdf"
TMP="$(mktemp -d)"
COMBINED="$TMP/combined.md"
CSS="$TMP/style.css"

# Urutan bab
FILES=(
  "01-pendahuluan.md" "02-setup-awal.md" "03-master-data.md"
  "04-modul-penjualan.md" "05-modul-pembelian.md" "06-modul-stok-produksi.md"
  "07-modul-bank-kas.md" "08-akuntansi.md" "09-laporan.md"
  "10-sistem.md" "11-contoh-kasus.md"
)

# Cover + metadata
cat > "$COMBINED" <<'EOF'
---
title: "Buku Manual ERP PMD"
subtitle: "Panduan Lengkap — Setup, Modul, & Contoh Kasus"
author: "PT Pangan Masa Depan"
date: "Versi Aplikasi 3.3.0 · Mei 2026"
---

EOF

# Gabung tiap bab: buang baris navigasi (← · Daftar Isi · Lanjut →), tambah page-break
for f in "${FILES[@]}"; do
  echo '<div style="page-break-before: always;"></div>' >> "$COMBINED"
  # Hapus baris navigasi antar-bab + garis pemisah tepat setelahnya
  grep -vE '^\[← |· \[Lanjut|· \[Daftar Isi\]\(README\.md\)' "$DIR/$f" >> "$COMBINED"
  echo -e "\n" >> "$COMBINED"
done

# CSS styling buku
cat > "$CSS" <<'EOF'
@page { margin: 2cm 1.8cm; }
body { font-family: 'DejaVu Sans', sans-serif; font-size: 10.5pt; line-height: 1.5; color: #1e293b; }
h1 { color: #1e3a5f; font-size: 20pt; border-bottom: 3px solid #2c4d78; padding-bottom: 6px; margin-top: 0; }
h2 { color: #2c4d78; font-size: 14pt; margin-top: 1.2em; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
h3 { color: #3a5d8f; font-size: 11.5pt; margin-top: 1em; }
table { border-collapse: collapse; width: 100%; margin: 0.8em 0; font-size: 9.5pt; }
th { background: #2c4d78; color: white; text-align: left; padding: 5px 8px; }
td { border: 1px solid #cbd5e1; padding: 4px 8px; vertical-align: top; }
tr:nth-child(even) td { background: #f1f5f9; }
code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-family: 'DejaVu Sans Mono', monospace; font-size: 9pt; }
pre { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #2c4d78; padding: 8px 10px; border-radius: 4px; font-size: 8.5pt; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid #e6a623; background: #fef9ec; margin: 0.6em 0; padding: 6px 12px; color: #713f12; }
a { color: #2563eb; text-decoration: none; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.2em 0; }
EOF

echo "→ Generating PDF..."
pandoc "$COMBINED" \
  --toc --toc-depth=2 \
  --standalone \
  --metadata title="Buku Manual ERP PMD" \
  -c "$CSS" --embed-resources \
  --pdf-engine=wkhtmltopdf \
  --pdf-engine-opt=--enable-local-file-access \
  -o "$OUT"

echo "✓ PDF: $OUT"
ls -lh "$OUT"
rm -rf "$TMP"
