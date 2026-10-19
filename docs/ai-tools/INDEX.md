# Indeks Katalog Tool AIRA/MCP

> Dibangkitkan otomatis — jangan edit manual (`npm run ai-tools:docs`).

Total **475** tool (read 219 · write 151 · critical 105); semuanya aktif secara default (override per tool di Settings → AIRA). Endpoint terlarang: [DENYLIST.md](DENYLIST.md). Istilah: [GLOSARIUM.md](GLOSARIUM.md).

## Toolset

| Toolset | Tool | read | write | critical | Ringkas |
|---|---|---|---|---|---|
| [Penjualan](penjualan.md) | 65 | 28 | 22 | 15 | Penawaran, Sales Order, Surat Jalan, Invoice Penjualan, Retur, Uang Muka Pelanggan. |
| [Pembelian](pembelian.md) | 28 | 12 | 5 | 11 | PO, Penerimaan Barang (STT/BPB), Invoice Pembelian, Uang Muka Vendor. |
| [Persediaan](persediaan.md) | 34 | 19 | 6 | 9 | Barang, gudang, mutasi stok, transfer, stok opname. |
| [Produksi](produksi.md) | 28 | 13 | 9 | 6 | Draft & posting produksi, standar biaya, proses, mesin. |
| [Akuntansi](akuntansi.md) | 33 | 14 | 8 | 11 | COA, jurnal, tahun buku, pajak, akun sistem, aset tetap. |
| [Kas & Bank](kas-bank.md) | 37 | 15 | 13 | 9 | Pembayaran/penerimaan, rekonsiliasi bank, transaksi berulang, uang jaminan proyek. |
| [Aset & Umum (EAM)](aset-umum.md) | 141 | 49 | 68 | 24 | Aset, kendaraan, gedung, equipment, maintenance, dokumen legal, inventaris umum, MR. |
| [Pengajuan Pembayaran](pengajuan-pembayaran.md) | 32 | 9 | 11 | 12 | Pengajuan pembayaran, verifikasi, pembayaran, pertanggungjawaban, antrian Tagihan EAM. |
| [Persetujuan](persetujuan.md) | 14 | 6 | 2 | 6 | Antrian approval, keputusan setuju/tolak/revisi, aturan approval. |
| [Laporan](laporan.md) | 15 | 15 | 0 | 0 | Laporan keuangan, operasional dan pembelian. |
| [Dashboard](dashboard.md) | 17 | 17 | 0 | 0 | Ringkasan dan indikator dashboard. |
| [Master Data](master-data.md) | 12 | 6 | 5 | 1 | Pelanggan & vendor (Party). |
| [Sistem](sistem.md) | 17 | 14 | 2 | 1 | Jejak audit, notifikasi, pencarian, profil perusahaan, kesehatan sistem. |
| [Obrolan (memori percakapan)](obrolan.md) | 2 | 2 | 0 | 0 | Pencarian dan pembacaan riwayat percakapan panel chat milik pemanggil sendiri. |

## Semua tool

| Tool | Toolset | Risk | Draft | Roles | Handler |
|---|---|---|---|---|---|
| [`appr_approve`](persetujuan.md#appr_approve) | persetujuan | critical | tidak | Admin | `POST /api/approvals/requests/:id/approve` |
| [`appr_check`](persetujuan.md#appr_check) | persetujuan | read | - | Admin, Accountant, StaffProduksi | `GET /api/approvals/check` |
| [`appr_pending`](persetujuan.md#appr_pending) | persetujuan | read | - | Admin, Accountant, StaffProduksi | `GET /api/approvals/pending` |
| [`appr_reject`](persetujuan.md#appr_reject) | persetujuan | critical | tidak | Admin | `POST /api/approvals/requests/:id/reject` |
| [`appr_request_context`](persetujuan.md#appr_request_context) | persetujuan | read | - | Admin, Accountant, StaffProduksi | `GET /api/approvals/requests/:id/context` |
| [`appr_request_create`](persetujuan.md#appr_request_create) | persetujuan | write | ya | Admin, Accountant, StaffProduksi | `POST /api/approvals/requests` |
| [`appr_request_get`](persetujuan.md#appr_request_get) | persetujuan | read | - | Admin, Accountant, StaffProduksi | `GET /api/approvals/requests/:id` |
| [`appr_request_revision`](persetujuan.md#appr_request_revision) | persetujuan | critical | tidak | Admin | `POST /api/approvals/requests/:id/request-revision` |
| [`appr_requests_list`](persetujuan.md#appr_requests_list) | persetujuan | read | - | Admin, Accountant, StaffProduksi | `GET /api/approvals/requests` |
| [`appr_resubmit`](persetujuan.md#appr_resubmit) | persetujuan | write | ya | Admin, Accountant, StaffProduksi | `PUT /api/approvals/requests/:id/resubmit` |
| [`appr_rule_create`](persetujuan.md#appr_rule_create) | persetujuan | critical | tidak | Admin | `POST /api/approvals/rules` |
| [`appr_rule_delete`](persetujuan.md#appr_rule_delete) | persetujuan | critical | tidak | Admin | `DELETE /api/approvals/rules/:id` |
| [`appr_rule_update`](persetujuan.md#appr_rule_update) | persetujuan | critical | tidak | Admin | `PUT /api/approvals/rules/:id` |
| [`appr_rules_list`](persetujuan.md#appr_rules_list) | persetujuan | read | - | Admin | `GET /api/approvals/rules` |
| [`att_counts`](sistem.md#att_counts) | sistem | read | - | Admin, Accountant, StaffProduksi, Viewer | `POST /api/attachments/counts` |
| [`att_invoice_related`](sistem.md#att_invoice_related) | sistem | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/attachments/invoice/:type/:id/related` |
| [`att_list`](sistem.md#att_list) | sistem | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/attachments/:referenceType/:referenceId` |
| [`audit_facets`](sistem.md#audit_facets) | sistem | read | - | Admin | `GET /api/audit-logs/facets` |
| [`audit_get`](sistem.md#audit_get) | sistem | read | - | Admin | `GET /api/audit-logs/:id` |
| [`audit_list`](sistem.md#audit_list) | sistem | read | - | Admin | `GET /api/audit-logs` |
| [`audit_summary`](sistem.md#audit_summary) | sistem | read | - | Admin | `GET /api/audit-logs/summary` |
| [`cdep_apply`](penjualan.md#cdep_apply) | penjualan | critical | tidak | Admin, Accountant | `POST /api/customer-deposits/apply` |
| [`cdep_apply_cancel`](penjualan.md#cdep_apply_cancel) | penjualan | critical | tidak | Admin | `POST /api/customer-deposits/apply/:id/cancel` |
| [`cdep_balance`](penjualan.md#cdep_balance) | penjualan | read | - | Admin, Accountant | `GET /api/customer-deposits/balance/:partyId` |
| [`cdep_cancel`](penjualan.md#cdep_cancel) | penjualan | critical | tidak | Admin, Accountant | `PATCH /api/customer-deposits/:id/cancel` |
| [`cdep_list`](penjualan.md#cdep_list) | penjualan | read | - | Admin, Accountant | `GET /api/customer-deposits` |
| [`cdep_refund`](penjualan.md#cdep_refund) | penjualan | critical | tidak | Admin, Accountant | `POST /api/customer-deposits/:id/refund` |
| [`cdep_summary`](penjualan.md#cdep_summary) | penjualan | read | - | Admin, Accountant | `GET /api/customer-deposits/summary` |
| [`chat_ambil_sesi`](obrolan.md#chat_ambil_sesi) | obrolan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/chat-history/sessions/:id` |
| [`chat_cari_riwayat`](obrolan.md#chat_cari_riwayat) | obrolan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/chat-history/search` |
| [`coa_create`](akuntansi.md#coa_create) | akuntansi | write | tidak | Admin | `POST /api/coa` |
| [`coa_delete`](akuntansi.md#coa_delete) | akuntansi | critical | tidak | Admin | `DELETE /api/coa/:id` |
| [`coa_flat`](akuntansi.md#coa_flat) | akuntansi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/coa/flat` |
| [`coa_list`](akuntansi.md#coa_list) | akuntansi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/coa` |
| [`coa_set_balance`](akuntansi.md#coa_set_balance) | akuntansi | critical | tidak | Admin | `PATCH /api/coa/:id/balance` |
| [`coa_update`](akuntansi.md#coa_update) | akuntansi | write | tidak | Admin | `PUT /api/coa/:id` |
| [`cogs_backfill_list`](akuntansi.md#cogs_backfill_list) | akuntansi | read | - | Admin, Accountant, Viewer | `GET /api/cogs-backfill` |
| [`cogs_backfill_summary`](akuntansi.md#cogs_backfill_summary) | akuntansi | read | - | Admin, Accountant, Viewer | `GET /api/cogs-backfill/summary` |
| [`do_cancel`](penjualan.md#do_cancel) | penjualan | critical | tidak | Admin | `POST /api/delivery-orders/:id/cancel` |
| [`do_create`](penjualan.md#do_create) | penjualan | critical | tidak | Admin, Accountant, StaffProduksi | `POST /api/delivery-orders` |
| [`do_from_invoice`](penjualan.md#do_from_invoice) | penjualan | write | tidak | Admin, Accountant, StaffProduksi | `POST /api/delivery-orders/from-invoice/:invoiceId` |
| [`do_get`](penjualan.md#do_get) | penjualan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/delivery-orders/:id` |
| [`do_list`](penjualan.md#do_list) | penjualan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/delivery-orders` |
| [`do_patch`](penjualan.md#do_patch) | penjualan | write | tidak | Admin, Accountant, StaffProduksi | `PATCH /api/delivery-orders/:id` |
| [`do_pending`](penjualan.md#do_pending) | penjualan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/delivery-orders/pending` |
| [`do_update`](penjualan.md#do_update) | penjualan | critical | tidak | Admin, Accountant, StaffProduksi | `PUT /api/delivery-orders/:id` |
| [`eambill_cancel`](pengajuan-pembayaran.md#eambill_cancel) | pengajuan-pembayaran | critical | tidak | Admin, Accountant | `POST /api/payment-requests/eam/:kind/:id/cancel` |
| [`eambill_list`](pengajuan-pembayaran.md#eambill_list) | pengajuan-pembayaran | read | - | Admin, Accountant | `GET /api/payment-requests/eam` |
| [`eambill_pay`](pengajuan-pembayaran.md#eambill_pay) | pengajuan-pembayaran | critical | tidak | Admin, Accountant | `POST /api/payment-requests/eam/:kind/:id/pay` |
| [`eambill_summary`](pengajuan-pembayaran.md#eambill_summary) | pengajuan-pembayaran | read | - | Admin, Accountant | `GET /api/payment-requests/eam/summary` |
| [`fa_categories`](akuntansi.md#fa_categories) | akuntansi | read | - | Admin, Accountant, Viewer | `GET /api/fixed-assets/categories` |
| [`fa_create`](akuntansi.md#fa_create) | akuntansi | write | tidak | Admin, Accountant | `POST /api/fixed-assets` |
| [`fa_depreciate`](akuntansi.md#fa_depreciate) | akuntansi | critical | tidak | Admin, Accountant | `POST /api/fixed-assets/:id/depreciate` |
| [`fa_depreciate_bulk`](akuntansi.md#fa_depreciate_bulk) | akuntansi | critical | tidak | Admin, Accountant | `POST /api/fixed-assets/depreciate-bulk` |
| [`fa_dispose`](akuntansi.md#fa_dispose) | akuntansi | critical | tidak | Admin, Accountant | `POST /api/fixed-assets/:id/dispose` |
| [`fa_get`](akuntansi.md#fa_get) | akuntansi | read | - | Admin, Accountant, Viewer | `GET /api/fixed-assets/:id` |
| [`fa_import`](akuntansi.md#fa_import) | akuntansi | write | tidak | Admin, Accountant | `POST /api/fixed-assets/import` |
| [`fa_list`](akuntansi.md#fa_list) | akuntansi | read | - | Admin, Accountant, Viewer | `GET /api/fixed-assets` |
| [`fa_summary_by_category`](akuntansi.md#fa_summary_by_category) | akuntansi | read | - | Admin, Accountant, Viewer | `GET /api/fixed-assets/summary/by-category` |
| [`fa_update`](akuntansi.md#fa_update) | akuntansi | write | tidak | Admin, Accountant | `PUT /api/fixed-assets/:id` |
| [`fy_close`](akuntansi.md#fy_close) | akuntansi | critical | tidak | Admin | `POST /api/fiscal-years/:id/close` |
| [`fy_create`](akuntansi.md#fy_create) | akuntansi | write | tidak | Admin | `POST /api/fiscal-years` |
| [`fy_list`](akuntansi.md#fy_list) | akuntansi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/fiscal-years` |
| [`fy_reopen`](akuntansi.md#fy_reopen) | akuntansi | critical | tidak | Admin | `POST /api/fiscal-years/:id/reopen` |
| [`ga_asset_bulk_delete`](aset-umum.md#ga_asset_bulk_delete) | aset-umum | critical | tidak | Admin | `POST /api/ga/assets/bulk/delete` |
| [`ga_asset_bulk_update`](aset-umum.md#ga_asset_bulk_update) | aset-umum | write | tidak | Admin | `PATCH /api/ga/assets/bulk/update` |
| [`ga_asset_create`](aset-umum.md#ga_asset_create) | aset-umum | write | tidak | Admin | `POST /api/ga/assets` |
| [`ga_asset_delete_photo`](aset-umum.md#ga_asset_delete_photo) | aset-umum | write | tidak | Admin | `DELETE /api/ga/assets/:id/photos/:photoId` |
| [`ga_asset_get`](aset-umum.md#ga_asset_get) | aset-umum | read | - | Admin | `GET /api/ga/assets/:id` |
| [`ga_asset_list`](aset-umum.md#ga_asset_list) | aset-umum | read | - | Admin | `GET /api/ga/assets` |
| [`ga_asset_next_code`](aset-umum.md#ga_asset_next_code) | aset-umum | read | - | Admin | `GET /api/ga/assets/_next-code` |
| [`ga_asset_set_condition`](aset-umum.md#ga_asset_set_condition) | aset-umum | write | tidak | Admin | `PATCH /api/ga/assets/:id/condition` |
| [`ga_asset_update`](aset-umum.md#ga_asset_update) | aset-umum | write | tidak | Admin | `PUT /api/ga/assets/:id` |
| [`ga_bld_add_rental`](aset-umum.md#ga_bld_add_rental) | aset-umum | write | tidak | Admin | `POST /api/ga/building/assets/:id/rentals` |
| [`ga_bld_delete_rental`](aset-umum.md#ga_bld_delete_rental) | aset-umum | critical | tidak | Admin | `DELETE /api/ga/building/assets/:id/rentals/:rid` |
| [`ga_bld_end_rental`](aset-umum.md#ga_bld_end_rental) | aset-umum | write | tidak | Admin | `PATCH /api/ga/building/assets/:id/rentals/:rid/end` |
| [`ga_bld_get`](aset-umum.md#ga_bld_get) | aset-umum | read | - | Admin | `GET /api/ga/building/assets/:id` |
| [`ga_bld_rentals`](aset-umum.md#ga_bld_rentals) | aset-umum | read | - | Admin | `GET /api/ga/building/assets/:id/rentals` |
| [`ga_bld_update`](aset-umum.md#ga_bld_update) | aset-umum | write | tidak | Admin | `PUT /api/ga/building/assets/:id` |
| [`ga_bld_update_rental`](aset-umum.md#ga_bld_update_rental) | aset-umum | write | tidak | Admin | `PATCH /api/ga/building/assets/:id/rentals/:rid` |
| [`ga_eqp_add_calibration`](aset-umum.md#ga_eqp_add_calibration) | aset-umum | write | tidak | Admin | `POST /api/ga/equipment/assets/:id/calibration-logs` |
| [`ga_eqp_calibration_logs`](aset-umum.md#ga_eqp_calibration_logs) | aset-umum | read | - | Admin | `GET /api/ga/equipment/assets/:id/calibration-logs` |
| [`ga_eqp_delete_calibration`](aset-umum.md#ga_eqp_delete_calibration) | aset-umum | critical | tidak | Admin | `DELETE /api/ga/equipment/assets/:id/calibration-logs/:lid` |
| [`ga_eqp_get`](aset-umum.md#ga_eqp_get) | aset-umum | read | - | Admin | `GET /api/ga/equipment/assets/:id` |
| [`ga_eqp_update`](aset-umum.md#ga_eqp_update) | aset-umum | write | tidak | Admin | `PUT /api/ga/equipment/assets/:id` |
| [`ga_veh_add_fuel_log`](aset-umum.md#ga_veh_add_fuel_log) | aset-umum | write | tidak | Admin | `POST /api/ga/vehicle/assets/:id/fuel-logs` |
| [`ga_veh_add_incident`](aset-umum.md#ga_veh_add_incident) | aset-umum | write | tidak | Admin | `POST /api/ga/vehicle/assets/:id/incidents` |
| [`ga_veh_add_inspection`](aset-umum.md#ga_veh_add_inspection) | aset-umum | write | tidak | Admin | `POST /api/ga/vehicle/assets/:id/inspections` |
| [`ga_veh_add_insurance`](aset-umum.md#ga_veh_add_insurance) | aset-umum | write | tidak | Admin | `POST /api/ga/vehicle/assets/:id/insurances` |
| [`ga_veh_add_oil_log`](aset-umum.md#ga_veh_add_oil_log) | aset-umum | write | tidak | Admin | `POST /api/ga/vehicle/assets/:id/oil-logs` |
| [`ga_veh_add_service`](aset-umum.md#ga_veh_add_service) | aset-umum | critical | ya | Admin | `POST /api/ga/vehicle/assets/:id/services` |
| [`ga_veh_add_tax`](aset-umum.md#ga_veh_add_tax) | aset-umum | write | tidak | Admin | `POST /api/ga/vehicle/assets/:id/taxes` |
| [`ga_veh_add_tire`](aset-umum.md#ga_veh_add_tire) | aset-umum | write | tidak | Admin | `POST /api/ga/vehicle/assets/:id/tires` |
| [`ga_veh_approve_service`](aset-umum.md#ga_veh_approve_service) | aset-umum | critical | tidak | Admin | `PATCH /api/ga/vehicle/service-requests/:id/approve` |
| [`ga_veh_approve_tax_request`](aset-umum.md#ga_veh_approve_tax_request) | aset-umum | critical | tidak | Admin | `PATCH /api/ga/vehicle/tax-requests/:id/approve` |
| [`ga_veh_assign_driver`](aset-umum.md#ga_veh_assign_driver) | aset-umum | write | tidak | Admin | `PATCH /api/ga/vehicle/assets/:id/driver` |
| [`ga_veh_cancel_service_journal`](aset-umum.md#ga_veh_cancel_service_journal) | aset-umum | critical | tidak | Admin | `DELETE /api/ga/vehicle/assets/:id/services/:sid/journal` |
| [`ga_veh_cancel_service_req`](aset-umum.md#ga_veh_cancel_service_req) | aset-umum | critical | tidak | Admin | `PATCH /api/ga/vehicle/service-requests/:id/cancel` |
| [`ga_veh_cancel_tax_request`](aset-umum.md#ga_veh_cancel_tax_request) | aset-umum | critical | tidak | Admin | `PATCH /api/ga/vehicle/tax-requests/:id/cancel` |
| [`ga_veh_create_service_request`](aset-umum.md#ga_veh_create_service_request) | aset-umum | write | ya | Admin | `POST /api/ga/vehicle/assets/:id/service-requests` |
| [`ga_veh_create_tax_request`](aset-umum.md#ga_veh_create_tax_request) | aset-umum | write | ya | Admin | `POST /api/ga/vehicle/assets/:id/tax-requests` |
| [`ga_veh_delete_fuel_log`](aset-umum.md#ga_veh_delete_fuel_log) | aset-umum | write | tidak | Admin | `DELETE /api/ga/vehicle/assets/:id/fuel-logs/:fid` |
| [`ga_veh_delete_incident`](aset-umum.md#ga_veh_delete_incident) | aset-umum | write | tidak | Admin | `DELETE /api/ga/vehicle/assets/:id/incidents/:iid` |
| [`ga_veh_delete_inspection`](aset-umum.md#ga_veh_delete_inspection) | aset-umum | write | tidak | Admin | `DELETE /api/ga/vehicle/assets/:id/inspections/:iid` |
| [`ga_veh_delete_inspection_photo`](aset-umum.md#ga_veh_delete_inspection_photo) | aset-umum | write | tidak | Admin | `DELETE /api/ga/vehicle/assets/:id/inspections/:iid/photos/:pid` |
| [`ga_veh_delete_insurance`](aset-umum.md#ga_veh_delete_insurance) | aset-umum | critical | tidak | Admin | `DELETE /api/ga/vehicle/assets/:id/insurances/:iid` |
| [`ga_veh_delete_oil_log`](aset-umum.md#ga_veh_delete_oil_log) | aset-umum | write | tidak | Admin | `DELETE /api/ga/vehicle/assets/:id/oil-logs/:oid` |
| [`ga_veh_delete_service`](aset-umum.md#ga_veh_delete_service) | aset-umum | critical | tidak | Admin | `DELETE /api/ga/vehicle/assets/:id/services/:sid` |
| [`ga_veh_delete_tax`](aset-umum.md#ga_veh_delete_tax) | aset-umum | critical | tidak | Admin | `DELETE /api/ga/vehicle/assets/:id/taxes/:tid` |
| [`ga_veh_delete_tire`](aset-umum.md#ga_veh_delete_tire) | aset-umum | write | tidak | Admin | `DELETE /api/ga/vehicle/assets/:id/tires/:tid` |
| [`ga_veh_fleet`](aset-umum.md#ga_veh_fleet) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/fleet` |
| [`ga_veh_fleet_report`](aset-umum.md#ga_veh_fleet_report) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/fleet-report` |
| [`ga_veh_fleet_summary`](aset-umum.md#ga_veh_fleet_summary) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/fleet-summary` |
| [`ga_veh_fuel_logs`](aset-umum.md#ga_veh_fuel_logs) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/assets/:id/fuel-logs` |
| [`ga_veh_get`](aset-umum.md#ga_veh_get) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/assets/:id` |
| [`ga_veh_incidents`](aset-umum.md#ga_veh_incidents) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/assets/:id/incidents` |
| [`ga_veh_inspection_categories`](aset-umum.md#ga_veh_inspection_categories) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/inspection-categories` |
| [`ga_veh_inspection_checkpoints`](aset-umum.md#ga_veh_inspection_checkpoints) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/inspection-checkpoints` |
| [`ga_veh_inspections`](aset-umum.md#ga_veh_inspections) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/assets/:id/inspections` |
| [`ga_veh_insurances`](aset-umum.md#ga_veh_insurances) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/assets/:id/insurances` |
| [`ga_veh_oil_logs`](aset-umum.md#ga_veh_oil_logs) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/assets/:id/oil-logs` |
| [`ga_veh_post_service_journal`](aset-umum.md#ga_veh_post_service_journal) | aset-umum | critical | tidak | Admin | `POST /api/ga/vehicle/assets/:id/services/:sid/journal` |
| [`ga_veh_reject_service`](aset-umum.md#ga_veh_reject_service) | aset-umum | critical | tidak | Admin | `PATCH /api/ga/vehicle/service-requests/:id/reject` |
| [`ga_veh_reject_tax_request`](aset-umum.md#ga_veh_reject_tax_request) | aset-umum | critical | tidak | Admin | `PATCH /api/ga/vehicle/tax-requests/:id/reject` |
| [`ga_veh_report`](aset-umum.md#ga_veh_report) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/assets/:id/report` |
| [`ga_veh_service_request_get`](aset-umum.md#ga_veh_service_request_get) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/service-requests/:id` |
| [`ga_veh_service_requests`](aset-umum.md#ga_veh_service_requests) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/service-requests` |
| [`ga_veh_services`](aset-umum.md#ga_veh_services) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/assets/:id/services` |
| [`ga_veh_tax_request_get`](aset-umum.md#ga_veh_tax_request_get) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/tax-requests/:id` |
| [`ga_veh_tax_requests`](aset-umum.md#ga_veh_tax_requests) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/tax-requests` |
| [`ga_veh_taxes`](aset-umum.md#ga_veh_taxes) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/assets/:id/taxes` |
| [`ga_veh_tires`](aset-umum.md#ga_veh_tires) | aset-umum | read | - | Admin | `GET /api/ga/vehicle/assets/:id/tires` |
| [`ga_veh_update`](aset-umum.md#ga_veh_update) | aset-umum | write | tidak | Admin | `PUT /api/ga/vehicle/assets/:id` |
| [`ga_veh_update_incident`](aset-umum.md#ga_veh_update_incident) | aset-umum | write | tidak | Admin | `PATCH /api/ga/vehicle/assets/:id/incidents/:iid` |
| [`ga_veh_update_insurance`](aset-umum.md#ga_veh_update_insurance) | aset-umum | write | tidak | Admin | `PATCH /api/ga/vehicle/assets/:id/insurances/:iid` |
| [`ga_veh_update_service`](aset-umum.md#ga_veh_update_service) | aset-umum | write | tidak | Admin | `PATCH /api/ga/vehicle/assets/:id/services/:sid` |
| [`ga_veh_update_tax`](aset-umum.md#ga_veh_update_tax) | aset-umum | write | tidak | Admin | `PATCH /api/ga/vehicle/assets/:id/taxes/:tid` |
| [`ga_veh_update_tire`](aset-umum.md#ga_veh_update_tire) | aset-umum | write | tidak | Admin | `PATCH /api/ga/vehicle/assets/:id/tires/:tid` |
| [`gam_asset_cat_create`](aset-umum.md#gam_asset_cat_create) | aset-umum | write | tidak | Admin | `POST /api/ga/master/asset-categories` |
| [`gam_asset_cat_delete`](aset-umum.md#gam_asset_cat_delete) | aset-umum | write | tidak | Admin | `DELETE /api/ga/master/asset-categories/:id` |
| [`gam_asset_cat_update`](aset-umum.md#gam_asset_cat_update) | aset-umum | write | tidak | Admin | `PUT /api/ga/master/asset-categories/:id` |
| [`gam_asset_categories`](aset-umum.md#gam_asset_categories) | aset-umum | read | - | Admin | `GET /api/ga/master/asset-categories` |
| [`gam_branch_create`](aset-umum.md#gam_branch_create) | aset-umum | write | tidak | Admin | `POST /api/ga/master/branches` |
| [`gam_branch_delete`](aset-umum.md#gam_branch_delete) | aset-umum | write | tidak | Admin | `DELETE /api/ga/master/branches/:id` |
| [`gam_branch_update`](aset-umum.md#gam_branch_update) | aset-umum | write | tidak | Admin | `PUT /api/ga/master/branches/:id` |
| [`gam_branches`](aset-umum.md#gam_branches) | aset-umum | read | - | Admin | `GET /api/ga/master/branches` |
| [`gam_cc_delete`](aset-umum.md#gam_cc_delete) | aset-umum | write | tidak | Admin | `DELETE /api/ga/master/cost-centers/:id` |
| [`gam_cc_update`](aset-umum.md#gam_cc_update) | aset-umum | write | tidak | Admin | `PUT /api/ga/master/cost-centers/:id` |
| [`gam_cost_center_create`](aset-umum.md#gam_cost_center_create) | aset-umum | write | tidak | Admin | `POST /api/ga/master/cost-centers` |
| [`gam_cost_centers`](aset-umum.md#gam_cost_centers) | aset-umum | read | - | Admin | `GET /api/ga/master/cost-centers` |
| [`gam_doctype_create`](aset-umum.md#gam_doctype_create) | aset-umum | write | tidak | Admin | `POST /api/ga/master/document-types` |
| [`gam_doctype_delete`](aset-umum.md#gam_doctype_delete) | aset-umum | write | tidak | Admin | `DELETE /api/ga/master/document-types/:id` |
| [`gam_doctype_update`](aset-umum.md#gam_doctype_update) | aset-umum | write | tidak | Admin | `PUT /api/ga/master/document-types/:id` |
| [`gam_document_types`](aset-umum.md#gam_document_types) | aset-umum | read | - | Admin | `GET /api/ga/master/document-types` |
| [`gam_invcat_create`](aset-umum.md#gam_invcat_create) | aset-umum | write | tidak | Admin | `POST /api/ga/master/inventory-categories` |
| [`gam_invcat_delete`](aset-umum.md#gam_invcat_delete) | aset-umum | write | tidak | Admin | `DELETE /api/ga/master/inventory-categories/:id` |
| [`gam_invcat_update`](aset-umum.md#gam_invcat_update) | aset-umum | write | tidak | Admin | `PUT /api/ga/master/inventory-categories/:id` |
| [`gam_inventory_categories`](aset-umum.md#gam_inventory_categories) | aset-umum | read | - | Admin | `GET /api/ga/master/inventory-categories` |
| [`gam_location_create`](aset-umum.md#gam_location_create) | aset-umum | write | tidak | Admin | `POST /api/ga/master/locations` |
| [`gam_location_delete`](aset-umum.md#gam_location_delete) | aset-umum | write | tidak | Admin | `DELETE /api/ga/master/locations/:id` |
| [`gam_location_update`](aset-umum.md#gam_location_update) | aset-umum | write | tidak | Admin | `PUT /api/ga/master/locations/:id` |
| [`gam_locations`](aset-umum.md#gam_locations) | aset-umum | read | - | Admin | `GET /api/ga/master/locations` |
| [`gd_create`](aset-umum.md#gd_create) | aset-umum | write | tidak | Admin | `POST /api/ga/documents` |
| [`gd_delete`](aset-umum.md#gd_delete) | aset-umum | critical | tidak | Admin | `DELETE /api/ga/documents/:id` |
| [`gd_get`](aset-umum.md#gd_get) | aset-umum | read | - | Admin | `GET /api/ga/documents/:id` |
| [`gd_list`](aset-umum.md#gd_list) | aset-umum | read | - | Admin | `GET /api/ga/documents` |
| [`gd_summary`](aset-umum.md#gd_summary) | aset-umum | read | - | Admin | `GET /api/ga/documents/summary` |
| [`gd_update`](aset-umum.md#gd_update) | aset-umum | write | tidak | Admin | `PUT /api/ga/documents/:id` |
| [`get_cash_position`](dashboard.md#get_cash_position) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/cash-position` |
| [`get_payable_schedule`](laporan.md#get_payable_schedule) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/payable-schedule` |
| [`get_receivable_schedule`](laporan.md#get_receivable_schedule) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/receivable-schedule` |
| [`get_trial_balance`](laporan.md#get_trial_balance) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/trial-balance` |
| [`gi_dashboard`](aset-umum.md#gi_dashboard) | aset-umum | read | - | Admin | `GET /api/ga/inventory/dashboard` |
| [`gi_export`](aset-umum.md#gi_export) | aset-umum | read | - | Admin | `GET /api/ga/inventory/export` |
| [`gi_item_create`](aset-umum.md#gi_item_create) | aset-umum | write | tidak | Admin | `POST /api/ga/inventory/items` |
| [`gi_item_get`](aset-umum.md#gi_item_get) | aset-umum | read | - | Admin | `GET /api/ga/inventory/items/:id` |
| [`gi_item_image_delete`](aset-umum.md#gi_item_image_delete) | aset-umum | write | tidak | Admin | `DELETE /api/ga/inventory/items/:id/image` |
| [`gi_item_update`](aset-umum.md#gi_item_update) | aset-umum | write | tidak | Admin | `PUT /api/ga/inventory/items/:id` |
| [`gi_items`](aset-umum.md#gi_items) | aset-umum | read | - | Admin | `GET /api/ga/inventory/items` |
| [`gi_items_summary`](aset-umum.md#gi_items_summary) | aset-umum | read | - | Admin | `GET /api/ga/inventory/items/summary` |
| [`gi_low_stock`](aset-umum.md#gi_low_stock) | aset-umum | read | - | Admin | `GET /api/ga/inventory/low-stock` |
| [`gi_movement_create`](aset-umum.md#gi_movement_create) | aset-umum | critical | tidak | Admin | `POST /api/ga/inventory/movements` |
| [`gi_movements`](aset-umum.md#gi_movements) | aset-umum | read | - | Admin | `GET /api/ga/inventory/movements` |
| [`gi_stock_set`](aset-umum.md#gi_stock_set) | aset-umum | critical | tidak | Admin | `POST /api/ga/inventory/stock-set` |
| [`gm_schedule_create`](aset-umum.md#gm_schedule_create) | aset-umum | write | tidak | Admin | `POST /api/ga/maintenance/schedules` |
| [`gm_schedule_update`](aset-umum.md#gm_schedule_update) | aset-umum | write | tidak | Admin | `PUT /api/ga/maintenance/schedules/:id` |
| [`gm_schedules`](aset-umum.md#gm_schedules) | aset-umum | read | - | Admin | `GET /api/ga/maintenance/schedules` |
| [`gm_wo_add_parts`](aset-umum.md#gm_wo_add_parts) | aset-umum | critical | tidak | Admin | `POST /api/ga/maintenance/work-orders/:id/parts` |
| [`gm_wo_assign`](aset-umum.md#gm_wo_assign) | aset-umum | write | tidak | Admin | `PATCH /api/ga/maintenance/work-orders/:id/assign` |
| [`gm_wo_cancel`](aset-umum.md#gm_wo_cancel) | aset-umum | critical | tidak | Admin | `PATCH /api/ga/maintenance/work-orders/:id/cancel` |
| [`gm_wo_close`](aset-umum.md#gm_wo_close) | aset-umum | write | tidak | Admin | `PATCH /api/ga/maintenance/work-orders/:id/close` |
| [`gm_wo_complete`](aset-umum.md#gm_wo_complete) | aset-umum | write | tidak | Admin | `PATCH /api/ga/maintenance/work-orders/:id/complete` |
| [`gm_wo_create`](aset-umum.md#gm_wo_create) | aset-umum | write | ya | Admin | `POST /api/ga/maintenance/work-orders` |
| [`gm_wo_get`](aset-umum.md#gm_wo_get) | aset-umum | read | - | Admin | `GET /api/ga/maintenance/work-orders/:id` |
| [`gm_wo_list`](aset-umum.md#gm_wo_list) | aset-umum | read | - | Admin | `GET /api/ga/maintenance/work-orders` |
| [`gm_wo_start`](aset-umum.md#gm_wo_start) | aset-umum | write | tidak | Admin | `PATCH /api/ga/maintenance/work-orders/:id/start` |
| [`gm_wo_summary`](aset-umum.md#gm_wo_summary) | aset-umum | read | - | Admin | `GET /api/ga/maintenance/work-orders/summary` |
| [`gmr_approve`](aset-umum.md#gmr_approve) | aset-umum | critical | tidak | Admin | `PATCH /api/ga/material-requests/:id/approve` |
| [`gmr_cancel`](aset-umum.md#gmr_cancel) | aset-umum | critical | tidak | Admin | `PATCH /api/ga/material-requests/:id/cancel` |
| [`gmr_create`](aset-umum.md#gmr_create) | aset-umum | write | ya | Admin | `POST /api/ga/material-requests` |
| [`gmr_create_from_wo`](aset-umum.md#gmr_create_from_wo) | aset-umum | write | ya | Admin | `POST /api/ga/material-requests/from-work-order/:workOrderId` |
| [`gmr_get`](aset-umum.md#gmr_get) | aset-umum | read | - | Admin | `GET /api/ga/material-requests/:id` |
| [`gmr_list`](aset-umum.md#gmr_list) | aset-umum | read | - | Admin | `GET /api/ga/material-requests` |
| [`gmr_procurement_update`](aset-umum.md#gmr_procurement_update) | aset-umum | write | tidak | Admin | `PATCH /api/ga/material-requests/:id/items/:itemId/procurement` |
| [`gmr_receive_item`](aset-umum.md#gmr_receive_item) | aset-umum | critical | tidak | Admin | `PATCH /api/ga/material-requests/:id/items/:itemId/receive` |
| [`gmr_reject`](aset-umum.md#gmr_reject) | aset-umum | critical | tidak | Admin | `PATCH /api/ga/material-requests/:id/reject` |
| [`gmr_submit`](aset-umum.md#gmr_submit) | aset-umum | write | ya | Admin | `PATCH /api/ga/material-requests/:id/submit` |
| [`gmr_summary`](aset-umum.md#gmr_summary) | aset-umum | read | - | Admin | `GET /api/ga/material-requests/summary` |
| [`gmr_update`](aset-umum.md#gmr_update) | aset-umum | write | ya | Admin | `PUT /api/ga/material-requests/:id` |
| [`gr_cancel`](pembelian.md#gr_cancel) | pembelian | critical | tidak | Admin | `POST /api/goods-receipts/:id/cancel` |
| [`gr_create`](pembelian.md#gr_create) | pembelian | critical | tidak | Admin, Accountant, StaffProduksi | `POST /api/goods-receipts` |
| [`gr_get`](pembelian.md#gr_get) | pembelian | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/goods-receipts/:id` |
| [`gr_list`](pembelian.md#gr_list) | pembelian | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/goods-receipts` |
| [`gr_pending`](pembelian.md#gr_pending) | pembelian | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/goods-receipts/pending` |
| [`hc_preview`](sistem.md#hc_preview) | sistem | read | - | Admin | `GET /api/health-check/preview/:check` |
| [`hc_run`](sistem.md#hc_run) | sistem | read | - | Admin | `GET /api/health-check` |
| [`inq_convert_payload`](penjualan.md#inq_convert_payload) | penjualan | write | tidak | Admin, Accountant, Viewer | `GET /api/inquiries/:id/convert-payload` |
| [`inq_create`](penjualan.md#inq_create) | penjualan | write | ya | Admin, Accountant | `POST /api/inquiries` |
| [`inq_delete`](penjualan.md#inq_delete) | penjualan | write | tidak | Admin, Accountant | `DELETE /api/inquiries/:id` |
| [`inq_get`](penjualan.md#inq_get) | penjualan | read | - | Admin, Accountant, Viewer | `GET /api/inquiries/:id` |
| [`inq_link`](penjualan.md#inq_link) | penjualan | write | tidak | Admin, Accountant | `POST /api/inquiries/:id/link` |
| [`inq_list`](penjualan.md#inq_list) | penjualan | read | - | Admin, Accountant, Viewer | `GET /api/inquiries` |
| [`inq_set_status`](penjualan.md#inq_set_status) | penjualan | write | tidak | Admin, Accountant | `PATCH /api/inquiries/:id/status` |
| [`inq_stats`](penjualan.md#inq_stats) | penjualan | read | - | Admin, Accountant, Viewer | `GET /api/inquiries/stats` |
| [`inq_summary`](penjualan.md#inq_summary) | penjualan | read | - | Admin, Accountant, Viewer | `GET /api/inquiries/summary` |
| [`inq_update`](penjualan.md#inq_update) | penjualan | write | ya | Admin, Accountant | `PUT /api/inquiries/:id` |
| [`inv_dash_by_category`](persediaan.md#inv_dash_by_category) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/dashboard/by-category` |
| [`inv_dash_metrics`](persediaan.md#inv_dash_metrics) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/dashboard/metrics` |
| [`inv_dash_movement_trend`](persediaan.md#inv_dash_movement_trend) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/dashboard/movement-trend` |
| [`inv_dash_recent_movements`](persediaan.md#inv_dash_recent_movements) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/dashboard/recent-movements` |
| [`inv_dash_stock_value`](persediaan.md#inv_dash_stock_value) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/dashboard/stock-value` |
| [`inv_dash_top_items`](persediaan.md#inv_dash_top_items) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/dashboard/top-items` |
| [`inv_item_batches`](persediaan.md#inv_item_batches) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/items/:id/batches` |
| [`inv_item_create`](persediaan.md#inv_item_create) | persediaan | write | tidak | Admin, Accountant, StaffProduksi | `POST /api/inventory/items` |
| [`inv_item_delete`](persediaan.md#inv_item_delete) | persediaan | critical | tidak | Admin, Accountant, StaffProduksi | `DELETE /api/inventory/items/:id` |
| [`inv_item_update`](persediaan.md#inv_item_update) | persediaan | write | tidak | Admin, Accountant, StaffProduksi | `PUT /api/inventory/items/:id` |
| [`inv_items_list`](persediaan.md#inv_items_list) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/items` |
| [`inv_items_summary`](persediaan.md#inv_items_summary) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/items/summary` |
| [`inv_mov_cancel`](persediaan.md#inv_mov_cancel) | persediaan | critical | tidak | Admin | `PUT /api/inventory/movements/:id/cancel` |
| [`inv_mov_create`](persediaan.md#inv_mov_create) | persediaan | critical | tidak | Admin, Accountant, StaffProduksi | `POST /api/inventory/movements` |
| [`inv_mov_get`](persediaan.md#inv_mov_get) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/movements/:id` |
| [`inv_mov_list`](persediaan.md#inv_mov_list) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/movements` |
| [`inv_mov_summary`](persediaan.md#inv_mov_summary) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/movements/summary` |
| [`inv_mov_update`](persediaan.md#inv_mov_update) | persediaan | critical | tidak | Admin, Accountant, StaffProduksi | `PUT /api/inventory/movements/:id` |
| [`je_cancel`](akuntansi.md#je_cancel) | akuntansi | critical | tidak | Admin, Accountant | `PATCH /api/journals/:id/cancel` |
| [`je_create`](akuntansi.md#je_create) | akuntansi | critical | tidak | Admin, Accountant | `POST /api/journals` |
| [`je_get`](akuntansi.md#je_get) | akuntansi | read | - | Admin, Accountant, Viewer | `GET /api/journals/:id` |
| [`je_list`](akuntansi.md#je_list) | akuntansi | read | - | Admin, Accountant, Viewer | `GET /api/journals` |
| [`kas_buat_draft_dari_baris`](kas-bank.md#kas_buat_draft_dari_baris) | kas-bank | write | ya | Admin, Accountant | `POST /api/cash-book-drafts` |
| [`kas_daftar_akun`](kas-bank.md#kas_daftar_akun) | kas-bank | read | - | Admin, Accountant, Viewer | `GET /api/cash-book-drafts/accounts` |
| [`kas_draft_buang`](kas-bank.md#kas_draft_buang) | kas-bank | write | ya | Admin, Accountant | `POST /api/cash-book-drafts/:id/discard` |
| [`kas_draft_get`](kas-bank.md#kas_draft_get) | kas-bank | read | - | Admin, Accountant, Viewer | `GET /api/cash-book-drafts/:id` |
| [`kas_draft_list`](kas-bank.md#kas_draft_list) | kas-bank | read | - | Admin, Accountant, Viewer | `GET /api/cash-book-drafts` |
| [`kas_draft_posting`](kas-bank.md#kas_draft_posting) | kas-bank | critical | tidak | Admin, Accountant | `POST /api/cash-book-drafts/:id/post` |
| [`kas_draft_tambah_baris`](kas-bank.md#kas_draft_tambah_baris) | kas-bank | write | ya | Admin, Accountant | `POST /api/cash-book-drafts/:id/rows` |
| [`kas_draft_ubah_baris`](kas-bank.md#kas_draft_ubah_baris) | kas-bank | write | ya | Admin, Accountant | `PUT /api/cash-book-drafts/:id/rows` |
| [`kas_draft_ubah_header`](kas-bank.md#kas_draft_ubah_header) | kas-bank | write | ya | Admin, Accountant | `PUT /api/cash-book-drafts/:id` |
| [`kas_pola_terpelajari`](kas-bank.md#kas_pola_terpelajari) | kas-bank | read | - | Admin, Accountant, Viewer | `GET /api/cash-book-drafts/learned-maps` |
| [`mach_create`](produksi.md#mach_create) | produksi | write | tidak | Admin, Accountant, StaffProduksi | `POST /api/inventory/machines` |
| [`mach_delete`](produksi.md#mach_delete) | produksi | critical | tidak | Admin, Accountant, StaffProduksi | `DELETE /api/inventory/machines/:id` |
| [`mach_get`](produksi.md#mach_get) | produksi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/machines/:id` |
| [`mach_list`](produksi.md#mach_list) | produksi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/machines` |
| [`mach_update`](produksi.md#mach_update) | produksi | write | tidak | Admin, Accountant, StaffProduksi | `PUT /api/inventory/machines/:id` |
| [`notif_list`](sistem.md#notif_list) | sistem | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/notifications` |
| [`notif_read`](sistem.md#notif_read) | sistem | write | tidak | Admin, Accountant, StaffProduksi, Viewer | `PATCH /api/notifications/:id/read` |
| [`notif_read_all`](sistem.md#notif_read_all) | sistem | write | tidak | Admin, Accountant, StaffProduksi, Viewer | `PATCH /api/notifications/read-all` |
| [`notif_types`](sistem.md#notif_types) | sistem | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/notifications/types` |
| [`notif_unread_count`](sistem.md#notif_unread_count) | sistem | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/notifications/unread-count` |
| [`opn_cancel`](persediaan.md#opn_cancel) | persediaan | critical | tidak | Admin | `PUT /api/stock-opname/:id/cancel` |
| [`opn_create`](persediaan.md#opn_create) | persediaan | critical | tidak | Admin, Accountant | `POST /api/stock-opname` |
| [`opn_get`](persediaan.md#opn_get) | persediaan | read | - | Admin, Accountant | `GET /api/stock-opname/:id` |
| [`opn_list`](persediaan.md#opn_list) | persediaan | read | - | Admin, Accountant | `GET /api/stock-opname` |
| [`party_create`](master-data.md#party_create) | master-data | write | tidak | Admin, Accountant, StaffProduksi | `POST /api/parties` |
| [`party_dashboard`](master-data.md#party_dashboard) | master-data | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/parties/dashboard` |
| [`party_delete`](master-data.md#party_delete) | master-data | critical | tidak | Admin | `DELETE /api/parties/:id` |
| [`party_get`](master-data.md#party_get) | master-data | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/parties/:id` |
| [`party_search`](master-data.md#party_search) | master-data | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/parties` |
| [`party_similar`](master-data.md#party_similar) | master-data | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/parties/similar` |
| [`party_summary`](master-data.md#party_summary) | master-data | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/parties/summary` |
| [`party_update`](master-data.md#party_update) | master-data | write | tidak | Admin, Accountant, StaffProduksi | `PUT /api/parties/:id` |
| [`pay_cancel`](kas-bank.md#pay_cancel) | kas-bank | critical | tidak | Admin | `POST /api/payments/:id/cancel` |
| [`pay_cash_journals`](kas-bank.md#pay_cash_journals) | kas-bank | read | - | Admin, Accountant, Viewer | `GET /api/payments/cash-journals` |
| [`pay_get`](kas-bank.md#pay_get) | kas-bank | read | - | Admin, Accountant, Viewer | `GET /api/payments/:id` |
| [`pay_ledger`](kas-bank.md#pay_ledger) | kas-bank | read | - | Admin, Accountant, Viewer | `GET /api/payments/ledger` |
| [`pay_ledger_summary`](kas-bank.md#pay_ledger_summary) | kas-bank | read | - | Admin, Accountant, Viewer | `GET /api/payments/ledger/summary` |
| [`pay_list`](kas-bank.md#pay_list) | kas-bank | read | - | Admin, Accountant, Viewer | `GET /api/payments` |
| [`pay_record`](kas-bank.md#pay_record) | kas-bank | critical | tidak | Admin, Accountant | `POST /api/payments` |
| [`payreq_advances_summary`](pengajuan-pembayaran.md#payreq_advances_summary) | pengajuan-pembayaran | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/payment-requests/advances/summary` |
| [`payreq_approve`](pengajuan-pembayaran.md#payreq_approve) | pengajuan-pembayaran | critical | tidak | Admin, Accountant, StaffProduksi, Viewer | `POST /api/payment-requests/:id/approve` |
| [`payreq_attachment_add`](pengajuan-pembayaran.md#payreq_attachment_add) | pengajuan-pembayaran | write | ya | Admin, Accountant, StaffProduksi, Viewer | `POST /api/payment-requests/:id/attachments/json` |
| [`payreq_attachment_delete`](pengajuan-pembayaran.md#payreq_attachment_delete) | pengajuan-pembayaran | write | tidak | Admin, Accountant, StaffProduksi, Viewer | `DELETE /api/payment-requests/:id/attachments/:attId` |
| [`payreq_cancel`](pengajuan-pembayaran.md#payreq_cancel) | pengajuan-pembayaran | critical | tidak | Admin, Accountant, StaffProduksi, Viewer | `POST /api/payment-requests/:id/cancel` |
| [`payreq_cancel_payment`](pengajuan-pembayaran.md#payreq_cancel_payment) | pengajuan-pembayaran | critical | tidak | Admin, Accountant | `POST /api/payment-requests/:id/cancel-payment` |
| [`payreq_create`](pengajuan-pembayaran.md#payreq_create) | pengajuan-pembayaran | write | ya | Admin, Accountant, StaffProduksi, Viewer | `POST /api/payment-requests` |
| [`payreq_get`](pengajuan-pembayaran.md#payreq_get) | pengajuan-pembayaran | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/payment-requests/:id` |
| [`payreq_list`](pengajuan-pembayaran.md#payreq_list) | pengajuan-pembayaran | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/payment-requests` |
| [`payreq_meta`](pengajuan-pembayaran.md#payreq_meta) | pengajuan-pembayaran | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/payment-requests/meta` |
| [`payreq_pay`](pengajuan-pembayaran.md#payreq_pay) | pengajuan-pembayaran | critical | tidak | Admin, Accountant | `POST /api/payment-requests/:id/pay` |
| [`payreq_reject`](pengajuan-pembayaran.md#payreq_reject) | pengajuan-pembayaran | critical | tidak | Admin, Accountant, StaffProduksi, Viewer | `POST /api/payment-requests/:id/reject` |
| [`payreq_return`](pengajuan-pembayaran.md#payreq_return) | pengajuan-pembayaran | critical | tidak | Admin, Accountant, StaffProduksi, Viewer | `POST /api/payment-requests/:id/return` |
| [`payreq_set_accounts`](pengajuan-pembayaran.md#payreq_set_accounts) | pengajuan-pembayaran | write | tidak | Admin, Accountant | `PUT /api/payment-requests/:id/accounts` |
| [`payreq_settlement_approve`](pengajuan-pembayaran.md#payreq_settlement_approve) | pengajuan-pembayaran | critical | tidak | Admin, Accountant, StaffProduksi, Viewer | `POST /api/payment-requests/:id/settlement/approve` |
| [`payreq_settlement_cancel_posting`](pengajuan-pembayaran.md#payreq_settlement_cancel_posting) | pengajuan-pembayaran | critical | tidak | Admin, Accountant | `POST /api/payment-requests/:id/settlement/cancel-posting` |
| [`payreq_settlement_post`](pengajuan-pembayaran.md#payreq_settlement_post) | pengajuan-pembayaran | critical | tidak | Admin, Accountant | `POST /api/payment-requests/:id/settlement/post` |
| [`payreq_settlement_preview`](pengajuan-pembayaran.md#payreq_settlement_preview) | pengajuan-pembayaran | read | - | Admin, Accountant | `POST /api/payment-requests/:id/settlement/preview` |
| [`payreq_settlement_return`](pengajuan-pembayaran.md#payreq_settlement_return) | pengajuan-pembayaran | critical | tidak | Admin, Accountant, StaffProduksi, Viewer | `POST /api/payment-requests/:id/settlement/return` |
| [`payreq_settlement_save`](pengajuan-pembayaran.md#payreq_settlement_save) | pengajuan-pembayaran | write | ya | Admin, Accountant, StaffProduksi, Viewer | `PUT /api/payment-requests/:id/settlement` |
| [`payreq_settlement_submit`](pengajuan-pembayaran.md#payreq_settlement_submit) | pengajuan-pembayaran | write | ya | Admin, Accountant, StaffProduksi, Viewer | `POST /api/payment-requests/:id/settlement/submit` |
| [`payreq_submit`](pengajuan-pembayaran.md#payreq_submit) | pengajuan-pembayaran | write | ya | Admin, Accountant, StaffProduksi, Viewer | `POST /api/payment-requests/:id/submit` |
| [`payreq_summary`](pengajuan-pembayaran.md#payreq_summary) | pengajuan-pembayaran | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/payment-requests/summary` |
| [`payreq_update`](pengajuan-pembayaran.md#payreq_update) | pengajuan-pembayaran | write | ya | Admin, Accountant, StaffProduksi, Viewer | `PUT /api/payment-requests/:id` |
| [`payreqtype_create`](pengajuan-pembayaran.md#payreqtype_create) | pengajuan-pembayaran | write | tidak | Admin | `POST /api/payment-request-types` |
| [`payreqtype_delete`](pengajuan-pembayaran.md#payreqtype_delete) | pengajuan-pembayaran | write | tidak | Admin | `DELETE /api/payment-request-types/:id` |
| [`payreqtype_list`](pengajuan-pembayaran.md#payreqtype_list) | pengajuan-pembayaran | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/payment-request-types` |
| [`payreqtype_update`](pengajuan-pembayaran.md#payreqtype_update) | pengajuan-pembayaran | write | tidak | Admin | `PUT /api/payment-request-types/:id` |
| [`pg_cancel`](kas-bank.md#pg_cancel) | kas-bank | critical | tidak | Admin | `PATCH /api/project-guarantees/:id/cancel` |
| [`pg_create`](kas-bank.md#pg_create) | kas-bank | critical | tidak | Admin, Accountant | `POST /api/project-guarantees` |
| [`pg_get`](kas-bank.md#pg_get) | kas-bank | read | - | Admin, Accountant, Viewer | `GET /api/project-guarantees/:id` |
| [`pg_list`](kas-bank.md#pg_list) | kas-bank | read | - | Admin, Accountant, Viewer | `GET /api/project-guarantees` |
| [`pg_settle`](kas-bank.md#pg_settle) | kas-bank | critical | tidak | Admin, Accountant | `POST /api/project-guarantees/:id/settle` |
| [`pg_settlement_cancel`](kas-bank.md#pg_settlement_cancel) | kas-bank | critical | tidak | Admin | `POST /api/project-guarantees/settlements/:id/cancel` |
| [`pg_summary`](kas-bank.md#pg_summary) | kas-bank | read | - | Admin, Accountant, Viewer | `GET /api/project-guarantees/summary` |
| [`pi_cancel`](pembelian.md#pi_cancel) | pembelian | critical | tidak | Admin | `POST /api/purchase/invoices/:id/cancel` |
| [`pi_create`](pembelian.md#pi_create) | pembelian | critical | ya | Admin, Accountant, StaffProduksi | `POST /api/purchase/invoices` |
| [`pi_get`](pembelian.md#pi_get) | pembelian | read | - | Admin, Accountant, StaffProduksi | `GET /api/purchase/invoices/:id` |
| [`pi_list`](pembelian.md#pi_list) | pembelian | read | - | Admin, Accountant, StaffProduksi | `GET /api/purchase/invoices` |
| [`pi_match_preview`](pembelian.md#pi_match_preview) | pembelian | read | - | Admin, Accountant, StaffProduksi | `POST /api/purchase/invoices/match-preview` |
| [`pi_revise_price`](pembelian.md#pi_revise_price) | pembelian | critical | ya | Admin, Accountant, StaffProduksi | `POST /api/purchase/invoices/:id/revise-price` |
| [`pi_summary`](pembelian.md#pi_summary) | pembelian | read | - | Admin, Accountant, StaffProduksi | `GET /api/purchase/invoices/summary` |
| [`pi_update`](pembelian.md#pi_update) | pembelian | write | tidak | Admin, Accountant, StaffProduksi | `PUT /api/purchase/invoices/:id` |
| [`po_cancel`](pembelian.md#po_cancel) | pembelian | critical | tidak | Admin | `POST /api/purchase-orders/:id/cancel` |
| [`po_close`](pembelian.md#po_close) | pembelian | critical | tidak | Admin | `POST /api/purchase-orders/:id/close` |
| [`po_create`](pembelian.md#po_create) | pembelian | write | ya | Admin, Accountant, StaffProduksi | `POST /api/purchase-orders` |
| [`po_delete`](pembelian.md#po_delete) | pembelian | write | ya | Admin, Accountant, StaffProduksi | `DELETE /api/purchase-orders/:id` |
| [`po_get`](pembelian.md#po_get) | pembelian | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/purchase-orders/:id` |
| [`po_list`](pembelian.md#po_list) | pembelian | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/purchase-orders` |
| [`po_submit`](pembelian.md#po_submit) | pembelian | write | ya | Admin, Accountant, StaffProduksi | `POST /api/purchase-orders/:id/submit` |
| [`po_update`](pembelian.md#po_update) | pembelian | write | ya | Admin, Accountant, StaffProduksi | `PUT /api/purchase-orders/:id` |
| [`prod_cost_create`](produksi.md#prod_cost_create) | produksi | write | tidak | Admin, Accountant, StaffProduksi | `POST /api/inventory/production-cost-standards` |
| [`prod_cost_delete`](produksi.md#prod_cost_delete) | produksi | critical | tidak | Admin | `DELETE /api/inventory/production-cost-standards/:id` |
| [`prod_cost_list`](produksi.md#prod_cost_list) | produksi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/production-cost-standards` |
| [`prod_cost_update`](produksi.md#prod_cost_update) | produksi | write | tidak | Admin, Accountant, StaffProduksi | `PUT /api/inventory/production-cost-standards/:id` |
| [`prod_dash_oee`](produksi.md#prod_dash_oee) | produksi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/dashboard/oee` |
| [`prod_dash_production`](produksi.md#prod_dash_production) | produksi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/dashboard/production` |
| [`prod_dash_stats`](produksi.md#prod_dash_stats) | produksi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/dashboard/production-stats` |
| [`prod_dash_yield_trend`](produksi.md#prod_dash_yield_trend) | produksi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/dashboard/yield-trend` |
| [`prod_draft_create`](produksi.md#prod_draft_create) | produksi | write | ya | Admin, Accountant, StaffProduksi | `POST /api/inventory/production-runs` |
| [`prod_draft_delete`](produksi.md#prod_draft_delete) | produksi | write | ya | Admin, Accountant, StaffProduksi | `DELETE /api/inventory/production-runs/drafts/:id` |
| [`prod_draft_get`](produksi.md#prod_draft_get) | produksi | read | - | Admin, Accountant, StaffProduksi | `GET /api/inventory/production-runs/drafts/:id` |
| [`prod_draft_list`](produksi.md#prod_draft_list) | produksi | read | - | Admin, Accountant, StaffProduksi | `GET /api/inventory/production-runs/drafts` |
| [`prod_draft_post`](produksi.md#prod_draft_post) | produksi | critical | ya | Admin, Accountant, StaffProduksi | `POST /api/inventory/production-runs/drafts/:id/post` |
| [`prod_draft_update`](produksi.md#prod_draft_update) | produksi | write | ya | Admin, Accountant, StaffProduksi | `PUT /api/inventory/production-runs/drafts/:id` |
| [`prod_proc_create`](produksi.md#prod_proc_create) | produksi | write | tidak | Admin, Accountant, StaffProduksi | `POST /api/inventory/production-processes` |
| [`prod_proc_delete`](produksi.md#prod_proc_delete) | produksi | critical | tidak | Admin | `DELETE /api/inventory/production-processes/:id` |
| [`prod_proc_list`](produksi.md#prod_proc_list) | produksi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/inventory/production-processes` |
| [`prod_proc_update`](produksi.md#prod_proc_update) | produksi | write | tidak | Admin, Accountant, StaffProduksi | `PUT /api/inventory/production-processes/:id` |
| [`prod_run_cancel`](produksi.md#prod_run_cancel) | produksi | critical | tidak | Admin | `PUT /api/inventory/production-runs/:id/cancel` |
| [`prod_run_get`](produksi.md#prod_run_get) | produksi | read | - | Admin, Accountant, StaffProduksi | `GET /api/inventory/production-runs/:id` |
| [`prod_run_list`](produksi.md#prod_run_list) | produksi | read | - | Admin, Accountant, StaffProduksi | `GET /api/inventory/production-runs` |
| [`prod_run_summary`](produksi.md#prod_run_summary) | produksi | read | - | Admin, Accountant, StaffProduksi | `GET /api/inventory/production-runs/summary` |
| [`prod_run_update`](produksi.md#prod_run_update) | produksi | critical | ya | Admin, Accountant, StaffProduksi | `PUT /api/inventory/production-runs/:id` |
| [`quot_accept`](penjualan.md#quot_accept) | penjualan | write | tidak | Admin, Accountant | `PATCH /api/quotations/:id/accept` |
| [`quot_cancel`](penjualan.md#quot_cancel) | penjualan | critical | tidak | Admin | `PATCH /api/quotations/:id/cancel` |
| [`quot_convert_payload`](penjualan.md#quot_convert_payload) | penjualan | read | - | Admin, Accountant, Viewer | `GET /api/quotations/:id/convert-payload` |
| [`quot_create`](penjualan.md#quot_create) | penjualan | write | ya | Admin, Accountant | `POST /api/quotations` |
| [`quot_delete`](penjualan.md#quot_delete) | penjualan | write | tidak | Admin, Accountant | `DELETE /api/quotations/:id` |
| [`quot_get`](penjualan.md#quot_get) | penjualan | read | - | Admin, Accountant, Viewer | `GET /api/quotations/:id` |
| [`quot_link`](penjualan.md#quot_link) | penjualan | write | tidak | Admin, Accountant | `POST /api/quotations/:id/link` |
| [`quot_list`](penjualan.md#quot_list) | penjualan | read | - | Admin, Accountant, Viewer | `GET /api/quotations` |
| [`quot_reject`](penjualan.md#quot_reject) | penjualan | write | tidak | Admin, Accountant | `PATCH /api/quotations/:id/reject` |
| [`quot_send`](penjualan.md#quot_send) | penjualan | write | tidak | Admin, Accountant | `PATCH /api/quotations/:id/send` |
| [`quot_stats`](penjualan.md#quot_stats) | penjualan | read | - | Admin, Accountant, Viewer | `GET /api/quotations/stats` |
| [`quot_summary`](penjualan.md#quot_summary) | penjualan | read | - | Admin, Accountant, Viewer | `GET /api/quotations/summary` |
| [`quot_update`](penjualan.md#quot_update) | penjualan | write | ya | Admin, Accountant | `PUT /api/quotations/:id` |
| [`rec_create`](kas-bank.md#rec_create) | kas-bank | write | ya | Admin, Accountant | `POST /api/recurring` |
| [`rec_delete`](kas-bank.md#rec_delete) | kas-bank | write | ya | Admin, Accountant | `DELETE /api/recurring/:id` |
| [`rec_execute`](kas-bank.md#rec_execute) | kas-bank | critical | tidak | Admin, Accountant | `POST /api/recurring/:id/execute` |
| [`rec_list`](kas-bank.md#rec_list) | kas-bank | read | - | Admin, Accountant | `GET /api/recurring` |
| [`rec_update`](kas-bank.md#rec_update) | kas-bank | write | ya | Admin, Accountant | `PUT /api/recurring/:id` |
| [`recon_add_items`](kas-bank.md#recon_add_items) | kas-bank | write | ya | Admin, Accountant | `POST /api/reconciliation/:id/items` |
| [`recon_complete`](kas-bank.md#recon_complete) | kas-bank | critical | tidak | Admin, Accountant | `POST /api/reconciliation/:id/complete` |
| [`recon_create`](kas-bank.md#recon_create) | kas-bank | write | ya | Admin, Accountant | `POST /api/reconciliation` |
| [`recon_delete`](kas-bank.md#recon_delete) | kas-bank | write | ya | Admin, Accountant | `DELETE /api/reconciliation/:id` |
| [`recon_get`](kas-bank.md#recon_get) | kas-bank | read | - | Admin, Accountant | `GET /api/reconciliation/:id` |
| [`recon_list`](kas-bank.md#recon_list) | kas-bank | read | - | Admin, Accountant | `GET /api/reconciliation` |
| [`recon_match`](kas-bank.md#recon_match) | kas-bank | write | ya | Admin, Accountant | `PATCH /api/reconciliation/:id/match` |
| [`recon_unmatch`](kas-bank.md#recon_unmatch) | kas-bank | write | ya | Admin, Accountant | `PATCH /api/reconciliation/:id/unmatch` |
| [`rpt_aging`](laporan.md#rpt_aging) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/aging` |
| [`rpt_balance_sheet`](laporan.md#rpt_balance_sheet) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/balance-sheet` |
| [`rpt_cash_flow`](laporan.md#rpt_cash_flow) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/cash-flow` |
| [`rpt_daily`](laporan.md#rpt_daily) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/daily` |
| [`rpt_dash_aging_summary`](dashboard.md#rpt_dash_aging_summary) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/aging-summary` |
| [`rpt_dash_cash_flow`](dashboard.md#rpt_dash_cash_flow) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/cash-flow` |
| [`rpt_dash_charts`](dashboard.md#rpt_dash_charts) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/charts` |
| [`rpt_dash_expense_breakdown`](dashboard.md#rpt_dash_expense_breakdown) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/expense-breakdown` |
| [`rpt_dash_financial_ratios`](dashboard.md#rpt_dash_financial_ratios) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/financial-ratios` |
| [`rpt_dash_maintenance`](dashboard.md#rpt_dash_maintenance) | dashboard | read | - | Admin | `GET /api/dashboard/maintenance` |
| [`rpt_dash_monthly_profit`](dashboard.md#rpt_dash_monthly_profit) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/monthly-profit` |
| [`rpt_dash_negative_stock`](dashboard.md#rpt_dash_negative_stock) | dashboard | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/dashboard/negative-stock` |
| [`rpt_dash_overdue`](dashboard.md#rpt_dash_overdue) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/overdue` |
| [`rpt_dash_pending_do`](dashboard.md#rpt_dash_pending_do) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/pending-do` |
| [`rpt_dash_stock_alerts`](dashboard.md#rpt_dash_stock_alerts) | dashboard | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/dashboard/stock-alerts` |
| [`rpt_dash_top_customers`](dashboard.md#rpt_dash_top_customers) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/top-customers` |
| [`rpt_dash_top_vendors`](dashboard.md#rpt_dash_top_vendors) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/top-vendors` |
| [`rpt_dash_upcoming_due`](dashboard.md#rpt_dash_upcoming_due) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/upcoming-due` |
| [`rpt_dashboard`](dashboard.md#rpt_dashboard) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/metrics` |
| [`rpt_fa_dashboard`](dashboard.md#rpt_fa_dashboard) | dashboard | read | - | Admin, Accountant, Viewer | `GET /api/dashboard/fixed-assets` |
| [`rpt_hpp`](laporan.md#rpt_hpp) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/hpp` |
| [`rpt_ledger_book`](laporan.md#rpt_ledger_book) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/ledger-book` |
| [`rpt_ledger_detail`](laporan.md#rpt_ledger_detail) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/ledger-detail` |
| [`rpt_po_outstanding`](laporan.md#rpt_po_outstanding) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/po-outstanding` |
| [`rpt_production_cost_summary`](laporan.md#rpt_production_cost_summary) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/production-cost-summary` |
| [`rpt_profit_loss`](laporan.md#rpt_profit_loss) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/profit-loss` |
| [`rpt_profitability_sku`](laporan.md#rpt_profitability_sku) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/profitability-per-sku` |
| [`rpt_supplier_performance`](laporan.md#rpt_supplier_performance) | laporan | read | - | Admin, Accountant, Viewer | `GET /api/reports/supplier-performance` |
| [`search_global`](sistem.md#search_global) | sistem | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/search` |
| [`set_company_get`](sistem.md#set_company_get) | sistem | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/settings/company` |
| [`set_company_update`](sistem.md#set_company_update) | sistem | critical | tidak | Admin | `PUT /api/settings/company` |
| [`si_cancel`](penjualan.md#si_cancel) | penjualan | critical | tidak | Admin | `POST /api/sales/invoices/:id/cancel` |
| [`si_create`](penjualan.md#si_create) | penjualan | critical | tidak | Admin, Accountant | `POST /api/sales/invoices` |
| [`si_get`](penjualan.md#si_get) | penjualan | read | - | Admin, Accountant, Viewer | `GET /api/sales/invoices/:id` |
| [`si_list`](penjualan.md#si_list) | penjualan | read | - | Admin, Accountant, Viewer | `GET /api/sales/invoices` |
| [`si_summary`](penjualan.md#si_summary) | penjualan | read | - | Admin, Accountant, Viewer | `GET /api/sales/invoices/summary` |
| [`si_update`](penjualan.md#si_update) | penjualan | write | tidak | Admin, Accountant | `PUT /api/sales/invoices/:id` |
| [`so_cancel`](penjualan.md#so_cancel) | penjualan | critical | tidak | Admin, Accountant, StaffProduksi | `POST /api/sales-orders/:id/cancel` |
| [`so_create`](penjualan.md#so_create) | penjualan | write | ya | Admin, Accountant, StaffProduksi | `POST /api/sales-orders` |
| [`so_generate_do`](penjualan.md#so_generate_do) | penjualan | critical | tidak | Admin, Accountant, StaffProduksi | `POST /api/sales-orders/:id/generate-do` |
| [`so_get`](penjualan.md#so_get) | penjualan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/sales-orders/:id` |
| [`so_list`](penjualan.md#so_list) | penjualan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/sales-orders` |
| [`so_submit`](penjualan.md#so_submit) | penjualan | write | tidak | Admin, Accountant, StaffProduksi | `POST /api/sales-orders/:id/submit` |
| [`so_summary`](penjualan.md#so_summary) | penjualan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/sales-orders/summary` |
| [`so_update`](penjualan.md#so_update) | penjualan | write | ya | Admin, Accountant, StaffProduksi | `PUT /api/sales-orders/:id` |
| [`sret_cancel`](penjualan.md#sret_cancel) | penjualan | critical | tidak | Admin | `POST /api/sales-returns/:id/cancel` |
| [`sret_create`](penjualan.md#sret_create) | penjualan | critical | ya | Admin, Accountant, StaffProduksi | `POST /api/sales-returns` |
| [`sret_eligible`](penjualan.md#sret_eligible) | penjualan | read | - | Admin, Accountant, StaffProduksi | `GET /api/sales-returns/eligible/:invoiceId` |
| [`sret_get`](penjualan.md#sret_get) | penjualan | read | - | Admin, Accountant, StaffProduksi | `GET /api/sales-returns/:id` |
| [`sret_list`](penjualan.md#sret_list) | penjualan | read | - | Admin, Accountant, StaffProduksi | `GET /api/sales-returns` |
| [`stf_cancel`](persediaan.md#stf_cancel) | persediaan | critical | tidak | Admin, Accountant, StaffProduksi | `PATCH /api/stock-transfers/:id/cancel` |
| [`stf_create`](persediaan.md#stf_create) | persediaan | critical | tidak | Admin, Accountant, StaffProduksi | `POST /api/stock-transfers` |
| [`stf_get`](persediaan.md#stf_get) | persediaan | read | - | Admin, Accountant, StaffProduksi | `GET /api/stock-transfers/:id` |
| [`stf_list`](persediaan.md#stf_list) | persediaan | read | - | Admin, Accountant, StaffProduksi | `GET /api/stock-transfers` |
| [`stf_mark_printed`](persediaan.md#stf_mark_printed) | persediaan | write | tidak | Admin, Accountant, StaffProduksi | `POST /api/stock-transfers/:id/mark-printed` |
| [`stf_update`](persediaan.md#stf_update) | persediaan | write | tidak | Admin, Accountant, StaffProduksi | `PATCH /api/stock-transfers/:id` |
| [`svc_create`](master-data.md#svc_create) | master-data | write | tidak | Admin, Accountant | `POST /api/service-items` |
| [`svc_delete`](master-data.md#svc_delete) | master-data | write | tidak | Admin | `DELETE /api/service-items/:id` |
| [`svc_list`](master-data.md#svc_list) | master-data | read | - | Admin, Accountant, Viewer | `GET /api/service-items` |
| [`svc_update`](master-data.md#svc_update) | master-data | write | tidak | Admin, Accountant | `PATCH /api/service-items/:id` |
| [`sysacct_get`](akuntansi.md#sysacct_get) | akuntansi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/system-accounts` |
| [`sysacct_update`](akuntansi.md#sysacct_update) | akuntansi | critical | tidak | Admin | `PUT /api/system-accounts` |
| [`tax_create_config`](akuntansi.md#tax_create_config) | akuntansi | write | tidak | Admin | `POST /api/tax/config` |
| [`tax_delete_config`](akuntansi.md#tax_delete_config) | akuntansi | critical | tidak | Admin | `DELETE /api/tax/config/:id` |
| [`tax_get_config`](akuntansi.md#tax_get_config) | akuntansi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/tax/config` |
| [`tax_report`](akuntansi.md#tax_report) | akuntansi | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/tax/report` |
| [`tax_update_config`](akuntansi.md#tax_update_config) | akuntansi | write | tidak | Admin | `PUT /api/tax/config/:id` |
| [`tdn_cancel`](penjualan.md#tdn_cancel) | penjualan | critical | tidak | Admin | `POST /api/temporary-delivery-notes/:id/cancel` |
| [`tdn_create`](penjualan.md#tdn_create) | penjualan | write | ya | Admin, Accountant, StaffProduksi | `POST /api/temporary-delivery-notes` |
| [`tdn_get`](penjualan.md#tdn_get) | penjualan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/temporary-delivery-notes/:id` |
| [`tdn_link`](penjualan.md#tdn_link) | penjualan | write | tidak | Admin, Accountant, StaffProduksi | `POST /api/temporary-delivery-notes/:id/link` |
| [`tdn_linkable`](penjualan.md#tdn_linkable) | penjualan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/temporary-delivery-notes/linkable` |
| [`tdn_list`](penjualan.md#tdn_list) | penjualan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/temporary-delivery-notes` |
| [`tdn_summary`](penjualan.md#tdn_summary) | penjualan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/temporary-delivery-notes/summary` |
| [`tdn_update`](penjualan.md#tdn_update) | penjualan | write | ya | Admin, Accountant, StaffProduksi | `PUT /api/temporary-delivery-notes/:id` |
| [`vdep_apply`](pembelian.md#vdep_apply) | pembelian | critical | tidak | Admin, Accountant | `POST /api/vendor-deposits/apply` |
| [`vdep_apply_cancel`](pembelian.md#vdep_apply_cancel) | pembelian | critical | tidak | Admin | `POST /api/vendor-deposits/apply/:id/cancel` |
| [`vdep_balance`](pembelian.md#vdep_balance) | pembelian | read | - | Admin, Accountant, StaffProduksi | `GET /api/vendor-deposits/balance/:partyId` |
| [`vdep_cancel`](pembelian.md#vdep_cancel) | pembelian | critical | tidak | Admin, Accountant | `PATCH /api/vendor-deposits/:id/cancel` |
| [`vdep_list`](pembelian.md#vdep_list) | pembelian | read | - | Admin, Accountant, StaffProduksi | `GET /api/vendor-deposits` |
| [`vdep_refund`](pembelian.md#vdep_refund) | pembelian | critical | tidak | Admin, Accountant | `POST /api/vendor-deposits/:id/refund` |
| [`vdep_summary`](pembelian.md#vdep_summary) | pembelian | read | - | Admin, Accountant, StaffProduksi | `GET /api/vendor-deposits/summary` |
| [`wh_create`](persediaan.md#wh_create) | persediaan | write | tidak | Admin, Accountant | `POST /api/warehouses` |
| [`wh_delete`](persediaan.md#wh_delete) | persediaan | critical | tidak | Admin | `DELETE /api/warehouses/:id` |
| [`wh_get`](persediaan.md#wh_get) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/warehouses/:id` |
| [`wh_list`](persediaan.md#wh_list) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/warehouses` |
| [`wh_stock_snapshot`](persediaan.md#wh_stock_snapshot) | persediaan | read | - | Admin, Accountant, StaffProduksi, Viewer | `GET /api/warehouses/stock-snapshot` |
| [`wh_update`](persediaan.md#wh_update) | persediaan | write | tidak | Admin, Accountant | `PUT /api/warehouses/:id` |
