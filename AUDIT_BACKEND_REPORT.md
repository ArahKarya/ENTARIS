# Laporan Audit Backend — Simple ERP (server)

**Tanggal:** 17 Juni 2026
**Lingkup:** `/home/yay/ArahKarya/simple-erp/server` + konfigurasi Docker root
**Fokus:** Integritas ledger, aturan double-entry, perhitungan HPP (WAC), keamanan (SQLi/JWT/Zod), dan dockerisasi.

---

## Ringkasan Eksekutif

| Area | Status | Catatan |
|------|--------|---------|
| Double-entry bookkeeping | ✅ **Kuat** | Validasi aplikasi + trigger DB deferred constraint |
| Perhitungan HPP / WAC | ⚠️ **Cukup, ada catatan** | Logika WAC defensif; ada potensi presisi & realign avgCost |
| SQL Injection | ✅ **Aman** | Semua raw query memakai parameterized tagged template |
| Autentikasi JWT | ⚠️ **Baik, ada celah** | Verifikasi solid; expiry token & blacklist perlu perhatian |
| Validasi input (Zod) | ⚠️ **Body tervalidasi, query tidak** | Query params di-cast manual tanpa schema |
| Docker & Environment | 🔴 **Beberapa isu serius** | Default secret lemah, container jalan sebagai root, DATABASE_URL salah format |

---

## 1. Aturan Double-Entry Bookkeeping

### ✅ Temuan Positif

1. **Trigger DB sebagai pertahanan terakhir.**
   Migration `20260511b_je_balance_check` memasang *deferred constraint trigger* yang menolak JE `Submitted` yang tidak balance saat COMMIT. Diverifikasi oleh test integrasi `server/src/__tests__/integration/jeBalanceConstraint.integration.test.ts:55-79` (menolak unbalanced) dan mengizinkan `Draft` unbalanced (baris 115-144). Ini lapisan integritas terkuat — bahkan jalur kode yang lupa validasi akan tetap di-reject database.

2. **Validasi balance di level route (manual JV).**
   `server/src/routes/journals.ts:90-96` menghitung total debit vs kredit dan menolak selisih > 0.01. Baris 82-88 juga menolak satu baris berisi debit DAN kredit sekaligus.

3. **Posting ledger konsisten di service transaksi.**
   `server/src/services/salesInvoiceSubmit.ts` memproduksi JE penjualan seimbang: DR Piutang (`grandTotal`) = CR Penjualan + CR PPN, dengan `potongan`/`biayaLain` dialokasikan ke akun pendapatan terbesar agar JE tetap balance (baris 236-245). JE HPP terpisah (DR HPP / CR Persediaan) juga seimbang (baris 400-447).

4. **Health-check pendeteksi drift.**
   `server/src/routes/health/checks.ts:128-160` (`checkUnbalancedJournals`) men-scan JE `Submitted` dengan `ABS(SUM(debit)-SUM(credit)) > 0.01`. Ada pula pengecekan ALE vs JournalItem sync dan orphan ALE.

5. **Cancel JE aman.**
   `journals.ts:219-224` memblokir pembatalan JE auto-generated (`JV-PAY/SI/PI/COGS`) dari modul Buku Besar — harus dibatalkan dari modul sumbernya. Reversal memakai soft-cancel ALE (baris 303-306), bukan entri `[BATAL]` ganda.

### ⚠️ Temuan / Rekomendasi

- **[LOW] Trigger hanya menjaga `journal_entry_accounts`, bukan `accounting_ledger_entries` (ALE).**
  Balance JE dijaga DB, tetapi ALE (ledger immutable) di-`createMany` terpisah di kode (mis. `salesInvoiceSubmit.ts:294-306`, `journals.ts:131-143`). Jika ada bug yang memposting ALE beda dari JournalItem, hanya health-check (reaktif) yang menangkap, bukan constraint (preventif).
  **Rekomendasi:** Tambah trigger/constraint balance serupa pada `accounting_ledger_entries` per `referenceId`, atau jadikan health-check `ALE vs JournalItem Sync` sebagai job terjadwal dengan alert otomatis.

---

## 2. Perhitungan HPP / Weighted Average Cost

### File: `server/src/utils/weightedAverage.ts`

- **✅ Presisi Decimal.** Memakai `decimal.js`, menghindari floating point error pada nilai uang.
- **✅ Guard oversold.** Baris 32-34: jika `currentQty <= 0`, fallback ke `inUnitCost` (mencegah avg cost meledak jadi jutaan akibat saldo negatif). Baris 37-41 menangani `totalQty <= 0`. Logika defensif yang baik.
- **⚠️ [LOW] Pembulatan 2 desimal per langkah** (baris 44 `toDecimalPlaces(2)`). Untuk item bernilai rendah dengan volume tinggi, pembulatan berulang dapat mengakumulasi error sen. **Rekomendasi:** simpan `averageCost` dengan presisi lebih tinggi (mis. 4 desimal) di DB, bulatkan hanya saat posting GL.

### File: `server/src/services/cogsBackfillService.ts`

Logika settle deficit COGS (FIFO) saat ada stock-in, dengan posting JV differential (DR HPP/CR Persediaan atau sebaliknya).

- **✅ Materiality threshold.** `NEAR_ZERO_AMT = 0.005` (baris 24, 78) — hanya posting JV bila differential material. Mencegah JV recehan.
- **✅ JV differential balance.** Baris 113-114: satu baris DR, satu CR dengan `amt` sama → selalu balance.
- **⚠️ [MEDIUM] Realign `averageCost` berpotensi tidak konsisten dengan nilai GL Persediaan.**
  Baris 134-145: setelah settle, `averageCost` dihitung ulang sebagai `(oldStock*oldAvg - totalDifferential)/stock`. Namun nilai differential sudah dialihkan ke akun HPP/Persediaan via JV, sementara `averageCost` adalah field denormalisasi pada `inventoryItem`. Tidak ada rekonsiliasi otomatis bahwa `currentStock * averageCost` == saldo akun Persediaan di GL. Saat `newAvg < 0` di-clamp ke 0 (baris 143), saldo denormalisasi dan GL bisa diverge.
  **Rekomendasi:** Tambahkan ke health-check pengecekan `inventoryItem.currentStock * averageCost` vs saldo GL akun Persediaan terkait, dengan toleransi. Sudah ada drift-check serupa di `health/checks.ts` — pastikan inventory value tercakup.
- **⚠️ [LOW] Pemilihan akun HPP hardcoded `5.1` lalu `5`.**
  `cogsBackfillService.ts:89-92` dan `salesInvoiceSubmit.ts:86-87` mencari akun by `accountNumber` literal (`'5.1'`/`'5'`). Jika nomor akun COA diubah/di-import berbeda, posting bisa gagal/ke akun salah. **Rekomendasi:** gunakan mapping `systemAccounts` (sudah ada konstanta) secara konsisten, hindari literal nomor akun di service.

---

## 3. Keamanan

### 3.1 SQL Injection — ✅ AMAN

Audit seluruh penggunaan `$queryRaw` / `$executeRaw` / `$queryRawUnsafe` / `$executeRawUnsafe` (50 match):

- **Semua `$queryRaw`/`$executeRaw` memakai tagged template** dengan interpolasi `${var}` yang otomatis di-parameterisasi Prisma. Contoh aman: `paymentSubmit.ts:507,535`, `customerDeposits.ts:221-222`, `ga/maintenance.ts:601-607` (nilai numerik di-pass sebagai parameter), `dashboard.ts`, `health/checks.ts`, `reports/operational.ts`.
- **Dua penggunaan `Unsafe` — keduanya AMAN** karena tidak ada input user:
  - `server/src/jobs/scheduler.ts:24-26` — `pg_try_advisory_xact_lock(${jobKey})` di mana `jobKey` adalah `bigint` internal (bukan input).
  - `server/src/routes/settings/dummyData.ts:740` — `TRUNCATE TABLE ...` dengan daftar tabel **hardcoded** (tidak ada interpolasi user). Tetap, endpoint ini sangat destruktif (lihat catatan di bawah).

> **Kesimpulan:** Tidak ditemukan kerentanan SQL Injection.

- **⚠️ [MEDIUM] Endpoint destruktif `POST /api/settings/reset-data`** (`dummyData.ts:730`) melakukan `TRUNCATE ... CASCADE` seluruh data transaksi. Di-gate dengan `requirePerm('settings')` + konfirmasi string `'RESET'`. Komentar menyebut "development", tetapi tidak ada guard `NODE_ENV !== 'production'`.
  **Rekomendasi:** Tambahkan blokir keras jika `NODE_ENV === 'production'`, atau lindungi dengan capability khusus + audit wajib.

### 3.2 Autentikasi JWT — ⚠️ BAIK dengan celah

File: `server/src/utils/auth.ts`, `server/src/middleware/auth.ts`, `server/src/routes/auth.ts`

**Positif:**
- **✅ Fail-fast JWT_SECRET.** `auth.ts:3-11` `process.exit(1)` bila `JWT_SECRET` tidak diset ATAU masih placeholder `ganti-dengan...`. Sangat baik — mencegah deploy dengan secret default.
- **✅ Verifikasi token benar** (`verifyToken` baris 24-30) — `jwt.verify` dalam try/catch, return null bila invalid/expired.
- **✅ Token blacklist** dicek setiap request (`auth.ts middleware:32-35`); logout mem-blacklist token (`routes/auth.ts:121-140`) dengan purge terjadwal (`scheduler.ts:42-53`).
- **✅ Cookie HttpOnly + Secure (prod) + SameSite=strict** (`routes/auth.ts:59-65`).
- **✅ Proteksi CSRF** double-submit cookie untuk request cookie-auth (`auth.ts middleware:37-47`).
- **✅ bcrypt** untuk hash password (`routes/auth.ts:35`).
- **✅ Rate-limit login** 10/15 menit per IP (`rateLimiter.ts`) + rate-limit global `/api` 300/menit (`index.ts:147-158`).
- **✅ Pesan login generik** ("Email atau password salah") — tidak membocorkan apakah user ada.

**Celah / Rekomendasi:**
- **⚠️ [MEDIUM] Token lifetime 1 hari tanpa refresh token** (`auth.ts:21` `expiresIn: '1d'`). Tidak ada mekanisme refresh/rotation; token kompromi valid 24 jam penuh. **Rekomendasi:** pertimbangkan access token pendek + refresh token, atau setidaknya idle timeout.
- **⚠️ [LOW] Blacklist check = query DB per request.** `findUnique` pada `tokenBlacklist` setiap request terotentikasi. Sudah dimitigasi purge terjadwal, namun bisa jadi bottleneck. **Rekomendasi:** cache (mis. Redis) atau gunakan JWT `jti` + in-memory set.
- **⚠️ [LOW] CSRF hanya enforced untuk cookie-auth, bukan Bearer.** Wajar (Bearer tidak rentan CSRF), namun pastikan front-end konsisten memakai cookie-auth agar proteksi tidak ter-bypass dengan menambah header `Authorization` kosong.
- **⚠️ [INFO] `roleMiddleware` berbasis nama role** masih ada (`auth.ts:53-60`) berdampingan dengan RBAC dinamis (`requirePerm`/`requireCap`). Pastikan tidak ada route yang tanpa sengaja hanya pakai role string lama.

### 3.3 Validasi Input (Zod) — ⚠️ Body OK, Query tidak

- **✅ Body tervalidasi** via `validateBody(schema, req.body, res)` (`utils/validate.ts`) dengan schema di `utils/schemas.ts` (mis. `CreateJournalSchema`, `CreateSalesInvoiceSchema`). Mengembalikan 400 + pesan issue pertama.
- **⚠️ [LOW-MEDIUM] Query params di-cast manual tanpa Zod.** Contoh `journals.ts:20-22` (`page`/`limit` via `Number()`), `cogsBackfill.ts:12-18` (`String(status)` langsung ke `where.status`). Sudah ada clamp (`Math.min(...,200)`) yang baik, namun nilai seperti `status` masuk query Prisma tanpa whitelist enum.
  **Rekomendasi:** buat schema Zod untuk query params (terutama field yang masuk `where`), validasi enum status terhadap nilai yang diizinkan.

---

## 4. Docker Compose & Keamanan Environment

File: `docker-compose.yml`, `Dockerfile`, `docker-app-entrypoint.sh`, `.env.docker.example`, `.gitignore`, `.dockerignore`

**Positif:**
- **✅ `.env` TIDAK ter-commit** ke git (diverifikasi `git ls-files` — hanya `*.example` yang tracked). `.gitignore:9-12` benar mengecualikan `.env`/`env.*`.
- **✅ Port DB di-bind ke localhost saja** (`docker-compose.yml:29` `127.0.0.1:5435:5432`) — tidak terekspos ke jaringan luar. Override `docker-compose.override.yml` malah me-reset ports DB jadi kosong (lebih aman lagi).
- **✅ Multi-stage build** (`Dockerfile`) memisahkan deps/builder/runner; runner hanya `npm ci --omit=dev`.
- **✅ Healthcheck** terdefinisi untuk db & app.
- **✅ Migration deploy + auto-seed** di entrypoint dengan guard "seed hanya jika DB kosong".

**Temuan / Rekomendasi:**

- **🔴 [HIGH] DATABASE_URL malformed + password default lemah ter-hardcode.**
  `docker-compose.yml:49`:
  ```
  DATABASE_URL: "postgresql://${POSTGRES_USER:***@db:5432/${POSTGRES_DB:-keuangan_db}?schema=public"
  ```
  String ini **rusak**: sintaks `${POSTGRES_USER:***` tidak valid (kemungkinan typo untuk `${POSTGRES_USER}:${POSTGRES_PASSWORD}@...`), password tidak ada di URL, dan tanda kutip tidak menutup `public"` tanpa pasangan jelas. Selain itu default password DB `keuangan_secret_2026` ter-hardcode di baris 32.
  **Rekomendasi:**
  1. Perbaiki menjadi: `DATABASE_URL: "postgresql://${POSTGRES_USER:-keuangan}:${POSTGRES_PASSWORD:-...}@db:5432/${POSTGRES_DB:-keuangan_db}?schema=public"`.
  2. **Hapus default password**; jadikan variabel wajib (gunakan `${POSTGRES_PASSWORD:?harus diisi}` agar compose gagal bila kosong).

- **🔴 [HIGH] JWT_SECRET default placeholder di compose.**
  `docker-compose.yml:51` `JWT_SECRET: "${JWT_SECRET:-ganti-dengan-secret-yang-aman}"`. Untungnya aplikasi `process.exit(1)` bila secret = placeholder (`auth.ts:8-11`) — jadi tidak akan boot dengan secret lemah. Tetap, sebaiknya gunakan `${JWT_SECRET:?JWT_SECRET wajib diisi}` agar gagal lebih awal & jelas.

- **🔴 [HIGH] Container berjalan sebagai root.**
  `Dockerfile` tidak memiliki direktif `USER`. Proses Node + akses volume (`uploads`, `backups`) berjalan sebagai root → eskalasi risiko bila ada RCE.
  **Rekomendasi:** tambah user non-root, mis.:
  ```dockerfile
  RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
  USER app
  ```

- **⚠️ [MEDIUM] CSP mengizinkan `'unsafe-eval'`.**
  `index.ts:87` `scriptSrc: ["'self'", "'wasm-unsafe-eval'", "'unsafe-eval'"]`. Dibutuhkan @react-pdf/renderer, namun `'unsafe-eval'` melemahkan proteksi XSS. **Rekomendasi:** jika memungkinkan, batasi ke `'wasm-unsafe-eval'` saja (cukup untuk WASM) dan uji apakah `'unsafe-eval'` masih diperlukan.

- **⚠️ [MEDIUM] CORS LAN-bypass.**
  `index.ts:121-134` mengizinkan origin LAN (192.168/10/172.16-31) **hanya di non-production** — desain benar. Pastikan `NODE_ENV=production` selalu diset di deploy (sudah diset di `docker-compose.yml:54`). Verifikasi tidak ada jalur yang men-set `NODE_ENV` selain production di lingkungan nyata.

- **⚠️ [LOW] `.env.docker.example` memuat contoh password & APP_BASE_URL spesifik.**
  `.env.docker.example:11` `POSTGRES_PASSWORD=keuangan_secret_2026` — sama dengan default compose. Risiko: operator menyalin apa adanya tanpa mengganti. **Rekomendasi:** ganti nilai contoh dengan placeholder eksplisit seperti `CHANGE_ME_STRONG_PASSWORD`.

- **⚠️ [LOW] Endpoint `reset-data` (TRUNCATE) tersedia di image production** (lihat 3.1). Pastikan tidak aktif di prod.

---

## Daftar Prioritas Perbaikan

| # | Severity | Lokasi | Isu | Rekomendasi |
|---|----------|--------|-----|-------------|
| 1 | 🔴 HIGH | `docker-compose.yml:49` | DATABASE_URL malformed + password default | Perbaiki sintaks, jadikan password wajib (`:?`) |
| 2 | 🔴 HIGH | `Dockerfile` | Container jalan sebagai root | Tambah `USER` non-root |
| 3 | 🔴 HIGH | `docker-compose.yml:51`, `.env.docker.example:11` | Default secret/password lemah | Wajibkan via `:?`, ganti contoh jadi placeholder |
| 4 | ⚠️ MEDIUM | `cogsBackfillService.ts:134-145` | Realign avgCost bisa diverge dari GL | Tambah health-check inventory value vs GL |
| 5 | ⚠️ MEDIUM | `dummyData.ts:730` | reset-data destruktif tanpa guard prod | Blokir bila `NODE_ENV=production` |
| 6 | ⚠️ MEDIUM | `auth.ts:21` | Token 1d tanpa refresh | Pertimbangkan refresh token/rotation |
| 7 | ⚠️ MEDIUM | `index.ts:87` | CSP `unsafe-eval` | Batasi ke `wasm-unsafe-eval` bila bisa |
| 8 | ⚠️ LOW | route query params | Query tidak divalidasi Zod | Schema Zod untuk query (whitelist enum status) |
| 9 | ⚠️ LOW | `weightedAverage.ts:44` | Pembulatan 2-desimal berulang | Simpan avgCost presisi lebih tinggi |
| 10 | ⚠️ LOW | ALE posting | Tidak ada constraint balance pada ALE | Trigger/job alert pada ALE |

---

## Kesimpulan

Codebase backend menunjukkan **disiplin akuntansi yang baik**: double-entry dijaga dua lapis (validasi aplikasi + trigger DB), perhitungan moneter konsisten memakai `decimal.js`, dan **tidak ada kerentanan SQL Injection** (semua raw query terparameterisasi). Lapisan autentikasi solid (bcrypt, JWT fail-fast, blacklist, CSRF, rate-limit).

Area yang paling mendesak adalah **dockerisasi & manajemen secret**: `DATABASE_URL` yang malformed, password/secret default lemah, dan container yang berjalan sebagai root. Selain itu, validasi query params dan rekonsiliasi nilai inventory (avgCost vs GL) sebaiknya diperkuat untuk menutup celah integritas data jangka panjang.
