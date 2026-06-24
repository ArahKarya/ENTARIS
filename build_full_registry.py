#!/usr/bin/env python3
"""Builder registry AIRA Tool Router FULL.

Mendefinisikan tool secara COMPACT (tuple) lalu emit JSON lengkap yg lolos
validator (scripts/validate-aira-config.mjs). Handler = path NYATA hasil audit
route files. Jalankan: python3 build_full_registry.py

Format compact per tool:
  T(name, group, module, risk, roles, handler, desc,
    inp={}, out={}, confirm=None, cap=None, service=None,
    perm=None, enabled=False, level=1, phase=1)

roles helper:
  ALL   = Admin+Accountant+StaffProduksi+Viewer
  ACC   = Admin+Accountant
  ACCV  = Admin+Accountant+Viewer
  OPS   = Admin+Accountant+StaffProduksi
  ADMIN = Admin
"""
import json, sys, os

HEADER_PATH = os.path.join(os.path.dirname(__file__),
                           "server/src/ai/aira-tool-router.full.json")
OUT_PATH = HEADER_PATH

ALL   = ["Admin", "Accountant", "StaffProduksi", "Viewer"]
ACC   = ["Admin", "Accountant"]
ACCV  = ["Admin", "Accountant", "Viewer"]
OPS   = ["Admin", "Accountant", "StaffProduksi"]
OPSV  = ["Admin", "Accountant", "StaffProduksi", "Viewer"]
ADMIN = ["Admin"]

tools = []

def T(name, group, module, risk, roles, handler, desc,
      inp=None, out=None, confirm=None, cap=None, service=None,
      perm=None, enabled=False, level=1, phase=1):
    if perm is None:
        perm = "view" if risk == "read" else "edit"
    t = {
        "name": name, "group": group, "module": module, "desc": desc,
        "risk": risk, "roles": roles,
        "input": inp or {}, "output": out or {},
        "handler": handler, "permAction": perm,
        "enabled": enabled, "level": level, "phase": phase,
    }
    if service: t["service"] = service
    if cap: t["requiresCapability"] = cap
    if confirm: t["confirm_template"] = confirm
    tools.append(t)

# ════════════════════════════════════════════════════════════════════
# MODUL: PENJUALAN
# ════════════════════════════════════════════════════════════════════
G_SALES = "Penjualan"

# ── Quotation (Penawaran) ──
T("quot_list", G_SALES, "quotation", "read", ACCV, "GET /api/quotations",
  "Daftar penawaran (filter status/party/tanggal).",
  inp={"status": "string", "partyId": "string", "page": "number"}, out={"items": "array"})
T("quot_stats", G_SALES, "quotation", "read", ACCV, "GET /api/quotations/stats",
  "Statistik penawaran (jumlah per status, nilai).", out={"stats": "object"})
T("quot_get", G_SALES, "quotation", "read", ACCV, "GET /api/quotations/:id",
  "Detail satu penawaran.", inp={"id": "string"}, out={"quotation": "object"})
T("quot_create", G_SALES, "quotation", "write", ACC, "POST /api/quotations",
  "Buat penawaran (non-binding, tanpa GL).",
  inp={"date": "date", "validUntil": "date", "partyId": "string", "items": "array"},
  out={"id": "string", "number": "string"},
  confirm="Buat Penawaran untuk {partyId}, {items} item, berlaku s/d {validUntil}. Setujui?")
T("quot_update", G_SALES, "quotation", "write", ACC, "PUT /api/quotations/:id",
  "Ubah penawaran (selama belum dikonversi).",
  inp={"id": "string", "items": "array"}, out={"id": "string"},
  confirm="Ubah Penawaran {id}. Setujui?")
T("quot_delete", G_SALES, "quotation", "critical", ACC, "DELETE /api/quotations/:id",
  "Hapus penawaran (draft).", inp={"id": "string"}, out={"status": "string"},
  confirm="HAPUS Penawaran {id}? Aksi permanen.")
T("quot_send", G_SALES, "quotation", "write", ACC, "PATCH /api/quotations/:id/send",
  "Tandai penawaran terkirim ke pelanggan.", inp={"id": "string"}, out={"status": "string"},
  confirm="Tandai Penawaran {id} sebagai TERKIRIM. Setujui?")
T("quot_accept", G_SALES, "quotation", "write", ACC, "PATCH /api/quotations/:id/accept",
  "Tandai penawaran diterima pelanggan.", inp={"id": "string"}, out={"status": "string"},
  confirm="Tandai Penawaran {id} DITERIMA pelanggan. Setujui?")
T("quot_reject", G_SALES, "quotation", "write", ACC, "PATCH /api/quotations/:id/reject",
  "Tandai penawaran ditolak pelanggan.", inp={"id": "string"}, out={"status": "string"},
  confirm="Tandai Penawaran {id} DITOLAK pelanggan. Setujui?")
T("quot_cancel", G_SALES, "quotation", "critical", ACC, "PATCH /api/quotations/:id/cancel",
  "Batalkan penawaran.", inp={"id": "string"}, out={"status": "string"}, cap="doc.cancel",
  confirm="BATALKAN Penawaran {id}? Aksi ini perlu hak doc.cancel.")
T("quot_convert_payload", G_SALES, "quotation", "read", ACCV, "GET /api/quotations/:id/convert-payload",
  "Ambil payload untuk konversi penawaran → SO/invoice.", inp={"id": "string"}, out={"payload": "object"})
T("quot_link", G_SALES, "quotation", "write", ACC, "POST /api/quotations/:id/link",
  "Tautkan penawaran ke dokumen turunan (SO/invoice).", inp={"id": "string", "targetId": "string"},
  out={"status": "string"}, confirm="Tautkan Penawaran {id} ke dokumen {targetId}. Setujui?")

# ── Inquiry (Permintaan) ──
T("inq_list", G_SALES, "quotation", "read", ACCV, "GET /api/inquiries",
  "Daftar inquiry/permintaan masuk dari pelanggan.", inp={"status": "string"}, out={"items": "array"})
T("inq_stats", G_SALES, "quotation", "read", ACCV, "GET /api/inquiries/stats",
  "Statistik inquiry per status.", out={"stats": "object"})
T("inq_get", G_SALES, "quotation", "read", ACCV, "GET /api/inquiries/:id",
  "Detail satu inquiry.", inp={"id": "string"}, out={"inquiry": "object"})
T("inq_create", G_SALES, "quotation", "write", ACC, "POST /api/inquiries",
  "Catat inquiry baru.", inp={"partyId": "string", "items": "array"}, out={"id": "string"},
  confirm="Catat Inquiry baru. Setujui?")
T("inq_update", G_SALES, "quotation", "write", ACC, "PUT /api/inquiries/:id",
  "Ubah inquiry.", inp={"id": "string"}, out={"id": "string"},
  confirm="Ubah Inquiry {id}. Setujui?")
T("inq_delete", G_SALES, "quotation", "critical", ACC, "DELETE /api/inquiries/:id",
  "Hapus inquiry.", inp={"id": "string"}, out={"status": "string"},
  confirm="HAPUS Inquiry {id}? Aksi permanen.")
T("inq_set_status", G_SALES, "quotation", "write", ACC, "PATCH /api/inquiries/:id/status",
  "Ubah status inquiry.", inp={"id": "string", "status": "string"}, out={"status": "string"},
  confirm="Ubah status Inquiry {id} → {status}. Setujui?")
T("inq_convert_payload", G_SALES, "quotation", "read", ACCV, "GET /api/inquiries/:id/convert-payload",
  "Ambil payload konversi inquiry → penawaran.", inp={"id": "string"}, out={"payload": "object"})
T("inq_link", G_SALES, "quotation", "write", ACC, "POST /api/inquiries/:id/link",
  "Tautkan inquiry ke penawaran.", inp={"id": "string", "targetId": "string"}, out={"status": "string"},
  confirm="Tautkan Inquiry {id} ke {targetId}. Setujui?")

# ── Sales Order (SO) ──
T("so_list", G_SALES, "sales_order", "read", OPSV, "GET /api/sales-orders",
  "Daftar Sales Order (filter status/party/tanggal/cari).",
  inp={"status": "string", "partyId": "string", "search": "string", "page": "number"}, out={"items": "array"})
T("so_get", G_SALES, "sales_order", "read", OPSV, "GET /api/sales-orders/:id",
  "Detail satu Sales Order.", inp={"id": "string"}, out={"salesOrder": "object"})
T("so_create", G_SALES, "sales_order", "write", OPS, "POST /api/sales-orders",
  "Buat Sales Order (komitmen jual, tanpa GL/stok).",
  inp={"date": "date", "partyId": "string", "items": "array"}, out={"id": "string", "number": "string"},
  confirm="Buat Sales Order untuk {partyId}, {items} item. Setujui?")
T("so_update", G_SALES, "sales_order", "write", OPS, "PUT /api/sales-orders/:id",
  "Ubah Sales Order (selama draft).", inp={"id": "string", "items": "array"}, out={"id": "string"},
  confirm="Ubah Sales Order {id}. Setujui?")
T("so_submit", G_SALES, "sales_order", "write", OPS, "POST /api/sales-orders/:id/submit",
  "Submit Sales Order (kunci, siap proses DO).", inp={"id": "string"}, out={"status": "string"},
  confirm="Submit Sales Order {id}? Setelah submit jadi komitmen.")
T("so_cancel", G_SALES, "sales_order", "critical", OPS, "POST /api/sales-orders/:id/cancel",
  "Batalkan Sales Order.", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  confirm="BATALKAN Sales Order {id}? Alasan: {reason}.")
T("so_generate_do", G_SALES, "sales_order", "write", OPS, "POST /api/sales-orders/:id/generate-do",
  "Buat Surat Jalan (DO) dari Sales Order (stok keluar).",
  inp={"id": "string", "date": "date", "items": "array"}, out={"doId": "string", "number": "string"},
  enabled=False, phase=3,
  confirm="Buat Surat Jalan dari SO {id}, {items} baris. Setujui? (stok keluar)")

# ── Delivery Order (DO / Surat Jalan) ──
T("do_list", G_SALES, "delivery_order", "read", OPSV, "GET /api/delivery-orders",
  "Daftar Surat Jalan.", inp={"status": "string", "page": "number"}, out={"items": "array"})
T("do_pending", G_SALES, "delivery_order", "read", OPSV, "GET /api/delivery-orders/pending",
  "Surat Jalan pending (belum di-invoice).", out={"items": "array"})
T("do_get", G_SALES, "delivery_order", "read", OPSV, "GET /api/delivery-orders/:id",
  "Detail satu Surat Jalan.", inp={"id": "string"}, out={"deliveryOrder": "object"})
T("do_create", G_SALES, "delivery_order", "write", OPS, "POST /api/delivery-orders",
  "Buat Surat Jalan standalone (stok keluar).",
  inp={"partyId": "string", "items": "array", "date": "date"}, out={"id": "string", "number": "string"},
  confirm="Buat Surat Jalan untuk {partyId}, {items} item. Setujui? (stok keluar)")
T("do_from_invoice", G_SALES, "delivery_order", "write", OPS, "POST /api/delivery-orders/from-invoice/:invoiceId",
  "Buat Surat Jalan dari Invoice Penjualan.", inp={"invoiceId": "string"}, out={"id": "string"},
  confirm="Buat Surat Jalan dari Invoice {invoiceId}. Setujui?")
T("do_patch", G_SALES, "delivery_order", "write", OPS, "PATCH /api/delivery-orders/:id",
  "Ubah sebagian field Surat Jalan (mobil/driver/catatan).", inp={"id": "string"}, out={"id": "string"},
  confirm="Ubah Surat Jalan {id}. Setujui?")
T("do_update", G_SALES, "delivery_order", "write", OPS, "PUT /api/delivery-orders/:id",
  "Ubah Surat Jalan (full).", inp={"id": "string", "items": "array"}, out={"id": "string"},
  confirm="Ubah Surat Jalan {id} (full). Setujui?")
T("do_cancel", G_SALES, "delivery_order", "critical", OPS, "POST /api/delivery-orders/:id/cancel",
  "Batalkan Surat Jalan (reverse stok).", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  cap="doc.cancel", confirm="BATALKAN Surat Jalan {id}? Alasan: {reason}. Reverse stok keluar.")

# ── Sales Invoice (Invoice Penjualan) ──
T("si_list", G_SALES, "sales_invoice", "read", ACCV, "GET /api/sales/invoices",
  "Daftar Invoice Penjualan.", inp={"status": "string", "page": "number"}, out={"items": "array"})
T("si_get", G_SALES, "sales_invoice", "read", ACCV, "GET /api/sales/invoices/:id",
  "Detail satu Invoice Penjualan.", inp={"id": "string"}, out={"invoice": "object"})
T("si_create", G_SALES, "sales_invoice", "write", ACC, "POST /api/sales/invoices",
  "Buat Invoice Penjualan (DR Piutang / CR Penjualan).",
  inp={"partyId": "string", "items": "array", "date": "date"}, out={"id": "string", "number": "string"},
  service="salesInvoiceSubmit", enabled=False, phase=3,
  confirm="Buat Invoice Penjualan untuk {partyId}, {items} item. Setujui? (posting GL)")
T("si_update", G_SALES, "sales_invoice", "write", ACC, "PUT /api/sales/invoices/:id",
  "Ubah Invoice Penjualan (draft).", inp={"id": "string", "items": "array"}, out={"id": "string"},
  confirm="Ubah Invoice Penjualan {id}. Setujui?")
T("si_cancel", G_SALES, "sales_invoice", "critical", ACC, "POST /api/sales/invoices/:id/cancel",
  "Batalkan Invoice Penjualan (reverse GL + stok).", inp={"id": "string", "reason": "string"},
  out={"status": "string"}, cap="doc.cancel",
  confirm="BATALKAN Invoice Penjualan {id}? Alasan: {reason}. Reverse jurnal + stok.")

# ── Sales Return (Retur Penjualan) ──
T("sret_list", G_SALES, "sales_return", "read", OPSV, "GET /api/sales-returns",
  "Daftar Retur Penjualan.", inp={"page": "number"}, out={"items": "array"})
T("sret_eligible", G_SALES, "sales_return", "read", OPSV, "GET /api/sales-returns/eligible/:invoiceId",
  "Baris invoice yang masih bisa diretur.", inp={"invoiceId": "string"}, out={"items": "array"})
T("sret_get", G_SALES, "sales_return", "read", OPSV, "GET /api/sales-returns/:id",
  "Detail satu Retur Penjualan.", inp={"id": "string"}, out={"salesReturn": "object"})
T("sret_create", G_SALES, "sales_return", "write", OPS, "POST /api/sales-returns",
  "Buat Retur Penjualan (stok masuk + reverse penjualan).",
  inp={"salesInvoiceId": "string", "items": "array", "date": "date"}, out={"id": "string", "number": "string"},
  confirm="Buat Retur Penjualan dari Invoice {salesInvoiceId}, {items} baris. Setujui? (posting GL + stok)")
T("sret_cancel", G_SALES, "sales_return", "critical", OPS, "POST /api/sales-returns/:id/cancel",
  "Batalkan Retur Penjualan (reverse).", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  cap="doc.cancel", confirm="BATALKAN Retur Penjualan {id}? Alasan: {reason}.")

# ── Customer Deposit (Uang Muka Pelanggan) ──
T("cdep_list", G_SALES, "customer_deposit", "read", ACCV, "GET /api/customer-deposits",
  "Daftar uang muka pelanggan.", inp={"partyId": "string"}, out={"items": "array"})
T("cdep_balance", G_SALES, "customer_deposit", "read", ACCV, "GET /api/customer-deposits/balance/:partyId",
  "Saldo uang muka per pelanggan.", inp={"partyId": "string"}, out={"balance": "number"})
T("cdep_apply", G_SALES, "customer_deposit", "write", ACC, "POST /api/customer-deposits/apply",
  "Aplikasikan uang muka pelanggan ke invoice.",
  inp={"depositPaymentId": "string", "salesInvoiceId": "string", "amount": "number"}, out={"status": "string"},
  confirm="Aplikasikan DP pelanggan Rp {amount} ke Invoice {salesInvoiceId}. Setujui?")
T("cdep_apply_cancel", G_SALES, "customer_deposit", "critical", ACC, "POST /api/customer-deposits/apply/:id/cancel",
  "Batalkan aplikasi uang muka pelanggan.", inp={"id": "string"}, out={"status": "string"}, cap="doc.cancel",
  confirm="BATALKAN aplikasi DP pelanggan {id}? Reverse alokasi.")
T("cdep_cancel", G_SALES, "customer_deposit", "critical", ACC, "PATCH /api/customer-deposits/:id/cancel",
  "Batalkan uang muka pelanggan.", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  confirm="BATALKAN uang muka pelanggan {id}? Alasan: {reason}.")
T("cdep_refund", G_SALES, "customer_deposit", "critical", ACC, "POST /api/customer-deposits/:id/refund",
  "Refund/offset sisa uang muka pelanggan (kas + offset piutang).",
  inp={"id": "string", "cashAmount": "number", "offsetAmount": "number", "accountId": "string"},
  out={"status": "string"},
  confirm="Refund/offset uang muka pelanggan {id} (kas {cashAmount}, offset {offsetAmount}). Setujui?")

# ════════════════════════════════════════════════════════════════════
# MODUL: PEMBELIAN
# ════════════════════════════════════════════════════════════════════
G_PUR = "Pembelian"

# ── Purchase Order (PO) ──
T("po_list", G_PUR, "purchase_order", "read", OPSV, "GET /api/purchase-orders",
  "Daftar Purchase Order.", inp={"status": "string", "partyId": "string", "page": "number"}, out={"items": "array"})
T("po_get", G_PUR, "purchase_order", "read", OPSV, "GET /api/purchase-orders/:id",
  "Detail satu Purchase Order.", inp={"id": "string"}, out={"purchaseOrder": "object"})
T("po_create", G_PUR, "purchase_order", "write", OPS, "POST /api/purchase-orders",
  "Buat Purchase Order (planning, tanpa GL/stok).",
  inp={"partyId": "string", "items": "array", "date": "date"}, out={"id": "string", "number": "string"},
  service="purchaseOrderSubmit", enabled=False, phase=3,
  confirm="Buat PO ke {partyId} untuk {items} item. Setujui?")
T("po_cancel", G_PUR, "purchase_order", "critical", OPS, "POST /api/purchase-orders/:id/cancel",
  "Batalkan Purchase Order.", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  cap="doc.cancel", confirm="BATALKAN PO {id}? Alasan: {reason}.")

# ── Goods Receipt (BPB/STT — Penerimaan Barang) ──
T("gr_list", G_PUR, "goods_receipt", "read", OPSV, "GET /api/goods-receipts",
  "Daftar Penerimaan Barang (BPB/STT).", inp={"partyId": "string", "page": "number"}, out={"items": "array"})
T("gr_pending", G_PUR, "goods_receipt", "read", OPSV, "GET /api/goods-receipts/pending",
  "Penerimaan barang pending (belum di-invoice).", out={"items": "array"})
T("gr_get", G_PUR, "goods_receipt", "read", OPSV, "GET /api/goods-receipts/:id",
  "Detail satu Penerimaan Barang.", inp={"id": "string"}, out={"goodsReceipt": "object"})
T("gr_create", G_PUR, "goods_receipt", "write", OPS, "POST /api/goods-receipts",
  "Catat Penerimaan Barang (stok masuk + accrual hutang).",
  inp={"partyId": "string", "items": "array", "date": "date", "purchaseOrderId": "string"},
  out={"id": "string", "number": "string"}, service="goodsReceiptSubmit", enabled=False, phase=3,
  confirm="Catat penerimaan barang dari {partyId}, {items} item. Setujui? (stok masuk + accrual)")
T("gr_cancel", G_PUR, "goods_receipt", "critical", OPS, "POST /api/goods-receipts/:id/cancel",
  "Batalkan Penerimaan Barang (reverse stok + accrual).", inp={"id": "string", "reason": "string"},
  out={"status": "string"}, cap="doc.cancel",
  confirm="BATALKAN Penerimaan Barang {id}? Alasan: {reason}. Reverse stok + jurnal.")

# ── Purchase Invoice (Invoice Pembelian) ──
T("pi_list", G_PUR, "purchase_invoice", "read", OPSV, "GET /api/purchase/invoices",
  "Daftar Invoice Pembelian.", inp={"status": "string", "page": "number"}, out={"items": "array"})
T("pi_get", G_PUR, "purchase_invoice", "read", OPSV, "GET /api/purchase/invoices/:id",
  "Detail satu Invoice Pembelian.", inp={"id": "string"}, out={"invoice": "object"})
T("pi_create", G_PUR, "purchase_invoice", "write", ACC, "POST /api/purchase/invoices",
  "Buat Invoice Pembelian (harga aktual + AP).",
  inp={"partyId": "string", "items": "array", "date": "date"}, out={"id": "string", "number": "string"},
  confirm="Buat Invoice Pembelian dari {partyId}, {items} item. Setujui? (posting GL hutang)")
T("pi_update", G_PUR, "purchase_invoice", "write", ACC, "PUT /api/purchase/invoices/:id",
  "Ubah Invoice Pembelian (draft).", inp={"id": "string", "items": "array"}, out={"id": "string"},
  confirm="Ubah Invoice Pembelian {id}. Setujui?")
T("pi_revise_price", G_PUR, "purchase_invoice", "critical", ACC, "POST /api/purchase/invoices/:id/revise-price",
  "Revisi harga Invoice Pembelian (post variance ke 5.11).",
  inp={"id": "string", "lines": "array", "reason": "string"}, out={"status": "string"},
  confirm="Revisi harga Invoice Pembelian {id}? Alasan: {reason}. Posting selisih harga.")
T("pi_cancel", G_PUR, "purchase_invoice", "critical", ACC, "POST /api/purchase/invoices/:id/cancel",
  "Batalkan Invoice Pembelian (reverse GL).", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  cap="doc.cancel", confirm="BATALKAN Invoice Pembelian {id}? Alasan: {reason}. Reverse jurnal.")

# ── Vendor Deposit (Uang Muka Vendor) ──
T("vdep_list", G_PUR, "vendor_deposit", "read", OPSV, "GET /api/vendor-deposits",
  "Daftar uang muka vendor.", inp={"partyId": "string"}, out={"items": "array"})
T("vdep_balance", G_PUR, "vendor_deposit", "read", OPSV, "GET /api/vendor-deposits/balance/:partyId",
  "Saldo uang muka per vendor.", inp={"partyId": "string"}, out={"balance": "number"})
T("vdep_apply", G_PUR, "vendor_deposit", "write", ACC, "POST /api/vendor-deposits/apply",
  "Aplikasikan uang muka vendor ke invoice pembelian.",
  inp={"depositPaymentId": "string", "purchaseInvoiceId": "string", "amount": "number"}, out={"status": "string"},
  confirm="Aplikasikan uang muka vendor Rp {amount} ke Invoice {purchaseInvoiceId}. Setujui?")
T("vdep_apply_cancel", G_PUR, "vendor_deposit", "critical", ACC, "POST /api/vendor-deposits/apply/:id/cancel",
  "Batalkan aplikasi uang muka vendor.", inp={"id": "string"}, out={"status": "string"}, cap="doc.cancel",
  confirm="BATALKAN aplikasi uang muka vendor {id}? Reverse alokasi.")
T("vdep_cancel", G_PUR, "vendor_deposit", "critical", ACC, "PATCH /api/vendor-deposits/:id/cancel",
  "Batalkan uang muka vendor.", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  confirm="BATALKAN uang muka vendor {id}? Alasan: {reason}.")
T("vdep_refund", G_PUR, "vendor_deposit", "critical", ACC, "POST /api/vendor-deposits/:id/refund",
  "Refund uang muka vendor.", inp={"id": "string", "amount": "number", "accountId": "string"},
  out={"status": "string"}, confirm="Refund uang muka vendor {id} Rp {amount}. Setujui?")

# ════════════════════════════════════════════════════════════════════
# MODUL: STOK & PRODUKSI
# ════════════════════════════════════════════════════════════════════
G_STOCK = "Stok & Produksi"

# ── Inventory Items ──
T("inv_items_list", G_STOCK, "inventory", "read", OPSV, "GET /api/inventory/items",
  "Daftar item stok (cari/filter).", inp={"search": "string", "page": "number"}, out={"items": "array"})
T("inv_item_batches", G_STOCK, "inventory", "read", OPSV, "GET /api/inventory/items/:id/batches",
  "Daftar batch (lot + harga) per item.", inp={"id": "string"}, out={"batches": "array"})
T("inv_low_stock", G_STOCK, "inventory", "read", OPS, "GET /api/inventory/items/low-stock",
  "Daftar item stok di bawah titik minimum (reorder point).", out={"items": "array"},
  enabled=False)
T("inv_item_create", G_STOCK, "inventory", "write", OPS, "POST /api/inventory/items",
  "Buat item stok baru (master).", inp={"name": "string", "unit": "string", "category": "string"},
  out={"id": "string"}, confirm="Buat item stok baru '{name}'. Setujui?")
T("inv_item_update", G_STOCK, "inventory", "write", OPS, "PUT /api/inventory/items/:id",
  "Ubah item stok.", inp={"id": "string"}, out={"id": "string"},
  confirm="Ubah item stok {id}. Setujui?")
T("inv_item_delete", G_STOCK, "inventory", "critical", OPS, "DELETE /api/inventory/items/:id",
  "Hapus item stok.", inp={"id": "string"}, out={"status": "string"},
  confirm="HAPUS item stok {id}? Pastikan tak ada transaksi terkait.")

# ── Inventory Movements (Stok Masuk/Keluar Manual) ──
T("inv_mov_list", G_STOCK, "inventory", "read", OPSV, "GET /api/inventory/movements",
  "Daftar pergerakan stok.", inp={"itemId": "string", "page": "number"}, out={"items": "array"})
T("inv_mov_get", G_STOCK, "inventory", "read", OPSV, "GET /api/inventory/movements/:id",
  "Detail satu pergerakan stok.", inp={"id": "string"}, out={"movement": "object"})
T("inv_mov_create", G_STOCK, "inventory", "write", OPS, "POST /api/inventory/movements",
  "Catat pergerakan stok manual (masuk/keluar/adjust).",
  inp={"itemId": "string", "type": "string", "quantity": "number", "warehouseId": "string"},
  out={"id": "string"}, confirm="Catat pergerakan stok {type} {quantity} item {itemId}. Setujui?")
T("inv_mov_update", G_STOCK, "inventory", "write", OPS, "PUT /api/inventory/movements/:id",
  "Ubah pergerakan stok (draft).", inp={"id": "string"}, out={"id": "string"},
  confirm="Ubah pergerakan stok {id}. Setujui?")
T("inv_mov_cancel", G_STOCK, "inventory", "critical", OPS, "PUT /api/inventory/movements/:id/cancel",
  "Batalkan pergerakan stok (reverse).", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  cap="doc.cancel", confirm="BATALKAN pergerakan stok {id}? Alasan: {reason}.")

# ── Inventory Dashboard (Stok) ──
T("inv_dash_metrics", G_STOCK, "inventory", "read", OPSV, "GET /api/inventory/dashboard/metrics",
  "Metrik ringkas stok (nilai, jumlah item).", out={"metrics": "object"})
T("inv_dash_by_category", G_STOCK, "inventory", "read", OPSV, "GET /api/inventory/dashboard/by-category",
  "Nilai stok per kategori.", out={"items": "array"})
T("inv_dash_movement_trend", G_STOCK, "inventory", "read", OPSV, "GET /api/inventory/dashboard/movement-trend",
  "Tren pergerakan stok.", out={"series": "array"})
T("inv_dash_top_items", G_STOCK, "inventory", "read", OPSV, "GET /api/inventory/dashboard/top-items",
  "Item stok teratas (nilai/pergerakan).", out={"items": "array"})
T("inv_dash_recent_movements", G_STOCK, "inventory", "read", OPSV, "GET /api/inventory/dashboard/recent-movements",
  "Pergerakan stok terbaru.", out={"items": "array"})

# ── Production Dashboard ──
T("prod_dash_stats", G_STOCK, "production", "read", OPS, "GET /api/inventory/dashboard/production-stats",
  "Statistik produksi ringkas.", out={"stats": "object"})
T("prod_dash_production", G_STOCK, "production", "read", OPS, "GET /api/inventory/dashboard/production",
  "Data dashboard produksi (detail).", out={"data": "object"})
T("prod_dash_yield_trend", G_STOCK, "production", "read", OPS, "GET /api/inventory/dashboard/yield-trend",
  "Tren yield produksi.", out={"series": "array"})
T("prod_dash_oee", G_STOCK, "production", "read", OPS, "GET /api/inventory/dashboard/oee",
  "Metrik OEE mesin produksi.", out={"oee": "object"})

# ── Production Runs ──
T("prod_run_list", G_STOCK, "production", "read", OPS, "GET /api/inventory/production-runs",
  "Daftar Production Run.", inp={"page": "number"}, out={"items": "array"})
T("prod_run_get", G_STOCK, "production", "read", OPS, "GET /api/inventory/production-runs/:id",
  "Detail satu Production Run.", inp={"id": "string"}, out={"run": "object"})
T("prod_run_create", G_STOCK, "production", "write", ["Admin", "StaffProduksi"], "POST /api/inventory/production-runs",
  "Buat Production Run (proses produksi: input → output stok).",
  inp={"items": "array", "machineId": "string"}, out={"id": "string"}, service="productionRunSubmit",
  enabled=False, phase=4, confirm="Mulai Production Run {items} item di mesin {machineId}. Setujui?")
T("prod_run_update", G_STOCK, "production", "write", ["Admin", "StaffProduksi"], "PUT /api/inventory/production-runs/:id",
  "Ubah Production Run (draft).", inp={"id": "string"}, out={"id": "string"},
  confirm="Ubah Production Run {id}. Setujui?")
T("prod_run_cancel", G_STOCK, "production", "critical", ["Admin", "StaffProduksi"], "PUT /api/inventory/production-runs/:id/cancel",
  "Batalkan Production Run (reverse stok).", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  cap="doc.cancel", confirm="BATALKAN Production Run {id}? Alasan: {reason}. Reverse stok.")

# ── Production Processes (master) ──
T("prod_proc_list", G_STOCK, "production", "read", OPS, "GET /api/inventory/production-processes",
  "Daftar proses produksi (master).", out={"items": "array"})
T("prod_proc_create", G_STOCK, "production", "write", ["Admin", "StaffProduksi"], "POST /api/inventory/production-processes",
  "Buat proses produksi (master).", inp={"name": "string"}, out={"id": "string"},
  confirm="Buat proses produksi '{name}'. Setujui?")
T("prod_proc_update", G_STOCK, "production", "write", ["Admin", "StaffProduksi"], "PUT /api/inventory/production-processes/:id",
  "Ubah proses produksi.", inp={"id": "string"}, out={"id": "string"},
  confirm="Ubah proses produksi {id}. Setujui?")
T("prod_proc_delete", G_STOCK, "production", "critical", ["Admin", "StaffProduksi"], "DELETE /api/inventory/production-processes/:id",
  "Hapus proses produksi.", inp={"id": "string"}, out={"status": "string"}, cap="doc.cancel",
  confirm="HAPUS proses produksi {id}?")

# ── Production Cost Standards (master) ──
T("prod_cost_list", G_STOCK, "production", "read", OPS, "GET /api/inventory/production-cost-standards",
  "Daftar standar biaya produksi.", out={"items": "array"})
T("prod_cost_create", G_STOCK, "production", "write", ["Admin", "StaffProduksi"], "POST /api/inventory/production-cost-standards",
  "Buat standar biaya produksi.", inp={"name": "string"}, out={"id": "string"},
  confirm="Buat standar biaya produksi '{name}'. Setujui?")
T("prod_cost_update", G_STOCK, "production", "write", ["Admin", "StaffProduksi"], "PUT /api/inventory/production-cost-standards/:id",
  "Ubah standar biaya produksi.", inp={"id": "string"}, out={"id": "string"},
  confirm="Ubah standar biaya produksi {id}. Setujui?")
T("prod_cost_delete", G_STOCK, "production", "critical", ["Admin", "StaffProduksi"], "DELETE /api/inventory/production-cost-standards/:id",
  "Hapus standar biaya produksi.", inp={"id": "string"}, out={"status": "string"}, cap="doc.cancel",
  confirm="HAPUS standar biaya produksi {id}?")

# ── Machines (master) ──
T("mach_list", G_STOCK, "production", "read", OPS, "GET /api/inventory/machines",
  "Daftar mesin produksi.", out={"items": "array"})
T("mach_get", G_STOCK, "production", "read", OPS, "GET /api/inventory/machines/:id",
  "Detail satu mesin.", inp={"id": "string"}, out={"machine": "object"})
T("mach_create", G_STOCK, "production", "write", ["Admin", "StaffProduksi"], "POST /api/inventory/machines",
  "Buat mesin (master).", inp={"name": "string"}, out={"id": "string"},
  confirm="Buat mesin '{name}'. Setujui?")
T("mach_update", G_STOCK, "production", "write", ["Admin", "StaffProduksi"], "PUT /api/inventory/machines/:id",
  "Ubah mesin.", inp={"id": "string"}, out={"id": "string"}, confirm="Ubah mesin {id}. Setujui?")
T("mach_delete", G_STOCK, "production", "critical", ["Admin", "StaffProduksi"], "DELETE /api/inventory/machines/:id",
  "Hapus mesin.", inp={"id": "string"}, out={"status": "string"}, confirm="HAPUS mesin {id}?")

# ── Stock Transfer ──
T("stf_list", G_STOCK, "stock_transfer", "read", OPSV, "GET /api/stock-transfers",
  "Daftar Transfer Stok antar gudang.", inp={"page": "number"}, out={"items": "array"})
T("stf_get", G_STOCK, "stock_transfer", "read", OPSV, "GET /api/stock-transfers/:id",
  "Detail satu Transfer Stok.", inp={"id": "string"}, out={"transfer": "object"})
T("stf_create", G_STOCK, "stock_transfer", "write", OPS, "POST /api/stock-transfers",
  "Buat Transfer Stok antar gudang.",
  inp={"fromWarehouseId": "string", "toWarehouseId": "string", "items": "array"}, out={"id": "string"},
  confirm="Transfer stok dari gudang {fromWarehouseId} ke {toWarehouseId}, {items} item. Setujui?")
T("stf_update", G_STOCK, "stock_transfer", "write", OPS, "PATCH /api/stock-transfers/:id",
  "Ubah Transfer Stok (draft).", inp={"id": "string"}, out={"id": "string"},
  confirm="Ubah Transfer Stok {id}. Setujui?")
T("stf_mark_printed", G_STOCK, "stock_transfer", "write", OPS, "POST /api/stock-transfers/:id/mark-printed",
  "Tandai Transfer Stok sudah dicetak.", inp={"id": "string"}, out={"status": "string"},
  confirm="Tandai Transfer Stok {id} sudah dicetak. Setujui?")
T("stf_cancel", G_STOCK, "stock_transfer", "critical", OPS, "PATCH /api/stock-transfers/:id/cancel",
  "Batalkan Transfer Stok (reverse).", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  confirm="BATALKAN Transfer Stok {id}? Alasan: {reason}.")

# ── Stock Opname ──
T("opn_list", G_STOCK, "stock_opname", "read", ACCV, "GET /api/stock-opname",
  "Daftar Stok Opname.", inp={"page": "number"}, out={"items": "array"})
T("opn_get", G_STOCK, "stock_opname", "read", ACCV, "GET /api/stock-opname/:id",
  "Detail satu Stok Opname.", inp={"id": "string"}, out={"opname": "object"})
T("opn_create", G_STOCK, "stock_opname", "critical", ACC, "POST /api/stock-opname",
  "Buat & finalisasi Stok Opname (adjust stok + jurnal selisih).",
  inp={"warehouseId": "string", "items": "array", "date": "date"}, out={"id": "string", "number": "string"},
  confirm="Finalisasi Stok Opname gudang {warehouseId}, {items} baris? Adjust stok + jurnal selisih.")
T("opn_cancel", G_STOCK, "stock_opname", "critical", ACC, "PUT /api/stock-opname/:id/cancel",
  "Batalkan Stok Opname (reverse adjustment).", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  cap="doc.cancel", confirm="BATALKAN Stok Opname {id}? Alasan: {reason}. Reverse adjustment.")

# ── Warehouse (master) ──
T("wh_list", G_STOCK, "warehouse", "read", OPSV, "GET /api/warehouses",
  "Daftar gudang.", out={"items": "array"})
T("wh_stock_snapshot", G_STOCK, "warehouse", "read", OPSV, "GET /api/warehouses/stock-snapshot",
  "Snapshot stok semua gudang.", out={"snapshot": "array"})
T("wh_get", G_STOCK, "warehouse", "read", OPSV, "GET /api/warehouses/:id",
  "Detail satu gudang.", inp={"id": "string"}, out={"warehouse": "object"})
T("wh_create", G_STOCK, "warehouse", "write", OPS, "POST /api/warehouses",
  "Buat gudang baru (master).", inp={"name": "string", "code": "string"}, out={"id": "string"},
  confirm="Buat gudang '{name}'. Setujui?")
T("wh_update", G_STOCK, "warehouse", "write", OPS, "PUT /api/warehouses/:id",
  "Ubah gudang.", inp={"id": "string"}, out={"id": "string"}, confirm="Ubah gudang {id}. Setujui?")
T("wh_delete", G_STOCK, "warehouse", "critical", OPS, "DELETE /api/warehouses/:id",
  "Hapus gudang.", inp={"id": "string"}, out={"status": "string"}, cap="doc.cancel",
  confirm="HAPUS gudang {id}? Pastikan kosong.")

# ════════════════════════════════════════════════════════════════════
# MODUL: BANK & KAS
# ════════════════════════════════════════════════════════════════════
G_BANK = "Bank & Kas"

# ── Payments ──
T("pay_list", G_BANK, "payment", "read", ACC, "GET /api/payments",
  "Daftar transaksi bank/kas.", inp={"page": "number"}, out={"items": "array"}, enabled=False, phase=2)
T("pay_cash_journals", G_BANK, "payment", "read", ACC, "GET /api/payments/cash-journals",
  "Daftar jurnal kas (buku kas).", out={"items": "array"})
T("pay_get", G_BANK, "payment", "read", ACC, "GET /api/payments/:id",
  "Detail satu transaksi bank/kas.", inp={"id": "string"}, out={"payment": "object"})
T("pay_record", G_BANK, "payment", "write", ACC, "POST /api/payments",
  "Catat transaksi bank (terima/bayar/DP/refund) + alokasi ke invoice. PILOT uc#1.",
  inp={"paymentType": "string", "amount": "number", "accountId": "string", "partyId": "string", "allocations": "array"},
  out={"id": "string", "number": "string", "status": "string"}, service="paymentSubmit",
  enabled=False, phase=2,
  confirm="Catat {paymentType} Rp {amount} (akun {accountId}, pihak {partyId}). Setujui? (posting GL)")
T("pay_cancel", G_BANK, "payment", "critical", ADMIN, "POST /api/payments/:id/cancel",
  "Batalkan transaksi bank (reverse GL).", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  cap="doc.cancel", enabled=False, phase=2,
  confirm="BATALKAN transaksi bank {id}? Alasan: {reason}. Reverse jurnal.")

# ── Reconciliation ──
T("recon_list", G_BANK, "reconciliation", "read", ACC, "GET /api/reconciliation",
  "Daftar rekonsiliasi bank.", out={"items": "array"})
T("recon_get", G_BANK, "reconciliation", "read", ACC, "GET /api/reconciliation/:id",
  "Detail satu rekonsiliasi.", inp={"id": "string"}, out={"recon": "object"})
T("recon_create", G_BANK, "reconciliation", "write", ACC, "POST /api/reconciliation",
  "Buat sesi rekonsiliasi bank.", inp={"accountId": "string", "statementDate": "date"}, out={"id": "string"},
  confirm="Buat rekonsiliasi bank akun {accountId} per {statementDate}. Setujui?")
T("recon_add_items", G_BANK, "reconciliation", "write", ACC, "POST /api/reconciliation/:id/items",
  "Tambah item mutasi ke rekonsiliasi.", inp={"id": "string", "items": "array"}, out={"status": "string"},
  confirm="Tambah {items} item ke rekonsiliasi {id}. Setujui?")
T("recon_match", G_BANK, "reconciliation", "write", ACC, "PATCH /api/reconciliation/:id/match",
  "Cocokkan item rekonsiliasi.", inp={"id": "string", "itemIds": "array"}, out={"status": "string"},
  confirm="Cocokkan item rekonsiliasi {id}. Setujui?")
T("recon_unmatch", G_BANK, "reconciliation", "write", ACC, "PATCH /api/reconciliation/:id/unmatch",
  "Batalkan pencocokan item rekonsiliasi.", inp={"id": "string", "itemIds": "array"}, out={"status": "string"},
  confirm="Batalkan pencocokan item rekonsiliasi {id}. Setujui?")
T("recon_complete", G_BANK, "reconciliation", "critical", ACC, "POST /api/reconciliation/:id/complete",
  "Selesaikan rekonsiliasi (kunci).", inp={"id": "string"}, out={"status": "string"},
  confirm="Selesaikan & KUNCI rekonsiliasi {id}? Setelah ini tak bisa diubah.")
T("recon_delete", G_BANK, "reconciliation", "critical", ACC, "DELETE /api/reconciliation/:id",
  "Hapus sesi rekonsiliasi.", inp={"id": "string"}, out={"status": "string"},
  confirm="HAPUS rekonsiliasi {id}?")

# ── Recurring ──
T("rec_list", G_BANK, "recurring", "read", ACC, "GET /api/recurring",
  "Daftar transaksi berulang.", out={"items": "array"})
T("rec_create", G_BANK, "recurring", "write", ACC, "POST /api/recurring",
  "Buat template transaksi berulang.", inp={"name": "string", "schedule": "string"}, out={"id": "string"},
  confirm="Buat transaksi berulang '{name}' jadwal {schedule}. Setujui?")
T("rec_update", G_BANK, "recurring", "write", ACC, "PUT /api/recurring/:id",
  "Ubah transaksi berulang.", inp={"id": "string"}, out={"id": "string"},
  confirm="Ubah transaksi berulang {id}. Setujui?")
T("rec_delete", G_BANK, "recurring", "critical", ACC, "DELETE /api/recurring/:id",
  "Hapus transaksi berulang.", inp={"id": "string"}, out={"status": "string"},
  confirm="HAPUS transaksi berulang {id}?")
T("rec_execute", G_BANK, "recurring", "write", ACC, "POST /api/recurring/:id/execute",
  "Jalankan transaksi berulang sekali (generate dokumen).", inp={"id": "string"}, out={"status": "string"},
  confirm="Jalankan transaksi berulang {id} sekarang? Akan generate dokumen.")

# ── Project Guarantee (Uang Jaminan Proyek) ──
T("pg_list", G_BANK, "project_guarantee", "read", ACCV, "GET /api/project-guarantees",
  "Daftar uang jaminan proyek.", out={"items": "array"})
T("pg_get", G_BANK, "project_guarantee", "read", ACCV, "GET /api/project-guarantees/:id",
  "Detail satu uang jaminan proyek.", inp={"id": "string"}, out={"guarantee": "object"})
T("pg_create", G_BANK, "project_guarantee", "write", ACC, "POST /api/project-guarantees",
  "Catat uang jaminan proyek (setor jaminan).",
  inp={"partyId": "string", "amount": "number", "accountId": "string"}, out={"id": "string"},
  confirm="Catat uang jaminan proyek Rp {amount} ke {partyId}. Setujui?")
T("pg_settle", G_BANK, "project_guarantee", "critical", ACC, "POST /api/project-guarantees/:id/settle",
  "Selesaikan/cairkan uang jaminan proyek.", inp={"id": "string", "amount": "number"}, out={"status": "string"},
  confirm="Selesaikan uang jaminan proyek {id} Rp {amount}? Posting GL.")
T("pg_cancel", G_BANK, "project_guarantee", "critical", ACC, "PATCH /api/project-guarantees/:id/cancel",
  "Batalkan uang jaminan proyek.", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  cap="doc.cancel", confirm="BATALKAN uang jaminan proyek {id}? Alasan: {reason}.")
T("pg_settlement_cancel", G_BANK, "project_guarantee", "critical", ACC, "POST /api/project-guarantees/settlements/:id/cancel",
  "Batalkan penyelesaian uang jaminan.", inp={"id": "string"}, out={"status": "string"}, cap="doc.cancel",
  confirm="BATALKAN penyelesaian jaminan {id}? Reverse GL.")

# ════════════════════════════════════════════════════════════════════
# MODUL: AKUNTANSI
# ════════════════════════════════════════════════════════════════════
G_ACCT = "Akuntansi"

# ── COA ──
T("coa_list", G_ACCT, "coa", "read", OPSV, "GET /api/coa",
  "Bagan akun (tree).", out={"accounts": "array"})
T("coa_flat", G_ACCT, "coa", "read", OPSV, "GET /api/coa/flat",
  "Bagan akun (flat list, untuk dropdown).", out={"accounts": "array"})
T("coa_create", G_ACCT, "coa", "write", ACC, "POST /api/coa",
  "Buat akun baru (COA).", inp={"code": "string", "name": "string", "type": "string"}, out={"id": "string"},
  confirm="Buat akun {code} '{name}'. Setujui?")
T("coa_update", G_ACCT, "coa", "write", ACC, "PUT /api/coa/:id",
  "Ubah akun COA.", inp={"id": "string"}, out={"id": "string"}, confirm="Ubah akun COA {id}. Setujui?")
T("coa_set_balance", G_ACCT, "coa", "critical", ACC, "PATCH /api/coa/:id/balance",
  "Set saldo awal akun (opening balance).", inp={"id": "string", "amount": "number"}, out={"status": "string"},
  confirm="Set saldo awal akun {id} = Rp {amount}? Mempengaruhi neraca awal.")
T("coa_delete", G_ACCT, "coa", "critical", ACC, "DELETE /api/coa/:id",
  "Hapus akun COA.", inp={"id": "string"}, out={"status": "string"}, cap="doc.cancel",
  confirm="HAPUS akun COA {id}? Pastikan tak ada transaksi.")

# ── Journals ──
T("je_list", G_ACCT, "journal", "read", ACCV, "GET /api/journals",
  "Daftar jurnal (buku besar).", inp={"startDate": "date", "endDate": "date", "search": "string", "page": "number"},
  out={"items": "array"})
T("je_get", G_ACCT, "journal", "read", ACCV, "GET /api/journals/:id",
  "Detail satu jurnal.", inp={"id": "string"}, out={"journal": "object"})
T("je_create", G_ACCT, "journal", "critical", ACC, "POST /api/journals",
  "Buat jurnal manual (wajib balanced). Transfer antar bank / koreksi.",
  inp={"date": "date", "narration": "string", "items": "array"}, out={"id": "string", "number": "string"},
  enabled=False, phase=4,
  confirm="Buat jurnal: {narration}, {items} baris (harus balanced). Setujui? (posting GL)")
T("je_cancel", G_ACCT, "journal", "critical", ACC, "PATCH /api/journals/:id/cancel",
  "Batalkan jurnal (reverse).", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  confirm="BATALKAN jurnal {id}? Alasan: {reason}. Reverse posting.")

# ── COGS Backfill ──
T("cogs_backfill_list", G_ACCT, "journal", "read", ACC, "GET /api/cogs-backfill",
  "Daftar kandidat backfill COGS.", out={"items": "array"})
T("cogs_backfill_summary", G_ACCT, "journal", "read", ACC, "GET /api/cogs-backfill/summary",
  "Ringkasan backfill COGS.", out={"summary": "object"})

# ── Fixed Assets ──
T("fa_list", G_ACCT, "fixed_assets", "read", ACCV, "GET /api/fixed-assets",
  "Daftar aset tetap.", inp={"page": "number"}, out={"items": "array"})
T("fa_categories", G_ACCT, "fixed_assets", "read", ACCV, "GET /api/fixed-assets/categories",
  "Daftar kategori aset tetap.", out={"items": "array"})
T("fa_get", G_ACCT, "fixed_assets", "read", ACCV, "GET /api/fixed-assets/:id",
  "Detail satu aset tetap.", inp={"id": "string"}, out={"asset": "object"})
T("fa_summary_by_category", G_ACCT, "fixed_assets", "read", ACCV, "GET /api/fixed-assets/summary/by-category",
  "Ringkasan aset tetap per kategori.", out={"items": "array"})
T("fa_create", G_ACCT, "fixed_assets", "write", ACC, "POST /api/fixed-assets",
  "Catat aset tetap baru.", inp={"name": "string", "cost": "number", "acquisitionDate": "date"}, out={"id": "string"},
  confirm="Catat aset tetap '{name}' Rp {cost}. Setujui?")
T("fa_update", G_ACCT, "fixed_assets", "write", ACC, "PUT /api/fixed-assets/:id",
  "Ubah aset tetap.", inp={"id": "string"}, out={"id": "string"}, confirm="Ubah aset tetap {id}. Setujui?")
T("fa_depreciate", G_ACCT, "fixed_assets", "critical", ACC, "POST /api/fixed-assets/:id/depreciate",
  "Jalankan penyusutan satu aset (posting GL).", inp={"id": "string", "period": "string"}, out={"status": "string"},
  confirm="Susutkan aset {id} periode {period}? Posting GL beban penyusutan.")
T("fa_depreciate_bulk", G_ACCT, "fixed_assets", "critical", ACC, "POST /api/fixed-assets/depreciate-bulk",
  "Jalankan penyusutan massal semua aset periode.", inp={"period": "string"}, out={"status": "string"},
  confirm="Susutkan SEMUA aset periode {period}? Posting GL massal.")
T("fa_dispose", G_ACCT, "fixed_assets", "critical", ACC, "POST /api/fixed-assets/:id/dispose",
  "Pelepasan aset tetap (jual/hapus + GL untung-rugi).", inp={"id": "string", "proceeds": "number"}, out={"status": "string"},
  confirm="Lepas aset {id} (hasil Rp {proceeds})? Posting GL untung/rugi pelepasan.")

# ── Approvals ──
T("appr_rules_list", G_ACCT, "approvals", "read", ADMIN, "GET /api/approvals/rules",
  "Daftar aturan approval.", out={"rules": "array"}, cap="approval.decide")
T("appr_rule_create", G_ACCT, "approvals", "write", ADMIN, "POST /api/approvals/rules",
  "Buat aturan approval.", inp={"module": "string", "threshold": "number"}, out={"id": "string"},
  cap="approval.decide", confirm="Buat aturan approval modul {module} threshold {threshold}. Setujui?")
T("appr_rule_update", G_ACCT, "approvals", "write", ADMIN, "PUT /api/approvals/rules/:id",
  "Ubah aturan approval.", inp={"id": "string"}, out={"id": "string"}, cap="approval.decide",
  confirm="Ubah aturan approval {id}. Setujui?")
T("appr_rule_delete", G_ACCT, "approvals", "critical", ADMIN, "DELETE /api/approvals/rules/:id",
  "Hapus aturan approval.", inp={"id": "string"}, out={"status": "string"}, cap="approval.decide",
  confirm="HAPUS aturan approval {id}?")
T("appr_requests_list", G_ACCT, "approvals", "read", OPSV, "GET /api/approvals/requests",
  "Daftar pengajuan approval.", inp={"status": "string"}, out={"items": "array"})
T("appr_request_get", G_ACCT, "approvals", "read", OPSV, "GET /api/approvals/requests/:id",
  "Detail satu pengajuan.", inp={"id": "string"}, out={"request": "object"})
T("appr_request_create", G_ACCT, "approvals", "write", OPS, "POST /api/approvals/requests",
  "Buat pengajuan approval.", inp={"module": "string", "refId": "string"}, out={"id": "string"},
  confirm="Buat pengajuan approval modul {module} ref {refId}. Setujui?")
T("appr_approve", G_ACCT, "approvals", "critical", ADMIN, "POST /api/approvals/requests/:id/approve",
  "Setujui pengajuan.", inp={"id": "string", "note": "string"}, out={"status": "string"}, cap="approval.decide",
  confirm="SETUJUI pengajuan {id}? Catatan: {note}.")
T("appr_reject", G_ACCT, "approvals", "critical", ADMIN, "POST /api/approvals/requests/:id/reject",
  "Tolak pengajuan.", inp={"id": "string", "note": "string"}, out={"status": "string"}, cap="approval.decide",
  confirm="TOLAK pengajuan {id}? Catatan: {note}.")
T("appr_request_revision", G_ACCT, "approvals", "write", ADMIN, "POST /api/approvals/requests/:id/request-revision",
  "Minta revisi pengajuan.", inp={"id": "string", "note": "string"}, out={"status": "string"}, cap="approval.decide",
  confirm="Minta REVISI pengajuan {id}? Catatan: {note}.")
T("appr_resubmit", G_ACCT, "approvals", "write", OPS, "PUT /api/approvals/requests/:id/resubmit",
  "Ajukan ulang pengajuan setelah revisi.", inp={"id": "string"}, out={"status": "string"},
  confirm="Ajukan ulang pengajuan {id}. Setujui?")
T("appr_check", G_ACCT, "approvals", "read", OPSV, "GET /api/approvals/check",
  "Cek apakah aksi butuh approval.", inp={"module": "string", "amount": "number"}, out={"required": "boolean"})

# ── Fiscal Years ──
T("fy_list", G_ACCT, "settings", "read", ACCV, "GET /api/fiscal-years",
  "Daftar tahun fiskal.", out={"items": "array"})
T("fy_create", G_ACCT, "settings", "write", ACC, "POST /api/fiscal-years",
  "Buat tahun fiskal.", inp={"year": "number", "startDate": "date", "endDate": "date"}, out={"id": "string"},
  confirm="Buat tahun fiskal {year}. Setujui?")
T("fy_close", G_ACCT, "settings", "critical", ACC, "POST /api/fiscal-years/:id/close",
  "Tutup buku tahun fiskal (closing entries).", inp={"id": "string"}, out={"status": "string"}, cap="doc.cancel",
  confirm="TUTUP BUKU tahun fiskal {id}? Generate closing entries. Aksi besar.")
T("fy_reopen", G_ACCT, "settings", "critical", ACC, "POST /api/fiscal-years/:id/reopen",
  "Buka kembali tahun fiskal yang sudah ditutup.", inp={"id": "string"}, out={"status": "string"}, cap="doc.cancel",
  confirm="BUKA KEMBALI tahun fiskal {id}? Reverse closing entries.")

# ── Tax ──
T("tax_get_config", G_ACCT, "settings", "read", ACCV, "GET /api/tax/config",
  "Konfigurasi pajak (PPN/PPh).", out={"config": "object"})
T("tax_report", G_ACCT, "reports", "read", ACCV, "GET /api/tax/report",
  "Laporan pajak per periode.", inp={"period": "string"}, out={"report": "object"})
T("tax_create_config", G_ACCT, "settings", "write", ACC, "POST /api/tax/config",
  "Tambah konfigurasi pajak.", inp={"name": "string", "rate": "number"}, out={"id": "string"},
  confirm="Tambah konfigurasi pajak '{name}' {rate}%. Setujui?")
T("tax_update_config", G_ACCT, "settings", "write", ACC, "PUT /api/tax/config/:id",
  "Ubah konfigurasi pajak.", inp={"id": "string"}, out={"id": "string"},
  confirm="Ubah konfigurasi pajak {id}. Setujui?")
T("tax_delete_config", G_ACCT, "settings", "critical", ACC, "DELETE /api/tax/config/:id",
  "Hapus konfigurasi pajak.", inp={"id": "string"}, out={"status": "string"}, cap="doc.cancel",
  confirm="HAPUS konfigurasi pajak {id}?")

# ════════════════════════════════════════════════════════════════════
# MODUL: LAPORAN
# ════════════════════════════════════════════════════════════════════
G_RPT = "Laporan"

T("rpt_dashboard", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/metrics",
  "Metrik ringkas dashboard (omzet, piutang, hutang, kas).", out={"metrics": "object"}, enabled=True)
T("rpt_dash_charts", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/charts",
  "Data chart dashboard.", out={"charts": "object"})
T("rpt_dash_top_customers", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/top-customers",
  "Pelanggan teratas (omzet).", out={"items": "array"})
T("rpt_dash_top_vendors", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/top-vendors",
  "Vendor teratas (pembelian).", out={"items": "array"})
T("rpt_dash_overdue", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/overdue",
  "Invoice jatuh tempo / lewat tempo.", out={"items": "array"})
T("rpt_dash_expense_breakdown", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/expense-breakdown",
  "Rincian beban per kategori.", out={"items": "array"})
T("rpt_dash_stock_alerts", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/stock-alerts",
  "Peringatan stok (rendah/minus).", out={"items": "array"})
T("rpt_dash_pending_do", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/pending-do",
  "Surat Jalan pending.", out={"items": "array"})
T("rpt_dash_negative_stock", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/negative-stock",
  "Item dengan stok minus.", out={"items": "array"})
T("rpt_dash_cash_flow", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/cash-flow",
  "Arus kas ringkas dashboard.", out={"data": "object"})
T("rpt_dash_financial_ratios", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/financial-ratios",
  "Rasio keuangan ringkas.", out={"ratios": "object"})
T("rpt_dash_monthly_profit", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/monthly-profit",
  "Laba bulanan.", out={"series": "array"})
T("rpt_dash_aging_summary", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/aging-summary",
  "Ringkasan umur piutang/hutang.", out={"summary": "object"})
T("rpt_dash_cash_position", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/cash-position",
  "Posisi kas/bank saat ini.", out={"positions": "array"})

T("rpt_trial_balance", G_RPT, "reports", "read", ACCV, "GET /api/reports/trial-balance",
  "Neraca saldo (trial balance) per periode.", inp={"period": "string"}, out={"report": "object"})
T("rpt_profit_loss", G_RPT, "reports", "read", ACCV, "GET /api/reports/profit-loss",
  "Laporan laba rugi per periode.", inp={"period": "string"}, out={"report": "object"})
T("rpt_balance_sheet", G_RPT, "reports", "read", ACCV, "GET /api/reports/balance-sheet",
  "Laporan neraca (balance sheet) per periode.", inp={"period": "string"}, out={"report": "object"}, enabled=True)
T("rpt_cash_flow", G_RPT, "reports", "read", ACCV, "GET /api/reports/cash-flow",
  "Laporan arus kas per periode.", inp={"period": "string"}, out={"report": "object"})
T("rpt_aging", G_RPT, "reports", "read", ACCV, "GET /api/reports/aging",
  "Laporan umur piutang/hutang.", inp={"type": "string"}, out={"report": "object"})
T("rpt_ledger_detail", G_RPT, "reports", "read", ACCV, "GET /api/reports/ledger-detail",
  "Detail buku besar per akun.", inp={"accountId": "string", "period": "string"}, out={"report": "object"})
T("rpt_ledger_book", G_RPT, "reports", "read", ACCV, "GET /api/reports/ledger-book",
  "Buku besar lengkap.", inp={"period": "string"}, out={"report": "object"})

T("rpt_hpp", G_RPT, "reports", "read", ACCV, "GET /api/reports/operational/hpp",
  "Laporan HPP (harga pokok produksi).", inp={"period": "string"}, out={"report": "object"})
T("rpt_profitability_sku", G_RPT, "reports", "read", ACCV, "GET /api/reports/operational/profitability-per-sku",
  "Profitabilitas per SKU.", inp={"period": "string"}, out={"report": "object"})
T("rpt_payable_schedule", G_RPT, "reports", "read", ACCV, "GET /api/reports/operational/payable-schedule",
  "Jadwal jatuh tempo hutang.", out={"report": "object"})
T("rpt_receivable_schedule", G_RPT, "reports", "read", ACCV, "GET /api/reports/operational/receivable-schedule",
  "Jadwal jatuh tempo piutang.", out={"report": "object"})
T("rpt_daily", G_RPT, "reports", "read", ACCV, "GET /api/reports/operational/daily",
  "Laporan operasional harian.", inp={"date": "date"}, out={"report": "object"})

T("rpt_fa_dashboard", G_RPT, "reports", "read", ACCV, "GET /api/dashboard/fixed-assets",
  "Dashboard aset tetap.", out={"data": "object"})

# ════════════════════════════════════════════════════════════════════
# MODUL: MASTER & SISTEM
# ════════════════════════════════════════════════════════════════════
G_MASTER = "Master & Sistem"

# ── Parties ──
T("party_search", G_MASTER, "parties", "read", ALL, "GET /api/parties",
  "Cari pelanggan/vendor berdasarkan nama/kode.", inp={"q": "string"}, out={"items": "array"}, enabled=True)
T("party_similar", G_MASTER, "parties", "read", ALL, "GET /api/parties/similar",
  "Cari party mirip (deteksi duplikat).", inp={"name": "string"}, out={"items": "array"})
T("party_dashboard", G_MASTER, "parties", "read", OPSV, "GET /api/parties/dashboard",
  "Dashboard ringkas party (saldo, transaksi).", out={"data": "object"})
T("party_create", G_MASTER, "parties", "write", OPS, "POST /api/parties",
  "Buat pelanggan/vendor baru.", inp={"name": "string", "type": "string"}, out={"id": "string"},
  confirm="Buat party '{name}' tipe {type}. Setujui?")
T("party_update", G_MASTER, "parties", "write", OPS, "PUT /api/parties/:id",
  "Ubah pelanggan/vendor.", inp={"id": "string"}, out={"id": "string"}, confirm="Ubah party {id}. Setujui?")
T("party_delete", G_MASTER, "parties", "critical", OPS, "DELETE /api/parties/:id",
  "Hapus pelanggan/vendor.", inp={"id": "string"}, out={"status": "string"}, cap="doc.cancel",
  confirm="HAPUS party {id}? Pastikan tak ada transaksi.")

# ── Service Items (master) ──
T("svc_list", G_MASTER, "sales_invoice", "read", ACCV, "GET /api/service-items",
  "Daftar item jasa (master).", out={"items": "array"})
T("svc_create", G_MASTER, "sales_invoice", "write", ACC, "POST /api/service-items",
  "Buat item jasa.", inp={"name": "string", "rate": "number"}, out={"id": "string"},
  confirm="Buat item jasa '{name}' Rp {rate}. Setujui?")
T("svc_update", G_MASTER, "sales_invoice", "write", ACC, "PATCH /api/service-items/:id",
  "Ubah item jasa.", inp={"id": "string"}, out={"id": "string"}, confirm="Ubah item jasa {id}. Setujui?")
T("svc_delete", G_MASTER, "sales_invoice", "critical", ACC, "DELETE /api/service-items/:id",
  "Hapus item jasa.", inp={"id": "string"}, out={"status": "string"}, cap="doc.cancel",
  confirm="HAPUS item jasa {id}?")

# ── Search (universal) ──
T("search_global", "Universal", "reports", "read", ALL, "GET /api/search",
  "Pencarian universal lintas-entitas (dokumen, party, item) — entity resolution.",
  inp={"q": "string"}, out={"results": "array"}, enabled=True)

# ── Settings ──
T("set_company_get", G_MASTER, "settings", "read", ALL, "GET /api/settings/company",
  "Ambil profil perusahaan.", out={"company": "object"})
T("set_runtime_get", G_MASTER, "settings", "read", ADMIN, "GET /api/settings/runtime",
  "Ambil pengaturan runtime sistem.", out={"settings": "object"})
T("set_check_update", G_MASTER, "settings", "read", ADMIN, "GET /api/settings/check-update",
  "Cek pembaruan aplikasi.", out={"update": "object"})
T("set_company_update", G_MASTER, "settings", "write", ADMIN, "PUT /api/settings/company",
  "Ubah profil perusahaan.", inp={"name": "string"}, out={"status": "string"},
  confirm="Ubah profil perusahaan. Setujui?")

# ── Users ──
T("usr_list", G_MASTER, "users", "read", ADMIN, "GET /api/users",
  "Daftar user.", out={"items": "array"})
T("usr_create", G_MASTER, "users", "write", ADMIN, "POST /api/users",
  "Buat user baru.", inp={"email": "string", "role": "string"}, out={"id": "string"},
  confirm="Buat user {email} role {role}. Setujui?")
T("usr_update", G_MASTER, "users", "write", ADMIN, "PUT /api/users/:id",
  "Ubah user.", inp={"id": "string"}, out={"id": "string"}, confirm="Ubah user {id}. Setujui?")
T("usr_toggle", G_MASTER, "users", "write", ADMIN, "PATCH /api/users/:id/toggle",
  "Aktif/nonaktifkan user.", inp={"id": "string"}, out={"status": "string"},
  confirm="Aktif/nonaktifkan user {id}. Setujui?")

# ── Roles (RBAC) ──
T("role_list", G_MASTER, "users", "read", ADMIN, "GET /api/roles",
  "Daftar role.", out={"items": "array"})
T("role_assignable", G_MASTER, "users", "read", ADMIN, "GET /api/roles/assignable",
  "Daftar role yang bisa ditugaskan.", out={"items": "array"})
T("role_catalog", G_MASTER, "users", "read", ADMIN, "GET /api/roles/catalog",
  "Katalog modul + capability (untuk UI RBAC).", out={"catalog": "object"})
T("role_create", G_MASTER, "users", "write", ADMIN, "POST /api/roles",
  "Buat role baru.", inp={"name": "string"}, out={"id": "string"}, cap="rbac.manage",
  confirm="Buat role '{name}'. Setujui?")
T("role_update", G_MASTER, "users", "write", ADMIN, "PUT /api/roles/:id",
  "Ubah role + matriks izin.", inp={"id": "string", "permissions": "object"}, out={"id": "string"},
  cap="rbac.manage", confirm="Ubah role {id} + izin. Setujui?")
T("role_delete", G_MASTER, "users", "critical", ADMIN, "DELETE /api/roles/:id",
  "Hapus role.", inp={"id": "string"}, out={"status": "string"}, cap="rbac.manage",
  confirm="HAPUS role {id}? User yang memakai akan kehilangan izin.")

# ── Audit ──
T("audit_list", G_MASTER, "audit", "read", ADMIN, "GET /api/audit-logs",
  "Jejak audit (siapa-ubah-apa-kapan).", inp={"page": "number", "filter": "object"}, out={"items": "array"})

# ── System Accounts ──
T("sysacct_get", G_MASTER, "settings", "read", ADMIN, "GET /api/system-accounts",
  "Pemetaan akun sistem (auto-GL).", out={"mapping": "object"})
T("sysacct_update", G_MASTER, "settings", "critical", ADMIN, "PUT /api/system-accounts",
  "Ubah pemetaan akun sistem (auto-GL). HATI-HATI: mempengaruhi semua posting.",
  inp={"mapping": "object"}, out={"status": "string"},
  confirm="Ubah pemetaan AKUN SISTEM? Mempengaruhi SEMUA auto-posting GL. Sangat berisiko.")

# ── Notifications ──
T("notif_list", G_MASTER, "settings", "read", ALL, "GET /api/notifications",
  "Daftar notifikasi user.", out={"items": "array"})
T("notif_unread_count", G_MASTER, "settings", "read", ALL, "GET /api/notifications/unread-count",
  "Jumlah notifikasi belum dibaca.", out={"count": "number"})

# ════════════════════════════════════════════════════════════════════
# MODUL: GENERAL AFFAIRS (EAM)
# ════════════════════════════════════════════════════════════════════
G_EAM = "EAM"
EAM_OPS = OPS  # GA modules: Admin/Accountant/StaffProduksi typical; Viewer read where matrix grants

# ── GA Assets ──
T("ga_asset_list", G_EAM, "ga_assets", "read", OPSV, "GET /api/ga/assets",
  "Daftar aset GA (EAM).", inp={"page": "number"}, out={"items": "array"})
T("ga_asset_next_code", G_EAM, "ga_assets", "read", OPS, "GET /api/ga/assets/_next-code",
  "Kode aset GA berikutnya.", out={"code": "string"})
T("ga_asset_get", G_EAM, "ga_assets", "read", OPSV, "GET /api/ga/assets/:id",
  "Detail satu aset GA.", inp={"id": "string"}, out={"asset": "object"})
T("ga_asset_create", G_EAM, "ga_assets", "write", OPS, "POST /api/ga/assets",
  "Buat aset GA.", inp={"name": "string", "category": "string"}, out={"id": "string"},
  confirm="Buat aset GA '{name}'. Setujui?")
T("ga_asset_update", G_EAM, "ga_assets", "write", OPS, "PUT /api/ga/assets/:id",
  "Ubah aset GA.", inp={"id": "string"}, out={"id": "string"}, confirm="Ubah aset GA {id}. Setujui?")
T("ga_asset_bulk_update", G_EAM, "ga_assets", "write", OPS, "PATCH /api/ga/assets/bulk/update",
  "Ubah massal aset GA.", inp={"ids": "array", "patch": "object"}, out={"status": "string"},
  confirm="Ubah massal {ids} aset GA. Setujui?")
T("ga_asset_bulk_delete", G_EAM, "ga_assets", "critical", OPS, "POST /api/ga/assets/bulk/delete",
  "Hapus massal aset GA.", inp={"ids": "array"}, out={"status": "string"},
  confirm="HAPUS massal {ids} aset GA?")
T("ga_asset_set_condition", G_EAM, "ga_assets", "write", OPS, "PATCH /api/ga/assets/:id/condition",
  "Set kondisi aset GA.", inp={"id": "string", "condition": "string"}, out={"status": "string"},
  confirm="Set kondisi aset GA {id} = {condition}. Setujui?")

# ── GA Vehicle ──
T("ga_veh_get", G_EAM, "ga_vehicle", "read", OPSV, "GET /api/ga/vehicle/assets/:id",
  "Detail kendaraan.", inp={"id": "string"}, out={"vehicle": "object"})
T("ga_veh_update", G_EAM, "ga_vehicle", "write", OPS, "PUT /api/ga/vehicle/assets/:id",
  "Ubah data kendaraan.", inp={"id": "string"}, out={"id": "string"}, confirm="Ubah kendaraan {id}. Setujui?")
T("ga_veh_services", G_EAM, "ga_vehicle", "read", OPSV, "GET /api/ga/vehicle/assets/:id/services",
  "Riwayat servis kendaraan.", inp={"id": "string"}, out={"items": "array"})
T("ga_veh_add_service", G_EAM, "ga_vehicle", "write", OPS, "POST /api/ga/vehicle/assets/:id/services",
  "Catat servis kendaraan.", inp={"id": "string", "desc": "string", "cost": "number"}, out={"id": "string"},
  confirm="Catat servis kendaraan {id}: {desc} Rp {cost}. Setujui?")
T("ga_veh_service_requests", G_EAM, "ga_vehicle", "read", OPSV, "GET /api/ga/vehicle/service-requests",
  "Daftar permintaan servis kendaraan.", out={"items": "array"})
T("ga_veh_service_request_get", G_EAM, "ga_vehicle", "read", OPSV, "GET /api/ga/vehicle/service-requests/:id",
  "Detail permintaan servis.", inp={"id": "string"}, out={"request": "object"})
T("ga_veh_create_service_request", G_EAM, "ga_vehicle", "write", OPS, "POST /api/ga/vehicle/assets/:id/service-requests",
  "Ajukan permintaan servis kendaraan.", inp={"id": "string", "desc": "string"}, out={"id": "string"},
  confirm="Ajukan servis kendaraan {id}: {desc}. Setujui?")
T("ga_veh_approve_service", G_EAM, "ga_vehicle", "write", OPS, "PATCH /api/ga/vehicle/service-requests/:id/approve",
  "Setujui permintaan servis kendaraan.", inp={"id": "string"}, out={"status": "string"},
  confirm="SETUJUI permintaan servis {id}. Setujui?")
T("ga_veh_reject_service", G_EAM, "ga_vehicle", "write", OPS, "PATCH /api/ga/vehicle/service-requests/:id/reject",
  "Tolak permintaan servis kendaraan.", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  confirm="TOLAK permintaan servis {id}? Alasan: {reason}.")

# ── GA Building ──
T("ga_bld_get", G_EAM, "ga_building", "read", OPSV, "GET /api/ga/building/assets/:id",
  "Detail gedung.", inp={"id": "string"}, out={"building": "object"})
T("ga_bld_update", G_EAM, "ga_building", "write", OPS, "PUT /api/ga/building/assets/:id",
  "Ubah data gedung.", inp={"id": "string"}, out={"id": "string"}, confirm="Ubah gedung {id}. Setujui?")
T("ga_bld_rentals", G_EAM, "ga_building", "read", OPSV, "GET /api/ga/building/assets/:id/rentals",
  "Daftar sewa gedung.", inp={"id": "string"}, out={"items": "array"})
T("ga_bld_add_rental", G_EAM, "ga_building", "write", OPS, "POST /api/ga/building/assets/:id/rentals",
  "Catat sewa gedung.", inp={"id": "string", "tenant": "string", "amount": "number"}, out={"id": "string"},
  confirm="Catat sewa gedung {id} ke {tenant} Rp {amount}. Setujui?")
T("ga_bld_update_rental", G_EAM, "ga_building", "write", OPS, "PATCH /api/ga/building/assets/:id/rentals/:rid",
  "Ubah sewa gedung.", inp={"id": "string", "rid": "string"}, out={"status": "string"},
  confirm="Ubah sewa gedung {id}/{rid}. Setujui?")
T("ga_bld_end_rental", G_EAM, "ga_building", "write", OPS, "PATCH /api/ga/building/assets/:id/rentals/:rid/end",
  "Akhiri sewa gedung.", inp={"id": "string", "rid": "string"}, out={"status": "string"},
  confirm="Akhiri sewa gedung {id}/{rid}. Setujui?")

# ── GA Equipment ──
T("ga_eqp_get", G_EAM, "ga_equipment", "read", OPSV, "GET /api/ga/equipment/assets/:id",
  "Detail equipment.", inp={"id": "string"}, out={"equipment": "object"})
T("ga_eqp_update", G_EAM, "ga_equipment", "write", OPS, "PUT /api/ga/equipment/assets/:id",
  "Ubah data equipment.", inp={"id": "string"}, out={"id": "string"}, confirm="Ubah equipment {id}. Setujui?")
T("ga_eqp_calibration_logs", G_EAM, "ga_equipment", "read", OPSV, "GET /api/ga/equipment/assets/:id/calibration-logs",
  "Riwayat kalibrasi equipment.", inp={"id": "string"}, out={"items": "array"})
T("ga_eqp_add_calibration", G_EAM, "ga_equipment", "write", OPS, "POST /api/ga/equipment/assets/:id/calibration-logs",
  "Catat kalibrasi equipment.", inp={"id": "string", "date": "date", "result": "string"}, out={"id": "string"},
  confirm="Catat kalibrasi equipment {id} ({result}). Setujui?")

# ── GA Maintenance (Work Orders) ──
T("gm_schedules", G_EAM, "ga_maintenance", "read", OPSV, "GET /api/ga/maintenance/schedules",
  "Jadwal maintenance.", out={"items": "array"})
T("gm_schedule_create", G_EAM, "ga_maintenance", "write", OPS, "POST /api/ga/maintenance/schedules",
  "Buat jadwal maintenance.", inp={"assetId": "string", "interval": "string"}, out={"id": "string"},
  confirm="Buat jadwal maintenance aset {assetId} interval {interval}. Setujui?")
T("gm_schedule_update", G_EAM, "ga_maintenance", "write", OPS, "PUT /api/ga/maintenance/schedules/:id",
  "Ubah jadwal maintenance.", inp={"id": "string"}, out={"id": "string"},
  confirm="Ubah jadwal maintenance {id}. Setujui?")
T("gm_wo_list", G_EAM, "ga_maintenance", "read", OPSV, "GET /api/ga/maintenance/work-orders",
  "Daftar Work Order maintenance.", inp={"status": "string"}, out={"items": "array"})
T("gm_wo_get", G_EAM, "ga_maintenance", "read", OPSV, "GET /api/ga/maintenance/work-orders/:id",
  "Detail Work Order.", inp={"id": "string"}, out={"workOrder": "object"})
T("gm_wo_create", G_EAM, "ga_maintenance", "write", OPS, "POST /api/ga/maintenance/work-orders",
  "Buat Work Order maintenance.", inp={"assetId": "string", "desc": "string"}, out={"id": "string"},
  enabled=False, phase=5, confirm="Buat Work Order untuk aset {assetId}: {desc}. Setujui?")
T("gm_wo_assign", G_EAM, "ga_maintenance", "write", OPS, "PATCH /api/ga/maintenance/work-orders/:id/assign",
  "Tugaskan Work Order ke teknisi.", inp={"id": "string", "assigneeId": "string"}, out={"status": "string"},
  confirm="Tugaskan WO {id} ke {assigneeId}. Setujui?")
T("gm_wo_start", G_EAM, "ga_maintenance", "write", OPS, "PATCH /api/ga/maintenance/work-orders/:id/start",
  "Mulai pengerjaan Work Order.", inp={"id": "string"}, out={"status": "string"},
  confirm="Mulai WO {id}. Setujui?")
T("gm_wo_complete", G_EAM, "ga_maintenance", "write", OPS, "PATCH /api/ga/maintenance/work-orders/:id/complete",
  "Selesaikan Work Order.", inp={"id": "string", "notes": "string"}, out={"status": "string"},
  confirm="Selesaikan WO {id}. Setujui?")
T("gm_wo_close", G_EAM, "ga_maintenance", "write", OPS, "PATCH /api/ga/maintenance/work-orders/:id/close",
  "Tutup Work Order.", inp={"id": "string"}, out={"status": "string"}, confirm="Tutup WO {id}. Setujui?")
T("gm_wo_cancel", G_EAM, "ga_maintenance", "critical", OPS, "PATCH /api/ga/maintenance/work-orders/:id/cancel",
  "Batalkan Work Order.", inp={"id": "string", "reason": "string"}, out={"status": "string"},
  confirm="BATALKAN WO {id}? Alasan: {reason}.")
T("gm_wo_add_parts", G_EAM, "ga_maintenance", "write", OPS, "POST /api/ga/maintenance/work-orders/:id/parts",
  "Tambah sparepart ke Work Order (konsumsi inventaris).", inp={"id": "string", "parts": "array"}, out={"status": "string"},
  confirm="Tambah {parts} sparepart ke WO {id}. Setujui? (konsumsi inventaris GA)")

# ── GA Inventory ──
T("gi_items", G_EAM, "ga_inventory", "read", OPSV, "GET /api/ga/inventory/items",
  "Daftar inventaris GA (sparepart/ATK).", inp={"search": "string"}, out={"items": "array"})
T("gi_item_get", G_EAM, "ga_inventory", "read", OPSV, "GET /api/ga/inventory/items/:id",
  "Detail item inventaris GA.", inp={"id": "string"}, out={"item": "object"})
T("gi_low_stock", G_EAM, "ga_inventory", "read", OPS, "GET /api/ga/inventory/low-stock",
  "Inventaris GA stok rendah.", out={"items": "array"})
T("gi_movements", G_EAM, "ga_inventory", "read", OPSV, "GET /api/ga/inventory/movements",
  "Pergerakan inventaris GA.", inp={"itemId": "string"}, out={"items": "array"})
T("gi_item_create", G_EAM, "ga_inventory", "write", OPS, "POST /api/ga/inventory/items",
  "Buat item inventaris GA.", inp={"name": "string", "unit": "string"}, out={"id": "string"},
  confirm="Buat item inventaris GA '{name}'. Setujui?")
T("gi_item_update", G_EAM, "ga_inventory", "write", OPS, "PUT /api/ga/inventory/items/:id",
  "Ubah item inventaris GA.", inp={"id": "string"}, out={"id": "string"},
  confirm="Ubah item inventaris GA {id}. Setujui?")
T("gi_movement_create", G_EAM, "ga_inventory", "write", OPS, "POST /api/ga/inventory/movements",
  "Catat pergerakan inventaris GA (masuk/keluar).",
  inp={"itemId": "string", "type": "string", "quantity": "number"}, out={"id": "string"},
  confirm="Catat pergerakan inventaris GA {type} {quantity} item {itemId}. Setujui?")

# ── GA Documents ──
T("gd_list", G_EAM, "ga_documents", "read", ADMIN, "GET /api/ga/documents",
  "Daftar dokumen legal/sertifikat (termasuk yg hampir kadaluarsa untuk reminder).",
  inp={"expiringSoon": "boolean"}, out={"documents": "array"}, enabled=False, level=3, phase=5)
T("gd_get", G_EAM, "ga_documents", "read", ADMIN, "GET /api/ga/documents/:id",
  "Detail satu dokumen legal.", inp={"id": "string"}, out={"document": "object"})
T("gd_create", G_EAM, "ga_documents", "write", OPS, "POST /api/ga/documents",
  "Catat dokumen legal/sertifikat.", inp={"name": "string", "expiryDate": "date"}, out={"id": "string"},
  confirm="Catat dokumen legal '{name}' (exp {expiryDate}). Setujui?")
T("gd_update", G_EAM, "ga_documents", "write", OPS, "PUT /api/ga/documents/:id",
  "Ubah dokumen legal.", inp={"id": "string"}, out={"id": "string"},
  confirm="Ubah dokumen legal {id}. Setujui?")
T("gd_delete", G_EAM, "ga_documents", "critical", OPS, "DELETE /api/ga/documents/:id",
  "Hapus dokumen legal.", inp={"id": "string"}, out={"status": "string"},
  confirm="HAPUS dokumen legal {id}?")

# ── GA Master ──
T("gam_branches", G_EAM, "ga_master", "read", OPSV, "GET /api/ga/master/branches",
  "Daftar cabang (master EAM).", out={"items": "array"})
T("gam_branch_create", G_EAM, "ga_master", "write", OPS, "POST /api/ga/master/branches",
  "Buat cabang.", inp={"name": "string"}, out={"id": "string"}, confirm="Buat cabang '{name}'. Setujui?")
T("gam_cost_centers", G_EAM, "ga_master", "read", OPSV, "GET /api/ga/master/cost-centers",
  "Daftar cost center.", out={"items": "array"})
T("gam_cost_center_create", G_EAM, "ga_master", "write", OPS, "POST /api/ga/master/cost-centers",
  "Buat cost center.", inp={"name": "string"}, out={"id": "string"}, confirm="Buat cost center '{name}'. Setujui?")
T("gam_asset_categories", G_EAM, "ga_master", "read", OPSV, "GET /api/ga/master/asset-categories",
  "Daftar kategori aset EAM.", out={"items": "array"})
T("gam_locations", G_EAM, "ga_master", "read", OPSV, "GET /api/ga/master/locations",
  "Daftar lokasi EAM.", out={"items": "array"})
T("gam_document_types", G_EAM, "ga_master", "read", OPSV, "GET /api/ga/master/document-types",
  "Daftar tipe dokumen legal.", out={"items": "array"})
T("gam_inventory_categories", G_EAM, "ga_master", "read", OPSV, "GET /api/ga/master/inventory-categories",
  "Daftar kategori inventaris GA.", out={"items": "array"})

# ════════════════════════════════════════════════════════════════════
# EMIT
# ════════════════════════════════════════════════════════════════════
with open(HEADER_PATH) as f:
    reg = json.load(f)
reg["tools"] = tools
with open(OUT_PATH, "w") as f:
    json.dump(reg, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"Wrote {len(tools)} tools -> {OUT_PATH}")
# stats
from collections import Counter
byrisk = Counter(t["risk"] for t in tools)
bymod = Counter(t["module"] for t in tools)
print("By risk:", dict(byrisk))
print("Modules covered:", len(bymod))
