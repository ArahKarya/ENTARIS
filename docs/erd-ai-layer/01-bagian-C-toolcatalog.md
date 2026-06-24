# BAGIAN C — PEMETAAN FUNGSI ERP LENGKAP (35 Modul → Tool Agentic)

Setiap modul ERP dipetakan ke tiga jenis tool:
- **READ** (🟢 auto) — query data, laporan, status. Tak mengubah apa pun. Boleh langsung.
- **DRAFT** (🟡 draft) — siapkan dokumen/payload, tampilkan ke user untuk konfirmasi. Belum menyentuh DB.
- **ACTION** (🔴 approve) — submit/cancel dokumen → menyentuh GL/stok/kas. Wajib lewat approval gate.

**Tier izin:**
🟢 = boleh otomatis (read-only) · 🟡 = perlu konfirmasi user di chat · 🔴 = wajib persetujuan owner via Telegram.

Kolom "Endpoint/Service" merujuk kode nyata hasil audit — tool adalah *wrapper tipis* di atasnya.

---

## C1. Grup PENJUALAN

### Modul: Sales Order (SO)
| Tool | Jenis | Tier | Endpoint/Service ERP |
|---|---|---|---|
| `so_list` / `so_get` | READ | 🟢 | `GET /sales-orders`, `/:id` |
| `so_draft` | DRAFT | 🟡 | susun payload `POST /sales-orders` |
| `so_create` | ACTION | 🔴 | `POST /sales-orders` |
| `so_submit` | ACTION | 🔴 | `POST /sales-orders/:id/submit` |
| `so_generate_do` | ACTION | 🔴 | `POST /sales-orders/:id/generate-do` |
| `so_cancel` | ACTION | 🔴 | `POST /sales-orders/:id/cancel` (cap `doc.cancel`) |

### Modul: Delivery Order (Surat Jalan)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `do_list` / `do_pending` / `do_get` | READ | 🟢 | `GET /delivery-orders`, `/pending`, `/:id` |
| `do_draft` | DRAFT | 🟡 | payload `POST /delivery-orders` |
| `do_create` | ACTION | 🔴 | `POST /delivery-orders` (`deliveryOrderSubmit`) |
| `do_from_invoice` | ACTION | 🔴 | `POST /delivery-orders/from-invoice/:invoiceId` |
| `do_cancel` | ACTION | 🔴 | `POST /delivery-orders/:id/cancel` (`deliveryOrderCancel`) |

### Modul: Sales Invoice
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `si_list` / `si_get` | READ | 🟢 | `GET /sales/invoices`, `/:id` |
| `si_draft` | DRAFT | 🟡 | payload `POST /sales/invoices` |
| `si_create` | ACTION | 🔴 | `POST /sales/invoices` (`salesInvoiceSubmit`) — DR Piutang / CR Penjualan |
| `si_cancel` | ACTION | 🔴 | `POST /sales/invoices/:id/cancel` (`invoiceCancellation`) |

### Modul: Quotation & Inquiry
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `quo_list` / `quo_get` / `quo_stats` | READ | 🟢 | `GET /quotations`, `/:id`, `/stats` |
| `quo_draft` | DRAFT | 🟡 | payload `POST /quotations` |
| `quo_create` | ACTION | 🟡 | `POST /quotations` (tak ada efek GL → tier lebih ringan) |
| `quo_send` / `quo_accept` / `quo_reject` | ACTION | 🟡 | `PATCH /quotations/:id/{send,accept,reject}` |
| `quo_convert` | ACTION | 🔴 | `GET /:id/convert-payload` → buat SO |

### Modul: Sales Return (Retur Penjualan)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `sr_list` / `sr_get` | READ | 🟢 | `GET /sales-returns`, `/:id` |
| `sr_create` | ACTION | 🔴 | `POST /sales-returns` (`salesReturnSubmit`) |
| `sr_cancel` | ACTION | 🔴 | (`salesReturnCancel`) cap `doc.cancel` |

### Modul: Customer Deposit (Uang Muka Pelanggan)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `cd_list` / `cd_get` | READ | 🟢 | `GET /customer-deposits` |
| `cd_create` | ACTION | 🔴 | `POST /customer-deposits` |
| `cd_apply` | ACTION | 🔴 | aplikasikan deposit ke invoice |

---

## C2. Grup PEMBELIAN

### Modul: Purchase Order (PO)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `po_list` / `po_get` | READ | 🟢 | `GET /purchase-orders`, `/:id` |
| `po_draft` / `po_create` | DRAFT/ACTION | 🟡/🔴 | `POST /purchase-orders` (`purchaseOrderSubmit`) |
| `po_cancel` | ACTION | 🔴 | `POST /purchase-orders/:id/cancel` |

### Modul: Goods Receipt (BPB/STT)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `gr_list` / `gr_pending` / `gr_get` | READ | 🟢 | `GET /goods-receipts`, `/pending`, `/:id` |
| `gr_create` | ACTION | 🔴 | `POST /goods-receipts` (`goodsReceiptSubmit`) — stok+accrual |
| `gr_cancel` | ACTION | 🔴 | `POST /goods-receipts/:id/cancel` |

### Modul: Purchase Invoice (PI)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `pi_list` / `pi_get` | READ | 🟢 | `GET /purchase/invoices`, `/:id` |
| `pi_create` | ACTION | 🔴 | `POST /purchase/invoices` (`purchaseInvoiceSubmit`) |
| `pi_revise_price` | ACTION | 🔴 | `POST /purchase/invoices/:id/revise-price` (`purchaseInvoiceRevise`) |
| `pi_cancel` | ACTION | 🔴 | `POST /purchase/invoices/:id/cancel` |

### Modul: Vendor Deposit (Uang Muka Vendor)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `vd_list` / `vd_get` | READ | 🟢 | `GET /vendor-deposits` |
| `vd_create` / `vd_apply` | ACTION | 🔴 | `POST /vendor-deposits`, aplikasi |

---

## C3. Grup STOK & PRODUKSI

### Modul: Inventory (Stok & Gudang)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `inv_items` / `inv_item_get` | READ | 🟢 | `GET /inventory/items`, `/:id` |
| `inv_stock` / `inv_low_stock` | READ | 🟢 | `GET /inventory/movements`, `/low-stock` |
| `inv_item_create` / `inv_item_update` | ACTION | 🟡 | `POST/PUT /inventory/items` (master, tak ada GL) |
| `inv_movement` | ACTION | 🔴 | `POST /inventory/movements` (penyesuaian stok) |

### Modul: Stock Transfer
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `st_list` / `st_get` | READ | 🟢 | `GET /stock-transfers`, `/:id` |
| `st_create` | ACTION | 🔴 | `POST /stock-transfers` (`stockTransfer`) |
| `st_cancel` | ACTION | 🔴 | `PATCH /stock-transfers/:id/cancel` |

### Modul: Stock Opname
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `op_list` / `op_get` | READ | 🟢 | `GET /stock-opname`, `/:id` |
| `op_create` | ACTION | 🔴 | `POST /stock-opname` |
| `op_finalize` | ACTION | 🔴 | finalisasi (cap `doc.cancel`) — sesuaikan stok |

### Modul: Produksi (Manufaktur)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `prod_runs` / `prod_run_get` | READ | 🟢 | `GET /production/runs`, `/:id` |
| `prod_oee` / `prod_yield` | READ | 🟢 | `GET /inventory/dashboard/oee`, `/yield-trend` |
| `prod_machines` | READ | 🟢 | `GET /inventory/machines` |
| `prod_run_create` | ACTION | 🔴 | `POST /production/runs` (`productionRunSubmit`) |
| `prod_run_cancel` | ACTION | 🔴 | (`productionRunCancel`) cap `doc.cancel` |

### Modul: Warehouse
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `wh_list` / `wh_get` | READ | 🟢 | `GET /warehouses`, `/:id` |
| `wh_create` / `wh_update` | ACTION | 🟡 | `POST/PUT /warehouses` (master) |

---

## C4. Grup BANK & KAS  ★ Pilot pertama

### Modul: Payment (Transaksi Bank/Kas)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `pay_list` / `pay_get` | READ | 🟢 | `GET /payments`, `/:id` |
| `pay_cash_journals` | READ | 🟢 | `GET /payments/cash-journals` |
| `pay_draft_receive` | DRAFT | 🟡 | susun payload Receive (alokasi ke invoice) |
| `pay_draft_pay` | DRAFT | 🟡 | susun payload Pay (ke hutang) |
| `pay_record` | ACTION | 🔴 | `POST /payments` (`paymentSubmit`) — DR/CR Kas/Bank |
| `pay_cancel` | ACTION | 🔴 | `POST /payments/:id/cancel` |

> PaymentType: Receive / Pay / CustomerDeposit / VendorDeposit / Refund + splits (biaya admin bank) + allocations.

### Modul: Bank Reconciliation
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `recon_list` / `recon_get` | READ | 🟢 | `GET /reconciliation`, `/:id` |
| `recon_create` | ACTION | 🟡 | `POST /reconciliation` |
| `recon_match` / `recon_unmatch` | ACTION | 🟡 | `PATCH /reconciliation/:id/{match,unmatch}` |
| `recon_complete` | ACTION | 🔴 | `POST /reconciliation/:id/complete` |

### Modul: Recurring (Transaksi Berulang)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `rec_list` / `rec_get` | READ | 🟢 | `GET /recurring` |
| `rec_create` / `rec_run` | ACTION | 🔴 | `POST /recurring` (`recurringRunner`) |

### Modul: Project Guarantee (Uang Jaminan)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `pg_list` / `pg_get` | READ | 🟢 | `GET /project-guarantees` |
| `pg_create` / `pg_settle` | ACTION | 🔴 | `POST /project-guarantees`, settlement |

---

## C5. Grup AKUNTANSI

### Modul: COA (Bagan Akun)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `coa_list` / `coa_flat` | READ | 🟢 | `GET /coa`, `/flat` |
| `coa_create` / `coa_update` | ACTION | 🟡 | `POST/PUT /coa` (master) |
| `coa_set_balance` | ACTION | 🔴 | `PATCH /coa/:id/balance` (saldo awal) |

### Modul: Journal (Buku Besar)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `je_list` / `je_get` | READ | 🟢 | `GET /journals`, `/:id` |
| `je_draft` | DRAFT | 🟡 | susun jurnal balanced (transfer antar bank, koreksi) |
| `je_create` | ACTION | 🔴 | `POST /journals` — wajib balanced |
| `je_cancel` | ACTION | 🔴 | `PATCH /journals/:id/cancel` |

### Modul: Fixed Assets (Aset Tetap)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `fa_list` / `fa_get` / `fa_categories` | READ | 🟢 | `GET /fixed-assets`, `/:id`, `/categories` |
| `fa_create` | ACTION | 🔴 | `POST /fixed-assets` |
| `fa_depreciate` | ACTION | 🔴 | jalankan depresiasi (DepreciationEntry) |

### Modul: Approval (Pengajuan)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `appr_list` / `appr_get` | READ | 🟢 | `GET /approvals`, `/:id` |
| `appr_pending` | READ | 🟢 | daftar yang menunggu owner |
| (keputusan approve/reject TIDAK diberikan ke AI — selalu manusia) | — | — | — |

---

## C6. Grup EAM — General Affairs (Manajemen Aset)

### Modul: GA Assets
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `ga_assets` / `ga_asset_get` | READ | 🟢 | `GET /ga/assets`, `/:id` |
| `ga_asset_create` / `ga_asset_update` | ACTION | 🟡 | `POST/PUT /ga/assets` |
| `ga_asset_condition` | ACTION | 🟡 | `PATCH /ga/assets/:id/condition` |

### Modul: GA Vehicle (Kendaraan)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `gv_get` / `gv_services` | READ | 🟢 | `GET /ga/vehicle/assets/:id`, `/services` |
| `gv_service_log` | ACTION | 🟡 | `POST /ga/vehicle/assets/:id/services` |
| `gv_service_request` | ACTION | 🟡 | `POST /ga/vehicle/assets/:id/service-requests` |

### Modul: GA Building (Gedung & Sewa)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `gb_get` / `gb_rentals` | READ | 🟢 | `GET /ga/building/assets/:id`, `/rentals` |
| `gb_rental_create` / `gb_rental_end` | ACTION | 🟡 | `POST/PATCH /ga/building/.../rentals` |

### Modul: GA Equipment & Kalibrasi
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `ge_get` / `ge_calibration` | READ | 🟢 | `GET /ga/equipment/assets/:id/calibration-logs` |
| `ge_calibration_log` | ACTION | 🟡 | `POST /ga/equipment/.../calibration-logs` |

### Modul: GA Maintenance & Work Order
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `gm_schedules` / `gm_work_orders` | READ | 🟢 | `GET /ga/maintenance/schedules`, `/work-orders` |
| `gm_wo_create` | ACTION | 🟡 | `POST /ga/maintenance/work-orders` |
| `gm_wo_assign` / `gm_wo_start` | ACTION | 🟡 | `PATCH /ga/maintenance/work-orders/:id/{assign,start}` |

### Modul: GA Inventory (Sparepart/ATK)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `gi_items` / `gi_low_stock` | READ | 🟢 | `GET /ga/inventory/items`, `/low-stock` |
| `gi_movement` | ACTION | 🟡 | `POST /ga/inventory/movements` |

### Modul: GA Documents (Legal & Sertifikat)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `gd_list` / `gd_get` | READ | 🟢 | `GET /ga/documents`, `/:id` |
| `gd_create` / `gd_version` | ACTION | 🟡 | `POST /ga/documents`, `/versions` |
| `gd_expiring` | READ | 🟢 | dokumen mendekati kedaluwarsa (reminder proaktif) |

### Modul: GA Master Data
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `gmst_branches` / `gmst_cost_centers` | READ | 🟢 | `GET /ga/master/branches`, `/cost-centers` |
| `gmst_*_crud` | ACTION | 🟡 | master CRUD |

---

## C7. Grup LAPORAN

| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `rpt_balance_sheet` | READ | 🟢 | `GET /reports` (neraca) |
| `rpt_income_statement` | READ | 🟢 | laba rugi |
| `rpt_general_ledger` | READ | 🟢 | buku besar |
| `rpt_ar_aging` / `rpt_ap_aging` | READ | 🟢 | umur piutang/hutang |
| `rpt_cash_flow` | READ | 🟢 | arus kas |
| `rpt_stock_valuation` | READ | 🟢 | nilai persediaan |
| `rpt_dashboard` | READ | 🟢 | `GET /dashboard/*` (14 endpoint metrik) |

> Seluruh laporan = tier 🟢 (read-only). Ini "quick win" terbesar: AI menjawab pertanyaan bisnis
> ("berapa laba bulan ini", "piutang jatuh tempo minggu depan") tanpa risiko sama sekali.

---

## C8. Grup MASTER DATA & SISTEM

### Modul: Parties (Pelanggan & Vendor)
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `party_search` / `party_get` | READ | 🟢 | `GET /parties`, `/similar`, `/:id` |
| `party_dashboard` | READ | 🟢 | `GET /parties/dashboard` |
| `party_create` / `party_update` | ACTION | 🟡 | `POST/PUT /parties` (master, deteksi duplikat via `/similar`) |

### Modul: Settings / Users / Audit
| Tool | Jenis | Tier | Endpoint/Service |
|---|---|---|---|
| `audit_search` | READ | 🟢 | `GET /audit` (jejak audit) |
| `settings_get` | READ | 🟢 | `GET /settings` (read-only utk AI) |
| (Users & Settings write TIDAK diberikan ke AI — administratif manusia) | — | 🔴 | — |

---

## C9. Universal Tools (lintas modul)

| Tool | Jenis | Tier | Catatan |
|---|---|---|---|
| `search_global` | READ | 🟢 | `GET /search` — entity resolution (cari dokumen/party/item by teks) |
| `whoami` | READ | 🟢 | cek user & izin dari whitelist |
| `list_my_permissions` | READ | 🟢 | modul/tier yang boleh untuk user ini |
| `explain_document` | READ | 🟢 | rangkum 1 dokumen + relasinya |

---

## C10. Ringkasan Cakupan Tool

| Grup | Modul | Tool READ 🟢 | Tool DRAFT 🟡 | Tool ACTION 🔴 |
|---|---|---|---|---|
| Penjualan | 6 | ~12 | ~6 | ~16 |
| Pembelian | 4 | ~7 | ~3 | ~10 |
| Stok & Produksi | 5 | ~10 | ~2 | ~10 |
| Bank & Kas | 4 | ~7 | ~2 | ~10 |
| Akuntansi | 4 | ~8 | ~2 | ~8 |
| EAM/GA | 8 | ~16 | — | ~16 (mostly 🟡) |
| Laporan | 1 | ~7 | — | — |
| Master & Sistem | 4 | ~6 | — | ~3 |
| Universal | — | 4 | — | — |
| **TOTAL** | **35** | **~77 READ** | **~17 DRAFT** | **~73 ACTION** |

> Strategi rollout (Bagian E) tidak mengaktifkan semua sekaligus — dimulai dari READ (nol risiko) + pilot bank,
> lalu transaksional, lalu EAM.
