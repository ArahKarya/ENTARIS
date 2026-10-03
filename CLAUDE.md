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
│   │   ├── constants/    # system account numbers
│   │   └── lib/          # prisma client, logger (Pino)
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
├── client-eam/       # EAM (Enterprise Asset Management) SPA — SSO via shared cookie, reuses ERP API
├── scripts/          # backup, restore, setup-backup
└── docs/             # brand, audits, ERD, tool coverage
```

## System Accounts (JANGAN DIHAPUS/DIUBAH)

Akun-akun berikut digunakan untuk auto GL posting. Defined in `server/src/constants/accountNumbers.ts`:

| Code | Nama | Fungsi |
|------|------|--------|
| 1.1.1-5 | Petty Cash, Bank BRI/Mandiri/BRI2/BCA | Cash/Bank accounts |
| 1.2.1 | Piutang Usaha (Dagang) | Auto-debit on sales invoice |
| 1.3 | Uang Muka Pembelian | Vendor deposit account |
| 1.4.0 | Persediaan (Umum) | Inventory account |
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
npm run test             # Run Vitest
npm run prisma:migrate   # Create new migration
npm run seed             # Seed database

# Client (from client/)
npm run dev              # Vite dev server :5173
npm run build            # Production build
npm run lint             # ESLint

# Docker (from root)
docker compose up -d --build    # Full stack
docker compose logs -f app      # View logs
```

## Default Credentials (Dev/Seed)

| Email | Password | Role |
|-------|----------|------|
| admin@arahkarya.com | Adminarahkarya123!dsw | Admin |
| staff@entaris.local | Admin123! | Accountant |
| produksi@entaris.local | Admin123! | StaffProduksi |
| viewer@entaris.local | Admin123! | Viewer |

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
