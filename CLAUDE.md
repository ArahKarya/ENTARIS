# Finance-PMD — Project Instructions

## Overview

ERP Keuangan untuk PT Pangan Masa Depan (rice milling). Full-stack TypeScript app with double-entry bookkeeping.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS 4 + TanStack Query 5
- **Backend**: Node.js 20 + Express 5 + TypeScript + Prisma 7
- **Database**: PostgreSQL 16
- **Auth**: JWT + bcrypt, roles: Admin / Accountant / Viewer
- **Testing**: Vitest (unit), Playwright (E2E)
- **Deploy**: Docker Compose (multi-stage build)

## Project Structure

```
finance-pmd/
├── server/           # Express API + Prisma ORM
│   ├── src/
│   │   ├── routes/       # 21 route files (REST endpoints)
│   │   ├── middleware/    # auth, auditTrail, rateLimiter
│   │   ├── utils/        # schemas (Zod), documentNumber, accountBalance
│   │   ├── constants/    # system account numbers
│   │   └── lib/          # prisma client, logger (Pino)
│   └── prisma/
│       ├── schema.prisma
│       ├── seed.ts
│       └── migrations/
├── client/           # React SPA
│   └── src/
│       ├── pages/        # 18 page components
│       ├── components/   # 28 components (modals, widgets, reports)
│       ├── contexts/     # CompanySettings, Theme
│       ├── hooks/        # useHotkeys
│       └── lib/          # api (Axios), exportExcel, pdf
├── scripts/          # backup, restore
└── docs/             # user manual
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
| 4.1 | Penjualan | Auto-credit on sales revenue |
| 4.2 | Pendapatan Jasa | Service revenue |
| 5 | Beban Pokok Penjualan | COGS |
| 3.1 | Ekuitas Saldo Awal | Opening balance contra account (import/setup) |
| 3.2 | Laba Ditahan | Retained earnings (year-end closing) |
| 3.4 | Laba Tahun Berjalan | Computed current year profit |

## Double-Entry Bookkeeping Rules

Every transaction MUST produce balanced debit/credit GL entries:
- **Sales Invoice submit**: DR Piutang (1.2.1) / CR Penjualan (4.1)
- **Purchase Invoice submit**: DR Persediaan (1.4.0) / CR Hutang (2.1.1)
- **Payment receive**: DR Kas/Bank (1.1.x) / CR Piutang (1.2.1)
- **Payment pay**: DR Hutang (2.1.1) / CR Kas/Bank (1.1.x)
- **Journal Entry**: Manual balanced entries

Never create unbalanced GL entries. Always verify total debit === total credit.

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
- API calls via Axios instance (`client/src/lib/api.ts`) with JWT interceptor
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
| staff@keuangan.local | Admin123! | Accountant |
| viewer@keuangan.local | Admin123! | Viewer |

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
- No overlap with ERP Pangan Masa Depan (erp-pangan-masa-depan) production/inventory modules
