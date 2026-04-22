# Panduan Update & Migrasi — Simple ERP

Dokumen ini untuk operator/admin yang sudah deploy Simple ERP di server sendiri dan ingin menarik update dari repo ini tanpa merusak data production.

## TL;DR — Prosedur update aman

```bash
# 1. Backup dulu (WAJIB)
bash scripts/backup.sh

# 2. Pilih versi stabil, bukan main
git fetch --tags
git checkout vX.Y.Z          # lihat tag di GitHub Releases

# 3. Rebuild
docker compose build
docker compose up -d

# 4. Migrasi DB otomatis jalan via entrypoint (prisma migrate deploy)

# 5. Verifikasi
curl -fsS http://localhost:3001/health
docker compose logs -f app | head -40
```

Kalau salah satu step gagal, restore dari backup:

```bash
bash scripts/restore.sh simple_erp_YYYY-MM-DD_HHMMSS.sql.gz
```

## Versi & Semver

Repo ini mengikuti [Semantic Versioning](https://semver.org):

| Bagian | Contoh | Arti |
|---|---|---|
| **MAJOR** | `2.0.0` | Breaking change — butuh tindakan manual (baca changelog) |
| **MINOR** | `1.3.0` | Fitur baru, 100% kompatibel dengan DB lama |
| **PATCH** | `1.2.5` | Bugfix saja, aman auto-update |

Rekomendasi:
- **Production** — pin ke tag PATCH terbaru dalam MINOR yang sama
- **Staging** — ikut MINOR terbaru
- **Development** — boleh ikut `main`

## Yang TIDAK berubah saat update

- Data di database (user, transaksi, COA, invoice, payment, journal entry, dll.)
- File `.env` (tidak pernah di-commit)
- Volume upload (`uploads/`)
- `company_settings` — nama perusahaan, logo, bank account, NPWP
- Konfigurasi branding via DB (lihat _Branding Multi-Industri_ di bawah)

## Yang BISA berubah saat update

1. **Kode aplikasi** — logic server + UI client
2. **Schema DB** — via Prisma migration di `server/prisma/migrations/`
3. **Dependency library** — dari `package.json`
4. **Static asset** — logo default, favicon, template PDF
5. **Docker image** — base, runtime, entrypoint

## Checklist sebelum release MAJOR/MINOR

Kalau kamu fork repo ini dan rilis untuk user lain, pastikan:

- [ ] Semua migration **additive-only** (tambah kolom nullable, tambah tabel, tambah index)
- [ ] Jangan `DROP COLUMN` kolom yang dipakai user — pakai pola **expand → contract**:
  1. Release N: tambah kolom baru, sync dua arah di code
  2. Release N+1: migrate data dari kolom lama ke baru
  3. Release N+2 (major): baru drop kolom lama
- [ ] Rename kolom/tabel pakai `ALTER ... RENAME` (preserve data), dan update semua referensi code di PR yang sama
- [ ] Perubahan business logic akuntansi (GL posting, balance calculation) WAJIB backward-compatible — tidak boleh mengubah interpretasi transaksi historis
- [ ] Tambahkan entry di `CHANGELOG.md` + bagian _Breaking Changes_ kalau ada
- [ ] Test di staging dengan DB clone dari production sebelum tag release

## Branding Multi-Industri

Aplikasi ini didesign supaya **1 repo bisa dipakai banyak industri** tanpa fork:

| Elemen branding | Sumber | Cara ganti |
|---|---|---|
| Nama perusahaan | DB `company_settings.companyName` | Pengaturan → Perusahaan |
| Logo invoice/PDF | DB `company_settings.logoUrl` | Pengaturan → Perusahaan (upload) |
| Alamat, NPWP, kontak | DB `company_settings.*` | Pengaturan → Perusahaan |
| Info rekening bank invoice | DB `invoice_settings.sales.bankAccounts` | Pengaturan → Invoice |
| Login page (nama + logo) | API `/api/public/branding` (baca dari DB) | Otomatis dari Pengaturan → Perusahaan |
| Sidebar header | DB `company_settings.companyName` | Otomatis |
| Document title tab browser | DB `company_settings.companyName` | Otomatis |
| Favicon & PWA icon | Static di `client/public/` | Fork repo atau build image custom |
| PWA manifest name | Build-time `client/vite.config.ts` | Fork repo atau build image custom |

Yang masih perlu fork/custom build: favicon, PWA icon, PWA manifest name. Sisanya cukup set di UI Pengaturan.

## Kalau migration gagal

Migration Prisma jalan otomatis di `docker-app-entrypoint.sh` via `npx prisma migrate deploy`. Kalau gagal:

1. Container app restart-loop — cek log: `docker compose logs app`
2. Cek migration file paling akhir di `server/prisma/migrations/`
3. Kalau perlu rollback: **restore backup**, jangan edit `_prisma_migrations` manual
4. Report issue dengan log error lengkap

## Backup rutin

Script backup otomatis sudah disediakan:

```bash
bash scripts/setup-backup.sh    # one-time: install cron daily jam 02:00
bash scripts/backup.sh          # manual backup sekarang
bash scripts/restore.sh         # list backup tersedia
bash scripts/restore.sh <file>  # restore spesifik
```

Backup disimpan di branch `backups` repo git, max 3 file (auto-rotate).

## FAQ

**Q: Kalau saya pull dari `main` tanpa pin tag, apa risikonya?**
A: Kamu akan terima perubahan eksperimental yang belum rilis stabil. Boleh untuk staging, **hindari di production**.

**Q: Apakah data lama saya aman kalau saya update dari v1.x ke v2.x?**
A: Baca `CHANGELOG.md` bagian _Breaking Changes_. MAJOR version selalu butuh backup dulu dan kemungkinan tindakan manual.

**Q: Saya sudah customize nama perusahaan di UI Pengaturan. Kalau update, apakah hilang?**
A: Tidak. `seed.ts` pakai `upsert ... update: {}` — row existing tidak disentuh. Yang di DB tetap.

**Q: Saya fork repo ini, mau ganti favicon/PWA icon. Bagaimana cara merge update upstream tanpa konflik?**
A: Taruh asset custom di `client/public/` pakai nama berbeda (`favicon-custom.png`), lalu update `index.html` + `vite.config.ts` di fork saja. Saat merge upstream, konflik terbatas di 2 file itu.
