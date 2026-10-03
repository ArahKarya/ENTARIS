# Entaris — Server

Backend Express API untuk Entaris.

## Stack

- **Node.js 20** + TypeScript
- **Express 5**
- **Prisma 7 ORM** (adapter pg — camelCase fields, no snake_case mapping)
- **PostgreSQL 16**
- **Zod** (validasi request body)
- **JWT + bcrypt** (autentikasi)
- **Vitest** (unit testing)
- **Pino** (logging)

## Scripts

```bash
npm run dev              # Dev server dengan hot reload (ts-node-dev)
npm start                # Jalankan build production
npm run build            # Compile TypeScript → dist/
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Jalankan migrasi database
npm run seed             # Seed data awal
npm test                 # Jalankan unit tests
npm run test:watch       # Test watch mode
```

## Environment Variables

Buat file `.env` di direktori ini:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/keuangan_db"
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=keuangan_db

PORT=3001
NODE_ENV=development

# WAJIB diset — server akan exit jika kosong
JWT_SECRET=ganti-dengan-string-panjang-acak-minimal-32-karakter

ALLOWED_ORIGINS="http://localhost:5173"
SEED_ADMIN_PASSWORD=admin123
```

## Struktur Route

| Method | Path | Deskripsi |
|---|---|---|
| POST | `/api/auth/login` | Login, return JWT |
| GET | `/api/coa` | Daftar akun (hierarki) |
| GET | `/api/coa/flat` | Daftar akun (flat) |
| POST | `/api/coa` | Buat akun baru |
| PUT | `/api/coa/:id` | Update akun |
| DELETE | `/api/coa/:id` | Hapus akun |
| GET/POST | `/api/journals` | Jurnal umum |
| GET/POST | `/api/sales/invoices` | Invoice penjualan |
| GET/POST | `/api/purchase/invoices` | Invoice pembelian |
| GET/POST | `/api/payments` | Pembayaran |
| GET/POST | `/api/parties` | Pelanggan & supplier |
| PUT | `/api/parties/:id` | Update party |
| GET/POST | `/api/inventory/items` | Item inventori |
| PUT | `/api/inventory/items/:id` | Update item |
| GET/POST | `/api/inventory/movements` | Mutasi stok |
| PUT | `/api/inventory/movements/:id/cancel` | Batalkan mutasi |
| GET/POST | `/api/inventory/production-runs` | Proses produksi |
| PUT | `/api/inventory/production-runs/:id/cancel` | Batalkan produksi |
| GET | `/api/dashboard/metrics` | KPI metrics |
| GET | `/api/dashboard/charts` | Data grafik |
| GET | `/api/reports/trial-balance` | Neraca saldo |
| GET | `/api/reports/profit-loss` | Laba rugi |
| GET | `/api/reports/balance-sheet` | Neraca |
| GET | `/api/reports/cash-flow` | Arus kas |
| GET | `/api/reports/aging` | Aging AR/AP |
| GET/POST | `/api/fiscal-years` | Tahun fiskal |
| POST | `/api/fiscal-years/:id/close` | Tutup tahun buku |
| GET/PUT | `/api/settings/company` | Pengaturan perusahaan |

## Database Models

`Account`, `Party`, `JournalEntry`, `JournalItem`, `SalesInvoice`, `SalesInvoiceItem`, `PurchaseInvoice`, `PurchaseInvoiceItem`, `Payment`, `PaymentAllocation`, `AccountingLedgerEntry`, `FiscalYear`, `InventoryItem`, `StockMovement`, `ProductionRun`, `ProductionRunItem`, `User`, `AuditLog`, `CompanySettings`

## Catatan Penting Prisma 7

- Menggunakan `@prisma/adapter-pg` (PrismaPg) — bukan koneksi default
- Field tanpa `@map` directive disimpan sebagai **camelCase** di database
- Decimal fields dikembalikan sebagai string-like — selalu wrap dengan `Number()` sebelum aritmatika
- `rootType` di schema (bukan `root_type`)

## Roles

| Role | Akses |
|---|---|
| `Admin` | Full access semua endpoint |
| `Accountant` | Baca + tulis transaksi, tidak bisa kelola user/akun |
| `Viewer` | Read-only |
