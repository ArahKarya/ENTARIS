# Entaris — Project Instructions

## Overview

Entaris (Enterprise Agentic Reasoning Integrated System) — sistem ERP penuh untuk mengelola operasi perusahaan (penjualan, pembelian, inventori, keuangan) untuk UKM hingga enterprise. Modul lengkap: penjualan (Quotation→SO→DO→Invoice), pembelian (PO→GR→PI), inventori/gudang (Stock Opname/Transfer), keuangan (COA/GL/Payments/Bank Recon/Fixed Assets), Approvals/Audit Trail. Full-stack TypeScript app dengan pembukuan double-entry otomatis sebagai fondasi setiap transaksi.

## Brand

- Nama produk: **Entaris** — tagline "Agentic Reasoning System"; agen AI: **AIRA**; pembuat: PT Arah Karya Sinergi.
- Panduan merek, logo & warna: `docs/brand/entaris/README.md` (logo "Anyaman ∇" — tiga bilah menganyam segitiga terbalik; navy `#1B2B48`, biru `#3D8BE0`).
- Pengenal teknis lama `simple-erp` (kontrak `app` ke aira-core, nama proses pm2, prefiks file backup `simple_erp_*`) sengaja dipertahankan — jangan diganti tanpa migrasi di sisi aira-core/deploy.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS 4 + TanStack Query 5
- **Backend**: Node.js 20 + Express 5 + TypeScript + Prisma 7
- **Database**: PostgreSQL 16
- **Auth**: JWT di cookie httpOnly + CSRF token (double-submit `csrf-token` cookie → header `X-CSRF-Token`) + bcrypt, roles: Admin / Accountant / StaffProduksi / Viewer
- **Testing**: Vitest (unit), Playwright (E2E)
- **Deploy**: Docker Compose (multi-stage build)

## Project Structure

```
entaris/
├── server/           # Express API + Prisma ORM
│   ├── src/
│   │   ├── routes/       # 43 top-level route files (77 .ts total incl. subfolders)
│   │   ├── middleware/    # auth, auditTrail, rateLimiter
│   │   ├── utils/        # schemas (Zod), documentNumber, accountBalance
│   │   ├── ai/           # registry tool AIRA (aira-tool-router.json = SUMBER TUNGGAL katalog tool), types, validasi
│   │   │   └── catalog/  # inventori route statis, denylist, ekstraksi Zod, generator docs/ai-tools
│   │   ├── constants/    # system account numbers
│   │   └── lib/          # prisma client, logger (Pino)
│   ├── scripts/ai-tools/ # CLI katalog: inventory-routes.ts, generate-docs.ts (output scratch di out/, gitignored)
│   └── prisma/
│       ├── schema.prisma   # 111 models
│       ├── seed.ts
│       └── migrations/
├── client/           # React SPA
│   └── src/
│       ├── pages/        # 80 page files
│       ├── components/   # 147 components (modals, widgets, reports)
│       ├── contexts/     # CompanySettings, Theme
│       ├── hooks/        # useHotkeys
│       └── lib/          # api (Axios), exportExcel, pdf
├── scripts/          # backup, restore, setup-backup
└── docs/             # brand, audits, ERD, ai-tools (katalog tool AIRA/MCP — dibangkitkan)
```

## System Accounts (JANGAN DIHAPUS/DIUBAH)

Akun-akun berikut digunakan untuk auto GL posting. Defined in `server/src/constants/accountNumbers.ts`:

| Code | Nama | Fungsi |
|------|------|--------|
| 1.1.1-5 | Petty Cash, Bank BRI/Mandiri/BRI2/BCA | Cash/Bank accounts |
| 1.2.1 | Piutang Usaha (Dagang) | Auto-debit on sales invoice |
| 1.3 | Uang Muka Pembelian | Vendor deposit account |
| 1.4.0 | Persediaan (Umum) | Inventory account |
| 1.5.6 | Uang Muka Karyawan | Role EMPLOYEE_ADVANCE — debit saat Pengajuan Pembayaran uang muka/perjalanan dinas dibayar |
| 2.1.1 | Hutang Usaha (Dagang) | Auto-credit on purchase invoice |
| 2.1.5 | Hutang Belum Tagih | Accrual saat STT/BPB submit, reversed saat PI submit |
| 4.1 | Penjualan | Auto-credit on sales revenue |
| 4.2 | Pendapatan Jasa | Service revenue |
| 5 | Beban Pokok Penjualan | COGS |
| 5.11 | Selisih Harga Pembelian | Variance harga STT (provisional) vs PI (aktual) |
| 3.1 | Ekuitas Saldo Awal | Opening balance contra account (import/setup) |
| 3.2 | Laba Ditahan | Retained earnings (year-end closing) |
| 3.4 | Laba Tahun Berjalan | Computed current year profit |

## Double-Entry Bookkeeping Rules

Every transaction MUST produce balanced debit/credit GL entries:
- **Sales Invoice submit** (standalone): DR Piutang (1.2.1) / CR Penjualan (4.1)
- **Purchase Invoice submit** (legacy/standalone): DR Persediaan (1.4.0) / CR Hutang (2.1.1)
- **STT/BPB submit** (Phase 2+): DR Persediaan (1.4.0) / CR Hutang Belum Tagih (2.1.5) — accrual
- **PI submit from STT** (Phase 3+): DR Hutang Belum Tagih (2.1.5) + DR/CR Selisih Harga Pembelian (5.11) / CR Hutang Usaha (2.1.1)
- **Payment receive**: DR Kas/Bank (1.1.x) / CR Piutang (1.2.1)
- **Payment pay**: DR Hutang (2.1.1) / CR Kas/Bank (1.1.x)
- **Journal Entry**: Manual balanced entries
- **Tagihan EAM diposting** (Pengajuan Pembayaran > tab Tagihan EAM, finance `payment_request` edit; pajak kendaraan / servis EAM / MR sparepart): JOURNAL = DR akun beban / CR Kas/Bank (lunas); PURCHASE_INVOICE = DR akun beban / CR Hutang Usaha (2.1.1), dilunasi lewat modul Pembayaran; batal posting = void jurnal/faktur. Service log `source='IMPORT'` TIDAK masuk antrian (sudah di GL). Satu-satunya jalur posting: `services/gaFinance.ts` via `services/gaBillQueue.ts`; alias `/api/ga/finance` dan modul RBAC `ga_finance` sudah dihapus (klien hanya mengalihkan bookmark `/ga/finance`)
- **Pengajuan Pembayaran dibayar**: DR akun beban per baris (atau DR Uang Muka Karyawan 1.5.6 utk CASH_ADVANCE/TRAVEL) / CR Kas/Bank (1.1.x); batal bayar = void jurnal
- **Pertanggungjawaban uang muka diposting** (realisasi R vs uang muka A): DR akun beban per baris (R) / CR Uang Muka Karyawan 1.5.6 (min(R,A)); R<A: + DR Kas/Bank (A−R) / CR 1.5.6 (A−R) (pengaju mengembalikan sisa); R>A: + CR Kas/Bank (R−A) (kurang bayar dibayar perusahaan); R=A tanpa baris kas. Satu jurnal seimbang; batal posting = void jurnal. Posting uang muka mengikuti `kind` jenis, tetapi wajib-tidaknya pertanggungjawaban hanya mengikuti `type.requiresSettlement`.

Never create unbalanced GL entries. Always verify total debit === total credit.

## Purchase Flow (Phase 4+)

End-to-end procurement document chain:

```
PO (planning, no GL/stock)
  ↓ optional link
STT/BPB (stok masuk + accrual hutang)
  ↓ optional link
PI (harga aktual + variance + real AP)
  ↓
Payment Pay
```

Each step is **independent** — staff bisa skip PO, atau buat PI standalone
(legacy mode, masih jalan). Untuk PI yang ter-link ke STT:
- Stok TIDAK dibuat ulang (sudah dari STT)
- JV reverse accrual + post variance
- STT.invoiceId di-set

Cancel cascade:
- PO cancel → STT tetap valid
- STT cancel → reverse stok + JV. Block kalau invoice link Paid.
- PI cancel → release STT (clear invoiceId), STT-owned stok tidak terganggu

Historical PI (sebelum refactor) di-backfill jadi virtual STT (`isLegacyBackfill=true`).
JV asli tetap apa adanya, stockMovement tetap ref ke PurchaseInvoice.

## Approval Gate

- `needsApproval(role)` (role tanpa capability `approval.bypass`, default hanya Admin) → dokumen tidak dibuat saat submit; payload disimpan di `ApprovalRequest` dan dieksekusi saat approve (`services/approvalDecision.ts`, aktor = pengaju). Dibuat-baru: `PurchaseInvoice`, `ProductionRun`, `SalesReturn`, `DeliveryOrder`.
- Mutasi dokumen existing juga di-gate (`services/approvalEditRequests.ts`): `ProductionRunEdit` (PUT production-runs/:id → `editProductionRunInTx`) dan `PurchaseInvoiceRevisePrice` (POST invoices/:id/revise-price → `revisePurchaseInvoiceInTx`). `documentId`/`documentNumber` terisi saat request; payload = body asli + `_before` (snapshot untuk perbandingan, dibuang sebelum validasi Zod). Satu pengajuan Pending per target (409). `GET /approvals/requests/:id[/context]` mengembalikan `comparison`; `GET /approvals/pending` untuk badge/disable tombol. Tipe baru tidak bisa "Minta Edit"/resubmit.
- **Input produksi = DRAFT dulu** (`production_run_drafts`, `services/productionRunDraft.ts`, `routes/inventory/productionRunDrafts.ts`): `POST /inventory/production-runs` selalu membuat draft (`DPR-YYYYMM-NNNN`, status `Draft`) tanpa efek stok/GL/WAC/COGS/laporan/OEE — draft tidak terhubung ke konsumen `ProductionRun`. Posting = `POST /production-runs/drafts/:id/post`: role bypass → `submitProductionRunInTx` langsung (201, draft `Posted` + `postedRunId`); non-bypass → `ApprovalRequest` `ProductionRun` (202, draft `PendingApproval`). Approve → run dibuat + draft `Posted` (`approvalDecision`); reject/minta-revisi → draft kembali `Draft` + `lastError`. Klaim draft atomik (`updateMany` where status `Draft`) → tak bisa dobel-posting. Cek stok terjadi saat posting; saat simpan hanya `warnings`. Antrian `ProductionRun` lama (tanpa draft) tetap bisa di-approve. Edit run yang sudah diposting tetap lewat `PUT /:id` (+ approval).
- Menambah aksi finansial baru pada dokumen existing → lewatkan `needsApproval` + tipe edit baru, jangan hanya `requireCap`.

## Katalog Tool AIRA/MCP (`docs/ai-tools/`)

- Registry tunggal: `server/src/ai/aira-tool-router.json` (default semua `enabled:true`; override per tool via `AiToolConfig` / `PATCH /api/ai/config/tools/:name`). Tiap route API baru **wajib** punya tool di registry **atau** entri di `server/src/ai/catalog/denylist.ts` (alasan wajib) — kalau tidak, test `aiToolsCatalog` / `npm run ai-tools:check` gagal.
- Tool write/critical wajib `confirm_template` + `postingEffect` + `draftCapable`; `params` diturunkan dari Zod/query; `toolset` salah satu dari 13 toolset; tier: read=Auto, write=Draft/Approve, critical=Wajib-Approve.
- Setelah mengubah registry/panduan (`docs/ai-tools/_guides/*.md`): `cd server && npm run ai-tools:docs` lalu commit. Jangan edit `docs/ai-tools/*.md` hasil generate secara manual. Arsitektur MCP: `docs/ai-tools/ARSITEKTUR-MCP.md`; pemasangan Hermes: `docs/ai-tools/HERMES-SETUP.md`.

## AIRA sebagai MCP Server (`/mcp`)

- **Satu endpoint** `POST /mcp` (Streamable HTTP stateless; `server/src/mcp/`), dipasang SEBELUM auth `/api` di `index.ts`. Semua tool registry non-denylist + meta-tool `cari_tool`/`dokumen_tool`/`whoami` (+ `panggil_tool` mode ringkas `X-Entaris-Tools: compact`). Tidak ada endpoint per-toolset.
- **Identitas**: `Authorization: Bearer entmcp_…` (token per profil Hermes; hanya sha256 disimpan; signing secret AES-256-GCM, kunci dari env `MCP_SECRET_KEY` / fallback `JWT_SECRET`) + **actor assertion** bertanda tangan per panggilan (`X-Entaris-Actor` base64url JSON `{v,uid,ch,gf,ts,nonce,ref}` + `X-Entaris-Actor-Sig` HMAC-SHA256 hex; TTL 120 dtk; nonce sekali pakai di tabel `mcp_nonces`; boleh juga di `params.arguments._entaris_actor[_sig]`). Tanpa assertion = aktor default token atau 401. User wajib `airaEnabled`; level `airaTier` (`read`/`standard`/`direct`), `airaJabatan` untuk persona.
- **Eksekusi** = handler Express asli lewat loopback dengan JWT 120 dtk atas nama aktor (`via:'mcp'` → `audit_trail.via/via_meta`). Jangan membuat jalur eksekusi tool lain; RBAC/validasi/`needsApproval` harus tetap lewat handler normal.
- **Tier**: read langsung; write langsung hanya bila `draftCapable`; write non-draft + semua critical → `ApprovalRequest` `ai_tool:<nama>` (payload `{tool,args,handler,confirm,actor,via}`), dieksekusi sebagai PENGAJU asli saat disetujui (`mcp/approve.ts` dipanggil `services/approvalDecision.ts`). Level `direct` = langsung (tetap RBAC); `gf=true` menurunkan `direct`→`standard`.
- Kill switch `AiSetting.agenticEnabled` (503 tiap panggilan), rate limit per token (in-memory), body 256 KB, riwayat `mcp_call_logs` (hash argumen), `idempotencyKey` untuk tool tulis. Admin REST: `/api/ai/mcp/*` (`rbac.manage`); UI: Pengaturan → AIRA (MCP) + Manajemen Pengguna (Akses AIRA).
- Jalur lama dipensiunkan: `/api/ai/router`, A3 HMAC, `x-aira-service-token`, whitelist/channel config. Panel chat `/api/ai/chat/*` masih ke aira-core (tahap 3 → Hermes).

## Coding Conventions

### Backend
- Routes in `server/src/routes/` — one file per domain
- Validation with Zod schemas in `server/src/utils/schemas.ts`
- All mutations must pass through `auditTrail` middleware
- Use Prisma ORM, avoid `$queryRaw` unless absolutely necessary
- Document numbers auto-generated via `server/src/utils/documentNumber.ts`
- Logger: use Pino (`server/src/lib/logger.ts`), never `console.log`

### Frontend
- Pages in `client/src/pages/`, components in `client/src/components/`
- API calls via Axios instance (`client/src/lib/api.ts`) with `withCredentials` (auth cookie) + CSRF header interceptor
- Server state with TanStack Query (useQuery/useMutation)
- UI: TailwindCSS utility classes, Lucide icons, Sonner toasts
- Reports support PDF export (@react-pdf/renderer) and Excel export

### Language
- **UI text**: Bahasa Indonesia
- **Code** (variables, functions, comments): English
- **Git commits**: English (conventional commits)

## Development Commands

```bash
# Server (from server/)
npm run dev              # Dev server with hot reload
npm run build            # Compile TypeScript
npm run lint             # ESLint gate (--max-warnings 0): fails on any NEW violation not baselined in eslint-suppressions.json
npm run lint:prune       # Drop stale baseline entries after fixing violations (commit the JSON)
npm run test             # Run Vitest
npm run prisma:migrate   # Create new migration
npm run seed             # Seed database
npm run ai-tools:inventory  # Inventori STATIS semua route API (+guard) -> scripts/ai-tools/out/route-inventory.json
npm run ai-tools:docs       # Bangkitkan docs/ai-tools/ dari registry (idempoten; commit hasilnya)
npm run ai-tools:check      # Drift guard: docs mutakhir + test route<->registry (juga dijalankan CI setelah test)

# Client (from client/)
npm run dev              # Vite dev server :5173
npm run build            # Production build
npm run lint             # ESLint gate (--max-warnings 0): fails on any NEW violation or warning not baselined in eslint-suppressions.json
npm run lint:prune       # Drop stale baseline entries after fixing violations (commit the JSON)
npx tsc -b               # Type-check
npm test                 # Vitest

# CI: .github/workflows/ci.yml (PR + push to main)
#   client: npm ci, lint, tsc -b, test, build
#   server: npm ci, prisma generate, lint, tsc --noEmit, vitest (unit only; integration needs Postgres), ai-tools:check
# Lint baseline workflow: existing violations (mostly legacy `any`) live in
# {client,server}/eslint-suppressions.json (server baseline is mostly legacy `any`). NEW violations and
# ANY warning fail `npm run lint`. After fixing old ones run `npm run lint:prune` in that package and
# commit the JSON. Never re-run `--suppress-all` to silence new code; use a targeted
# `eslint-disable-next-line <rule> -- <reason>` only for justified false positives.

# Docker (from root)
docker compose up -d --build    # Full stack
docker compose logs -f app      # View logs
```

## Default Credentials (Dev/Seed)

| Email | Password | Role |
|-------|----------|------|
| admin@entaris.demo | Adminentaris123!dsw | Admin |
| staff@entaris.demo | Admin123! | Accountant |
| produksi@entaris.demo | Admin123! | StaffProduksi |
| viewer@entaris.demo | Admin123! | Viewer |

## Agent Workflow (Recommended)

1. **Planning**: Use `planner` agent for complex features
2. **TDD**: Use `tdd-guide` agent — write tests first
3. **Implementation**: Write code
4. **Review**: Use `typescript-reviewer` + `code-reviewer` agents
5. **Security**: Use `security-reviewer` agent (financial data!)
6. **Database**: Use `database-reviewer` agent for Prisma/SQL changes
7. **E2E**: Use `e2e-runner` agent with Playwright
8. **Commit**: Follow conventional commits format

## Out of Scope

- HRD (absensi, payroll) — handled by third-party app
