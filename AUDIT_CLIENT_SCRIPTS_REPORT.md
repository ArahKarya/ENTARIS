# Laporan Audit — Frontend Client & System Scripts

**Proyek:** Simple ERP (ArahKarya)
**Lingkup:** `client/` (React SPA) dan `scripts/` (backup/restore, SQL backfill, integrasi)
**Tanggal:** 2026-06-17
**Auditor:** Subagent (delegated security/quality review)

---

## Ringkasan Eksekutif

Arsitektur dasar sudah **kuat**: JWT disimpan sebagai cookie **HttpOnly + SameSite=strict** (bukan localStorage), ada token CSRF, integrasi Telegram memakai **polling getUpdates** (bukan webhook publik) dengan **verifikasi otorisasi admin** pada callback, dan **tidak ada** penggunaan `dangerouslySetInnerHTML` sama sekali (0 hasil). Tidak ditemukan kebocoran token di log client.

Temuan tersisa sebagian besar **Low–Medium**, dengan satu temuan **High** pada `scripts/restore.sh` (potensi SQL/command injection lewat nilai `.env`) dan satu **Medium** state-leakage di client (cache TanStack Query tidak dibersihkan saat logout). Tabel rinci di bawah.

| # | Area | Severity | File |
|---|------|----------|------|
| 1 | Restore SQL injection via DB_NAME/DB_USER | **High** | scripts/restore.sh:150-158 |
| 2 | Query cache tidak di-clear saat logout (state leak antar-user) | **Medium** | client/src/layouts/MainLayout.tsx:75-79 |
| 3 | Kredensial admin hardcoded di skrip utilitas | **Medium** | scripts/update-coa.py:48 |
| 4 | Parsing DATABASE_URL gagal jika password mengandung `@`/`:` | **Medium** | scripts/backup.sh:52-53, restore.sh:38-39 |
| 5 | SQL backfill destruktif tanpa guard idempotensi/lingkungan | **Medium** | scripts/fix-*.sql, update-coa.py:68-80 |
| 6 | Routing guard hanya client-side (defense in depth) | **Low (by design)** | client/src/App.tsx:69-103 |
| 7 | `localStorage('user')` bisa dimanipulasi (UI spoofing) | **Low** | client/src/lib/permissions.ts:17-44 |
| 8 | `alert()` untuk "Lupa password" | **Low (UX)** | client/src/pages/LoginPage.tsx:420 |
| 9 | Skrip `.cjs` pakai path absolut `/app/server` (rapuh) | **Info** | scripts/backfill-stt-from-pi.cjs:18-21 |

---

## 1. Frontend Client

### 1.1 Keamanan

**✅ dangerouslySetInnerHTML** — Tidak ada satu pun penggunaan di seluruh `client/src` (0 hasil pencarian). Tidak ada risiko XSS dari injeksi HTML mentah. **Baik.**

**✅ Mekanisme penyimpanan JWT** — JWT **TIDAK** disimpan di localStorage. Token diset server sebagai cookie **HttpOnly** (`server/src/routes/auth.ts:59-65`: `httpOnly:true, sameSite:'strict', secure` di production). Client hanya menyimpan **profil user non-sensitif** di `localStorage('user')` untuk RBAC tampilan. Axios memakai `withCredentials:true` (`client/src/lib/api.ts:5`) + token CSRF dari cookie non-HttpOnly yang dikirim sebagai header `X-CSRF-Token` (`api.ts:8-20`). **Ini pola yang benar dan aman dari pencurian token via XSS.**

**✅ Error handling / kebocoran token di log** — Hanya 6 pemanggilan `console.*` di client, semuanya untuk error export/upload/render boundary; **tidak ada token/credential yang di-log** (`exportExcel.ts:25`, `ErrorBoundary.tsx:33`, dll). Karena token bersifat HttpOnly, JS tidak bisa membacanya untuk bocor. **Baik.**

**Temuan #6 — Routing guard client-side saja (Low / by design).**
`ProtectedRoute` (`App.tsx:69-96`) dan `PermRoute` (`App.tsx:100-103`) menggate berdasarkan `localStorage('user')` + `/auth/me`. Komentar di kode sudah benar menyatakan *"Server tetap enforce; ini hanya untuk menampilkan/menyembunyikan UI."* Ini **bukan kerentanan** selama setiap endpoint server memverifikasi RBAC. Rekomendasi: pastikan **semua** route server (21 file route) konsisten memakai middleware `auth` + cek izin — guard client tidak boleh menjadi satu-satunya kontrol akses.

**Temuan #7 — `localStorage('user')` dapat dimanipulasi (Low).**
`permissions.ts:25-44` (`isSuperAdmin`, `can`, `cap`) membaca flag `isSuperAdmin`/`permissions`/`caps` langsung dari localStorage. Pengguna dapat mengedit nilai ini di DevTools untuk **menampilkan menu/tombol terlarang**. Dampak terbatas pada UI (server tetap menolak), tapi bisa membingungkan/menyesatkan. *Rekomendasi:* perlakukan sebagai cosmetic-only; jangan pernah menjadikannya basis keputusan keamanan. (Sudah sesuai praktik saat ini — dicatat sebagai pengingat.)

**Temuan #8 — `alert()` pada "Lupa?" password (Low/UX).**
`LoginPage.tsx:420` memakai `alert('Hubungi administrator...')`. Bukan masalah keamanan, tapi sebaiknya diganti modal/toast konsisten.

### 1.2 Kualitas (React 19 / TS / state leakage)

**✅ Kepatuhan React 19 / TS** — Pemakaian hooks modern benar (`useState` functional updater di `GoodsReceiptModal`, `JournalEntryModal`), `crypto.randomUUID()` untuk key stabil, cleanup effect dengan flag `cancelled` (`LoginPage.tsx:302-308`, `App.tsx:74-91`) dan `AbortController` — mencegah setState setelah unmount. TanStack Query 5 dipakai konsisten (`useQuery`/`useMutation`). Tidak ditemukan pelanggaran sintaks React 19.

**Temuan #2 — State leakage: cache TanStack Query tidak dibersihkan saat logout (Medium).**
`MainLayout.tsx:75-79` `handleLogout` hanya `api.post('/auth/logout')` + `localStorage.removeItem('user')` + navigate. **`queryClient.clear()` tidak pernah dipanggil** (pencarian `queryClient.clear/removeQueries/resetQueries` = nihil; yang ada hanya `invalidateQueries` per-key). Pada perangkat bersama, jika user-B login setelah user-A logout (tanpa hard reload), **data finansial user-A** (laporan, saldo, dokumen) masih bisa muncul dari cache sebelum refetch. Karena ini aplikasi keuangan, dampak kerahasiaan nyata.
*Rekomendasi:* pada logout panggil `queryClient.clear()` (dan idealnya juga di interceptor 401 di `api.ts:26-29`) sebelum redirect.

**Catatan kecil:** `document.title` diset di **dua** tempat (`MainLayout.tsx:61-65` dan `CompanySettingsContext.tsx:39-40`) sehingga bisa saling menimpa — kosmetik, bukan bug fungsional.

---

## 2. System Scripts (`scripts/`)

### 2.1 Backup/Restore — Parsing kredensial & keamanan shell

**Temuan #1 — SQL/command injection lewat `DB_NAME`/`DB_USER` (HIGH).**
`restore.sh:150-158` menyisipkan variabel langsung ke perintah SQL:
```sql
DROP DATABASE IF EXISTS ${DB_NAME};
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
```
Nilai `DB_NAME`/`DB_USER` di-parse dari `.env`/`DATABASE_URL` (`restore.sh:30-44`) tanpa sanitasi. Jika `.env` berisi nilai jahat (mis. `simple_erp; DROP TABLE users; --` atau back-tick), maka:
- terjadi **SQL injection** ke dalam blok psql, dan
- karena seluruh string masuk `docker exec ... psql -c "..."`, juga membuka peluang **manipulasi perintah**.
Walaupun `.env` biasanya tepercaya, ini melanggar prinsip least-trust dan berbahaya jika `.env` pernah ter-commit/ter-generate dari sumber eksternal.
*Rekomendasi:*
1. Validasi ketat: `DB_NAME`/`DB_USER` harus cocok regex `^[A-Za-z_][A-Za-z0-9_]*$`, jika tidak → abort.
2. Gunakan quoting identifier psql (`--set` + `format('%I', ...)`) atau `createdb`/`dropdb` CLI yang menerima nama sebagai argumen, bukan interpolasi string SQL.

**Temuan #4 — Parsing DATABASE_URL rapuh terhadap karakter khusus password (Medium).**
`backup.sh:52-53` dan `restore.sh:38-39`:
```sh
DB_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')
```
Jika password mengandung `@`, `:`, atau `/` (umum & disarankan untuk password kuat), regex `[^:]+` / `.*/` salah parse → user/db keliru → backup/restore bisa gagal atau, lebih buruk, **menyentuh database yang salah**. *Rekomendasi:* gunakan parser URL yang benar (mis. lewat `node -e` atau `python -c urllib.parse`), atau wajibkan var eksplisit `POSTGRES_USER`/`POSTGRES_DB`.

**✅ Hal yang sudah baik pada backup/restore:**
- `set -euo pipefail` di ketiga skrip — fail-fast.
- `trap cleanup EXIT` menghapus worktree & temp file.
- Restore meminta konfirmasi ketik `yes` (`restore.sh:127-131`) dan menstop app via PM2 sebelum drop.
- Backup memakai `pg_dump` via `docker exec` (parameter `-U/-d` tetap di-quote secara shell) — relatif aman.
- Cron setup (`setup-backup.sh:96-106`) idempoten (hapus entri lama sebelum menambah).

**Catatan retensi:** `MAX_BACKUPS=3` (backup.sh:14) → hanya 3 hari. Untuk data keuangan ini **agresif**; pertimbangkan retensi lebih panjang/offsite.

### 2.2 SQL backfill — risiko kerusakan skema/data

**Temuan #5 — Skrip SQL/backfill destruktif (Medium).**
- `update-coa.py:68-80` (`delete_all_accounts`) **menghapus SELURUH akun COA** lalu mereset balance — sangat destruktif. Tidak ada flag dry-run/konfirmasi (berbeda dengan `import-fixed-assets.cjs` yang default DRY-RUN — pola baik yang seharusnya ditiru).
- `fix-balance-migration.sql` & `fix-retro-duplicates.sql` melakukan `UPDATE ... is_cancelled=true` lalu **recompute SELURUH `accounts.balance`** dari ledger. Logic-nya benar dan **dibungkus `BEGIN; ... COMMIT;`** (baik), namun:
  - Berisi **reference_id/nilai hardcoded** (UUID PR-0004/0005/0006, kode akun spesifik) — hanya valid untuk satu dataset; menjalankan ulang di DB lain berisiko salah.
  - Komentar "Expected: N rows" tidak ditegakkan (tidak ada assertion); jika jumlah baris menyimpang, skrip tetap commit.
*Rekomendasi:*
1. Tambah guard lingkungan (cek nama DB / env `ALLOW_DESTRUCTIVE=1`) dan konfirmasi interaktif.
2. Untuk SQL backfill, tambah `DO $$ ... RAISE EXCEPTION` jika `ROW_COUNT` ≠ harapan agar transaksi rollback otomatis.
3. Pindahkan skrip one-off historis ke `scripts/archive/` agar tidak sengaja dijalankan ulang.

**Temuan #3 — Kredensial admin hardcoded (Medium).**
`update-coa.py:48` berisi `password: "Admin123!"` (dan `admin@keuangan.local`) langsung di kode. Sama dengan kredensial seed default di `CLAUDE.md`. Jika skrip ini ter-commit ke repo publik/diakses pihak lain, kredensial bocor. *Rekomendasi:* baca dari env var (`os.environ['ADMIN_PASSWORD']`) dan jangan commit nilai default. Pastikan kredensial seed default diganti di produksi.

**Temuan #9 — Path absolut `/app/server` hardcoded (Info).**
`backfill-stt-from-pi.cjs:18-21` `process.chdir('/app/server')` + `require('/app/server/node_modules/...')`. Hanya jalan di dalam container. `import-fixed-assets.cjs:35` lebih baik (pakai `process.env.APP_ROOT || '/app/server'`). Selaraskan semua skrip `.cjs` agar memakai pola `APP_ROOT`.

---

## 3. Integrasi Eksternal

### 3.1 Telegram — Otorisasi webhook

**✅ Tidak ada webhook publik.** Sistem memakai **polling `getUpdates`** via cron (`telegramService.ts:346-395`), komentar eksplisit: *"Tanpa webhook → getUpdates aman."* Ini menghilangkan permukaan serangan endpoint webhook yang tidak terautentikasi.

**✅ Otorisasi callback approval kuat.** `handleApprovalCallback` (`telegramService.ts:236-306`) memverifikasi penekan tombol:
- Mencari user via `telegramChatId = from.id` (`:254-259`),
- Wajib `user.isActive` **dan** `hasCap(user.role, 'approval.decide')` (`:261-264`); jika gagal → tolak dengan pesan "tidak berwenang".
Keputusan approve/reject/revise diteruskan ke **satu sumber kebenaran** `decideApproval` (server) — tombol Telegram tidak bisa melewati logika bisnis/RBAC. **Desain sangat baik.**

**✅ Bot token tidak pernah dikembalikan/di-log.** `GET /telegram/config` hanya mengembalikan `hasToken` (`telegram.ts:14-29`); update token hanya jika non-kosong (`telegram.ts:46-48`); komentar menegaskan token = secret tak di-log.

**Catatan kecil (Low):** `pollTelegramUpdates` tidak melakukan dedup eksplisit selain `lastUpdateId`; jika dua instance scheduler berjalan paralel (mis. multi-pod), bisa ada **race** memproses update sama dua kali. Untuk deployment single-instance (Docker Compose) ini aman. Jika scale-out, tambahkan lock.

### 3.2 Notifikasi personal — Validasi

**✅ Validasi memadai.** `notificationService.ts` & `telegramService.ts`:
- Japri hanya dikirim ke user yang **sudah menautkan** (`telegramChatId not null`, `:56-58`) dan saat `personalEnabled` aktif (`:181`).
- Penautan akun lewat `/start <kode>` memvalidasi `telegramLinkCode` unik lalu **menghapus kode** setelah dipakai (`telegramService.ts:373-383`) — mencegah replay penautan.
- Tombol aksi approval hanya disertakan untuk penerima ber-capability (`withApprovalButtons`, `:184-187`), dan tetap **diverifikasi ulang** saat ditekan.
- Semua fungsi push **never-throw / fire-and-forget** sehingga kegagalan notifikasi tidak me-rollback transaksi bisnis (`:150-163`, `:169-195`). **Baik.**

---

## Rekomendasi Prioritas

1. **[High]** `restore.sh`: validasi/whitelist `DB_NAME`/`DB_USER` (regex identifier) & gunakan `createdb`/`dropdb` atau quoting identifier, bukan interpolasi string SQL.
2. **[Medium]** Client: panggil `queryClient.clear()` saat logout (`MainLayout.tsx`) dan pada 401 (`api.ts`) untuk mencegah kebocoran data antar-user.
3. **[Medium]** `update-coa.py`: pindahkan kredensial ke env var; tambah konfirmasi sebelum `delete_all_accounts`.
4. **[Medium]** Backup/restore: parser DATABASE_URL yang benar (tahan karakter khusus) atau wajibkan `POSTGRES_USER/DB` eksplisit.
5. **[Medium]** SQL backfill: bungkus dengan guard lingkungan + assertion `ROW_COUNT`; arsipkan skrip one-off.
6. **[Low]** Standarisasi skrip `.cjs` ke pola `APP_ROOT`; ganti `alert()` lupa-password dengan modal.

---

*Konteks server-side (auth/RBAC enforcement, route security) berada di luar lingkup audit ini tetapi diasumsikan menjadi kontrol akses utama; rekomendasikan memastikan setiap endpoint mutasi memang melewati middleware auth + cek izin sebagaimana komentar kode menyatakan.*
