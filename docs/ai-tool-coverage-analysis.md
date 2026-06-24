# AIRA Tool Coverage Analysis — Simple ERP (AKS)

> **Status:** DRAFT untuk review Ndoro. **BELUM di-apply** ke DB/container/runtime.
> Output murni artefak file: registry baru + dokumen ini.
> Tanggal audit: 2026-06-25 · Repo: `~/ArahKarya/simple-erp` (RPi5, source of truth; PMD = fork).

---

## 1. Ringkasan Eksekutif

| Metrik | Nilai |
|---|---|
| Route file diaudit | **73** file (`server/src/routes/**/*.ts`) |
| Endpoint NYATA (router.METHOD) | **~385** endpoint |
| Endpoint dipetakan jadi tool | **309** |
| Endpoint di-EXCLUDE (sengaja) | **76** |
| **Tool registry LAMA (v1)** | **16** |
| **Tool registry BARU (v2 full)** | **309**  (**19×** lebih banyak) |
| Breakdown risk | read **150** · write **105** · critical **54** |
| Modul tercakup | **36 / 36** modul (100%) |
| Validator | **0 error** (309/309 lolos) |

**File output:**
- Registry baru: `server/src/ai/aira-tool-router.full.json` (309 tool, format identik v1, lolos validator).
- Validator standalone: `scripts/validate-aira-config.mjs` (replikasi PERSIS `validateTool()` di `registry.ts`).
- Builder (reproducible): `build_full_registry.py` (definisi compact → emit JSON).
- Dokumen ini: `docs/ai-tool-coverage-analysis.md`.

**Catatan koreksi audit:** task body menyebut "38 modul" — file registry deklarasi `modules` sebenarnya **36** entri (sudah dikonfirmasi dari kode). Body juga menyebut "~376 endpoint / 60+ route file" — angka nyata: **73 route file, ~385 endpoint** (counting `router.get/post/put/patch/delete`).

---

## 2. Metodologi (dibaca dari KODE, bukan tebakan)

1. **Mount map** dari `server/src/index.ts` → prefix path per router (mis. `app.use('/api/sales-orders', requirePerm('sales_order'), salesOrderRoutes)`).
2. **Endpoint extraction**: `grep -rnE "router\.(get|post|patch|put|delete)"` di seluruh `routes/**`, lalu resolve path multi-line (`router.post(\n '/path',`) dengan baca file.
3. **RBAC nyata**: dua lapis —
   - Mount-level `requirePerm(module)` / `requireWrite(module)` (di `index.ts`) → GET=view, tulis=edit.
   - Route-level `requireCap('...')` (di file route) → hak sensitif: `doc.cancel`, `approval.decide`, `rbac.manage`.
   - **roles** tiap tool diturunkan dari `DEFAULT_MATRIX` di `constants/modules.ts` (sumber kebenaran no-regression), bukan ditebak. Admin = super-admin (selalu lolos).
4. **Handler path** tiap tool = `METHOD /api<path-nyata>` hasil resolve mount+route. **0 path karangan** (diverifikasi: semua 309 handler unik & match `^(GET|POST|PUT|PATCH|DELETE) /api/`).
5. **Validasi**: dijalankan `node scripts/validate-aira-config.mjs server/src/ai/aira-tool-router.full.json` → 0 error.

### Aturan klasifikasi `risk`
| risk | kriteria | tier default |
|---|---|---|
| `read` | GET / query / report / list / detail | `auto` |
| `write` | create/update non-finansial, submit dokumen non-GL, master data CRUD ringan | `draft` |
| `critical` | cancel / delete data finansial / posting GL / payment / approve / tutup buku / opname / depresiasi / set akun sistem | `must_approve` |

Tier diturunkan otomatis dari risk via `riskToTier()` (read→auto, write→draft, critical→must_approve). Semua write/critical punya `confirm_template` Bahasa Indonesia (HITL — divalidasi wajib oleh validator).

---

## 3. Coverage per Modul

| Modul | Group UI | read | write | critical | Total | Lama (v1) |
|---|---|--:|--:|--:|--:|--:|
| sales_order | Penjualan | 2 | 4 | 1 | 7 | 1 |
| delivery_order | Penjualan | 3 | 4 | 1 | 8 | 0 |
| sales_invoice | Penjualan | 3 | 4 | 2 | 9 | 1 |
| quotation | Penjualan | 8 | 10 | 3 | 21 | 0 |
| sales_return | Penjualan | 3 | 1 | 1 | 5 | 0 |
| customer_deposit | Penjualan | 2 | 1 | 3 | 6 | 0 |
| purchase_order | Pembelian | 2 | 1 | 1 | 4 | 1 |
| goods_receipt | Pembelian | 3 | 1 | 1 | 5 | 1 |
| purchase_invoice | Pembelian | 2 | 2 | 2 | 6 | 0 |
| vendor_deposit | Pembelian | 2 | 1 | 3 | 6 | 0 |
| inventory | Stok & Produksi | 10 | 4 | 2 | 16 | 1 |
| stock_transfer | Stok & Produksi | 2 | 3 | 1 | 6 | 0 |
| stock_opname | Stok & Produksi | 2 | 0 | 2 | 4 | 0 |
| production | Stok & Produksi | 10 | 8 | 4 | 22 | 1 |
| warehouse | Stok & Produksi | 3 | 2 | 1 | 6 | 0 |
| payment | Bank & Kas | 3 | 1 | 1 | 5 | 3 |
| reconciliation | Bank & Kas | 2 | 4 | 2 | 8 | 0 |
| recurring | Bank & Kas | 1 | 3 | 1 | 5 | 0 |
| project_guarantee | Bank & Kas | 2 | 1 | 3 | 6 | 0 |
| coa | Akuntansi | 2 | 2 | 2 | 6 | 0 |
| journal | Akuntansi | 4 | 0 | 2 | 6 | 1 |
| fixed_assets | Akuntansi | 4 | 2 | 3 | 9 | 0 |
| approvals | Akuntansi | 4 | 5 | 3 | 12 | 0 |
| ga_assets | EAM | 3 | 4 | 1 | 8 | 0 |
| ga_vehicle | EAM | 4 | 5 | 0 | 9 | 0 |
| ga_building | EAM | 2 | 4 | 0 | 6 | 0 |
| ga_equipment | EAM | 2 | 2 | 0 | 4 | 0 |
| ga_maintenance | EAM | 3 | 8 | 1 | 12 | 1 |
| ga_inventory | EAM | 4 | 3 | 0 | 7 | 0 |
| ga_documents | EAM | 2 | 2 | 1 | 5 | 1 |
| ga_master | EAM | 6 | 2 | 0 | 8 | 0 |
| reports | Laporan/Universal | 29 | 0 | 0 | 29 | 3 |
| parties | Master & Sistem | 3 | 2 | 1 | 6 | 1 |
| settings | Master & Sistem | 8 | 4 | 4 | 16 | 0 |
| users | Master & Sistem | 4 | 5 | 1 | 10 | 0 |
| audit | Master & Sistem | 1 | 0 | 0 | 1 | 0 |
| **TOTAL** | | **150** | **105** | **54** | **309** | **16** |

> `settings` & `journal` di tabel mencakup tool yang secara fungsi tergolong tahun-fiskal/pajak/COGS-backfill tapi di-gate modul `settings`/`journal` di `index.ts` (mengikuti RBAC nyata, bukan dikira-kira).

**Coverage = 36/36 modul (100%).** Modul yang sebelumnya 0 tool dan kini terisi: quotation, delivery_order, sales_return, customer_deposit, purchase_invoice, vendor_deposit, stock_transfer, stock_opname, warehouse, reconciliation, recurring, project_guarantee, coa, fixed_assets, approvals, dan seluruh GA kecuali yang sudah ada.

---

## 4. Daftar EXCLUDE (76 endpoint — sengaja TIDAK jadi tool)

Dikelompokkan per alasan. Semua defensible — bukan kelalaian.

### 4.1 AI self-management (8) — agent TIDAK boleh kelola dirinya
`GET/PATCH /api/ai/config/tools[/:name]`, `GET/PUT /api/ai/config/settings`, `GET/POST/DELETE /api/ai/config/whitelist[/:id]`, `POST /api/ai/router`.
**Alasan:** Tool Router mengeksekusi tool; mendaftarkan endpoint config-nya sendiri sebagai tool = loop berbahaya (AIRA bisa mengubah tier/whitelist-nya sendiri, melewati HITL). Self-config harus tetap manual via UI Settings.

### 4.2 File I/O / multipart (13) — agent tak bisa supply file biner
Attachments: `POST /upload`, `POST /counts`, `GET /file/:id`, `GET /:referenceType/:referenceId`, `GET /invoice/.../related`, `DELETE /:id`. Photos: `POST /api/ga/assets/:id/photos`, `DELETE .../photos/:photoId`, `POST /api/ga/maintenance/work-orders/:id/photos`, `POST/GET /api/ga/documents/:id/versions[...]`.
**Alasan:** butuh upload file biner (multipart) — di luar kemampuan tool teks AIRA. Lampiran ikut dokumen induk.

### 4.3 Import CSV (5) — multipart upload
`POST /api/import/{coa,parties,inventory,journals}`, `GET /api/import/template/:type`, `POST /api/fixed-assets/import`.
**Alasan:** sama — butuh file CSV. Import massal = operasi setup, bukan agentic.

### 4.4 Auth & session (4)
`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `PUT /api/users/me/password`.
**Alasan:** bootstrap sesi & kredensial pribadi — bukan aksi bisnis.

### 4.5 Backup & infra ops (8)
`GET/POST /api/backup/{list,create,download,upload,restore}`, `GET /api/health-check[...]`, `POST /api/health-check/fix/:check`.
**Alasan:** operasi sistem berisiko/biner. `backup/restore` sangat destruktif — harus manual Admin.

### 4.6 Public / integrasi (7)
`GET /api/public/branding`, `POST /api/public/inquiry`, `GET /api/ga/public/:qrCode[...]`, `GET/PUT /api/telegram/config`, `POST /api/telegram/test`.
**Alasan:** endpoint publik tanpa auth (QR/branding/inquiry) atau config integrasi yang menyimpan secret (Telegram bot token).

### 4.7 Notifikasi & Telegram-link per-user (5)
`PATCH /api/notifications/:id/read`, `/read-all`, `POST /api/notifications/check`, `POST /api/users/:id/telegram-{link,test}`, `DELETE /api/users/:id/telegram`.
**Alasan:** UI per-user / housekeeping; nilai agentic rendah. (List & unread-count TETAP jadi tool read.)

### 4.8 Dev-only destruktif (3)
`POST /api/settings/{generate-dummy,delete-dummy,reset-data}`.
**Alasan:** generator data dummy & reset DB — hanya dev/seed, JANGAN pernah diekspos ke agent di produksi.

### 4.9 Master-data CRUD ringan EAM (16) & misc (7)
GA master `PUT/DELETE/POST` untuk asset-categories, document-types, inventory-categories, locations, dan beberapa delete (branches/cost-centers); `DELETE` rentals/services/calibration-logs anakan; `POST /api/recurring/run-due` (cron internal); `PATCH /api/ga/vehicle/service-requests/:id/cancel`; `POST /api/reports/export` (file).
**Alasan:** master-data taksonomi jarang diubah lewat chat & lebih aman manual; `run-due` = trigger scheduler internal; `reports/export` = generate file. **List & create cabang/cost-center utama TETAP disertakan** sebagai contoh; sisanya bisa ditambah belakangan bila terbukti perlu.

> Daftar lengkap 76 endpoint tersimpan di `/tmp/aira_excluded.txt` saat audit (regenerable dari builder).

---

## 5. Rekomendasi Prioritas Rollout

Semua 309 tool default **`enabled: false`** kecuali 6 tool read warisan v1 yang relevan (`rpt_dashboard`, `rpt_balance_sheet`, `party_search`, `search_global`) tetap `true`. Aktivasi bertahap per fase berikut:

### 🥇 Fase A — uc#1 Petty Cash / Payment (PRIORITAS, sesuai BRD)
`pay_record`, `pay_list`, `pay_get`, `pay_cash_journals`, `pay_cancel`, `party_search`, `coa_flat`, `rpt_dashboard`.
**Kenapa:** use-case #1 AIRA = input petty cash dari PDF → butuh catat payment + lookup party/akun. Risiko terukur (payment punya cancel + HITL).

### 🥈 Fase B — Read-only intelligence (aman, nilai tinggi, 0 risiko tulis)
Seluruh **150 tool `read`** (laporan, dashboard, list/detail semua modul). Aktifkan lebih dulu karena `tier=auto`, tak ada side-effect. Ini bikin AIRA langsung berguna sebagai "analis tanya-jawab" (omzet, piutang, stok, aging) tanpa risiko.

### 🥉 Fase C — Penjualan & Pembelian operasional
Quotation → SO → DO → SI (`quot_*`, `so_*`, `do_*`, `si_*`) dan PO → GR → PI (`po_*`, `gr_*`, `pi_*`). Semua `write/critical` dengan HITL. Mulai dari `*_create` & `*_list`, tahan `*_cancel` (critical) sampai approval workflow matang.

### Fase D — Akuntansi inti (hati-hati)
`je_create`, `coa_*`, `fa_depreciate*`, `fy_close/reopen`, `opn_create`. **`sysacct_update` & `fy_close` paling berisiko** — sebaiknya tetap `must_approve` + capability gate ketat.

### Fase E — EAM / GA & master data
Maintenance work-order, kendaraan, gedung, equipment, dokumen legal. Nilai agentic menengah (reminder dokumen kadaluarsa `gd_list` menarik untuk proaktif).

---

## 6. Catatan Desain (untuk review)

1. **Granularitas: 1 tool = 1 endpoint.** Schema registry `handler: "METHOD /path"` memang 1 handler per tool → tidak ada opsi multi-aksi dalam 1 tool tanpa ubah `types.ts`/`registry.ts`. Konsisten dengan 16 tool v1. (Bukan keputusan terbuka — dipaksa schema.)
2. **Naming scheme** prefix per modul: `quot_/inq_/so_/do_/si_/sret_/cdep_/po_/gr_/pi_/vdep_/inv_/stf_/opn_/prod_/mach_/wh_/pay_/recon_/rec_/pg_/coa_/je_/fa_/appr_/fy_/tax_/rpt_/party_/svc_/set_/usr_/role_/ga_*/gm_/gi_/gd_/gam_`. 16 nama v1 **dipertahankan apa adanya** (`rpt_dashboard`, `pay_record`, `si_create`, `po_create`, `gr_create`, `je_create`, `so_generate_do`, `prod_run_create`, `gm_wo_create`, `gd_expiring`→ kini bagian `gd_list`, dll). **Tidak ada rename** tool existing kecuali `gd_expiring` digabung ke `gd_list` (parameter `expiringSoon`) — perlu konfirmasi bila ingin pertahankan nama lama.
3. **Approval-dependent tools.** Tool dengan `requiresCapability: approval.decide` (`appr_approve/reject/...`) & `doc.cancel` (semua `*_cancel`, delete finansial) hanya untuk role ber-capability. AIRA harus menghormati ini sebelum eksekusi.
4. **Tool read berat / paginasi.** List endpoint (`*_list`) menerima `page`/`search`/`filter`. AIRA perlu strategi paginasi (default limit 50 dari kode). Report endpoint bisa berat (ledger-book, trial-balance) — pertimbangkan cache.
5. **Potensi konflik / hati-hati:**
   - `sysacct_update` (PUT /api/system-accounts) — mengubah pemetaan auto-GL, **mempengaruhi SEMUA posting**. risk=critical, hanya Admin, confirm tegas. Pertimbangkan untuk TIDAK pernah `enable`.
   - `fy_close` / `opn_create` / `fa_depreciate_bulk` — operasi batch GL skala besar. Wajib approval.
   - `pay_cancel` / `*_cancel` finansial — reverse jurnal. Pastikan AIRA selalu lewat HITL.
6. **PMD parity.** Registry ini disusun dari source AKS. PMD = fork; saat apply nanti, sinkronkan ke ERP PMD (target Tool Router `aplikasi-keuangan-pmd-app-1`) — modul & RBAC identik, jadi registry bisa dipakai ulang.

---

## 7. Verifikasi (dijalankan)

```
$ node scripts/validate-aira-config.mjs server/src/ai/aira-tool-router.full.json
Registry : .../server/src/ai/aira-tool-router.full.json
App      : erp-aks  v2
Modules  : 36
Tools    : 309 total
Loaded   : 309 valid, 0 skipped
By risk  : read=150 write=105 critical=54
✅ VALID — 0 error. 309 tool lolos validator.
```

**TIDAK ada** apply DB / rebuild container / ubah `AiToolConfig` / deploy. Murni artefak file.

---

## 8. Langkah Berikutnya (tahap terpisah, butuh ACC Ndoro)

1. Review registry + dokumen ini.
2. Putuskan rename `gd_expiring`→`gd_list` (ya/tidak) & cakupan GA-master CRUD (tambah/biar).
3. Pilih set Fase A/B untuk di-`enable` lebih dulu.
4. Saat apply: copy `aira-tool-router.full.json` → `aira-tool-router.json` (timpa live), build server (tsc + copyFileSync JSON ke dist/ai/), rebuild container, override enabled per tool via UI Settings / `AiToolConfig`.
5. Sinkron ke ERP PMD.
