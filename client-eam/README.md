# Entaris EAM — Client

Frontend React untuk Entaris EAM (Enterprise Asset Management), bagian dari Entaris — Agentic Reasoning System.

## Stack

- **React 19** + TypeScript
- **Vite** (build tool + dev server)
- **TailwindCSS 4**
- **TanStack Query 5** (server state, caching)
- **React Router DOM** (SPA routing)
- **Recharts** (grafik dashboard)
- **Axios** (HTTP client + JWT interceptor)
- **Lucide React** (icons)

## Scripts

```bash
npm run dev      # Dev server → http://localhost:5173
npm run build    # Production build → dist/
npm run preview  # Preview production build
npm run lint     # ESLint check
```

## Struktur

```
src/
├── pages/
│   ├── Dashboard.tsx
│   ├── COAPage.tsx
│   ├── GeneralLedger.tsx
│   ├── SalesInvoices.tsx
│   ├── PurchaseInvoices.tsx
│   ├── InventoryPage.tsx      # 3 tab: Items, Movements, Produksi
│   ├── Payments.tsx
│   ├── PartiesPage.tsx
│   ├── Settings.tsx
│   ├── LoginPage.tsx
│   ├── Reports.tsx            # Router ke sub-pages
│   └── reports/
│       ├── TrialBalance.tsx
│       ├── ProfitLoss.tsx
│       ├── BalanceSheet.tsx
│       ├── CashFlow.tsx
│       └── AgingAnalysis.tsx
├── components/
│   ├── Sidebar.tsx
│   ├── JournalEntryModal.tsx
│   ├── SalesInvoiceModal.tsx
│   ├── PurchaseInvoiceModal.tsx
│   ├── PaymentModal.tsx
│   ├── PartyFormModal.tsx
│   ├── InventoryItemModal.tsx
│   ├── StockMovementModal.tsx
│   ├── ProductionRunModal.tsx
│   ├── ConfirmDialog.tsx
│   └── ErrorBoundary.tsx
├── lib/
│   ├── api.ts          # Axios instance + JWT header injection
│   ├── formatters.ts   # formatRupiah, formatDate
│   └── utils.ts        # cn() helper
└── layouts/
    └── MainLayout.tsx  # Sidebar + header + breadcrumb
```

## Konfigurasi API

URL backend dikonfigurasi melalui Vite proxy di `vite.config.ts`. Default: `http://localhost:3001`.

## Auth

Token JWT disimpan di `localStorage`. Axios interceptor otomatis menyertakan header `Authorization: Bearer <token>` di setiap request. Respons 401 akan me-redirect user ke halaman login.
