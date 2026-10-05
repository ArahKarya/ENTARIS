# Audit Registry Tool AIRA — Stage 0 (Oktober 2026)

Rekonsiliasi `server/src/ai/aira-tool-router.json` (dibangkitkan Juni 2026, 386 tool) terhadap kode API aktual (inventori statis `npm run ai-tools:inventory`: **539 route**). Hasil perbaikan: **462 tool** + **77 route denylist** (lihat [DENYLIST.md](DENYLIST.md)); semua tool `enabled:false`.

## 1. Ringkasan temuan

| Metrik | Registry lama | Registry baru |
|---|---|---|
| Tool | 386 | 462 |
| Route API nyata | 539 | 539 (100% tercakup: tool atau denylist) |
| Tool yang handler-nya hilang | 0 (alias `/api/ga/finance` sudah tidak ada di registry) | 0 |
| Route tanpa tool (endpoint baru sejak Juni) | **154** | 0 |
| Tool ber-handler ganda (duplikat) | 2 | 0 |
| Tool yang seharusnya TIDAK ada (denylist) | 58 | 0 |
| Deskripsi < 40 karakter | 293 (76%) | 2 (singkat tapi spesifik) |
| `input` kosong padahal route punya parameter | 72 | 0 |
| `input` tidak memuat sebagian parameter nyata | 181 (47%) | 0 (diturunkan dari Zod/query) |
| Tool dengan `toolset`/`draftCapable`/`postingEffect`/`params` | 0 | semua |
| Risk (read/write/critical) | 168 / 131 / 87 | 213 / 145 / 104 |

### Cacat terbesar registry lama

1. **Tool berbahaya terdaftar**: `auth_login`, `usr_create/update/toggle`, `usr_me_password`, `role_create/update/delete`, `bk_restore/bk_upload/bk_create`, `set_reset_data/set_gen_dummy/set_del_dummy`, `imp_*`, `ai_router_invoke`, `ai_cfg_*`, `tg_*`, `pub_*` (dari 58 tool lama yang kini denylist). Semuanya dikeluarkan.
2. **Cakupan**: 154 endpoint baru (Pengajuan Pembayaran 28, produksi draft, approvals pending/context, MR EAM, laporan PO-outstanding/supplier-performance/production-cost, dashboard maintenance/upcoming-due, audit summary/facets, parties summary, notifikasi types, dst.) tidak ada di registry.
3. **Risk salah**: 40 tool direklasifikasi (tabel §3). Yang terbesar: *write* untuk aksi yang langsung memposting GL/stok (`si_create`, `do_create`, `gr_create`, `pi_create`, `pay_record`, `inv_mov_create`, `stf_create`, `rec_execute`, ...) padahal tier write = Draft; sebaliknya delete master/draft yang ditandai *critical*.
4. **Parameter tak akurat**: hampir separuh tool tidak mencantumkan semua parameter nyata, tanpa penanda wajib/enum/tipe nested.
5. **Modul/izin tak sesuai guard** (11 tool, §4) dan **roles** tidak diturunkan dari matriks izin nyata (ga_* hanya Admin secara default; tool Viewer pada endpoint approvals padahal mount butuh `approvals`).
6. **Deskripsi lemah**: mayoritas satu frasa pendek tanpa filter/efek samping.
7. **Duplikat**: `inv_low_stock` = `inv_dash_metrics`; `gd_expiring` = `gd_list` (handler sama).
8. **Nama menyesatkan**: `prod_run_create` (sebenarnya membuat *draft*; kini `prod_draft_create`), `get_aging_receivable` (juga mengembalikan hutang; kini `rpt_aging`), `inv_low_stock` (dihapus, duplikat).

## 2. Endpoint baru yang ditambahkan (136)

- **persetujuan** (2): `appr_pending`, `appr_request_context`
- **sistem** (4): `audit_get`, `audit_facets`, `audit_summary`, `notif_types`
- **penjualan** (13): `cdep_summary`, `inq_summary`, `quot_summary`, `so_summary`, `si_summary`, `tdn_list`, `tdn_create`, `tdn_get`, `tdn_update`, `tdn_cancel`, `tdn_link`, `tdn_linkable`, `tdn_summary`
- **dashboard** (2): `rpt_dash_maintenance`, `rpt_dash_upcoming_due`
- **aset-umum** (60): `gd_summary`, `gi_dashboard`, `gi_export`, `gi_item_image_delete`, `gi_items_summary`, `gi_stock_set`, `gm_wo_summary`, `gmr_list`, `gmr_create`, `gmr_get`, `gmr_update`, `gmr_approve`, `gmr_cancel`, `gmr_procurement_update`, `gmr_receive_item`, `gmr_reject`, `gmr_submit`, `gmr_create_from_wo`, `gmr_summary`, `ga_veh_assign_driver`, `ga_veh_fuel_logs`, `ga_veh_add_fuel_log`, `ga_veh_delete_fuel_log`, `ga_veh_incidents`, `ga_veh_add_incident`, `ga_veh_delete_incident`, `ga_veh_update_incident`, `ga_veh_inspections`, `ga_veh_add_inspection`, `ga_veh_delete_inspection`, `ga_veh_delete_inspection_photo`, `ga_veh_insurances`, `ga_veh_add_insurance`, `ga_veh_delete_insurance`, `ga_veh_update_insurance`, `ga_veh_oil_logs`, `ga_veh_add_oil_log`, `ga_veh_delete_oil_log`, `ga_veh_report`, `ga_veh_cancel_service_journal`, `ga_veh_post_service_journal`, `ga_veh_create_tax_request`, `ga_veh_taxes`, `ga_veh_add_tax`, `ga_veh_delete_tax`, `ga_veh_update_tax`, `ga_veh_tires`, `ga_veh_add_tire`, `ga_veh_delete_tire`, `ga_veh_update_tire`, `ga_veh_fleet`, `ga_veh_fleet_report`, `ga_veh_fleet_summary`, `ga_veh_inspection_categories`, `ga_veh_inspection_checkpoints`, `ga_veh_tax_requests`, `ga_veh_tax_request_get`, `ga_veh_approve_tax_request`, `ga_veh_cancel_tax_request`, `ga_veh_reject_tax_request`
- **persediaan** (3): `inv_dash_stock_value`, `inv_items_summary`, `inv_mov_summary`
- **produksi** (6): `prod_draft_list`, `prod_draft_delete`, `prod_draft_get`, `prod_draft_update`, `prod_draft_post`, `prod_run_summary`
- **master-data** (2): `party_get`, `party_summary`
- **pengajuan-pembayaran** (31): `payreqtype_list`, `payreqtype_create`, `payreqtype_delete`, `payreqtype_update`, `payreq_list`, `payreq_create`, `payreq_get`, `payreq_update`, `payreq_set_accounts`, `payreq_approve`, `payreq_attachment_delete`, `payreq_cancel`, `payreq_cancel_payment`, `payreq_pay`, `payreq_reject`, `payreq_return`, `payreq_settlement_save`, `payreq_settlement_approve`, `payreq_settlement_cancel_posting`, `payreq_settlement_post`, `payreq_settlement_preview`, `payreq_settlement_return`, `payreq_settlement_submit`, `payreq_submit`, `payreq_advances_summary`, `eambill_list`, `eambill_cancel`, `eambill_pay`, `eambill_summary`, `payreq_meta`, `payreq_summary`
- **kas-bank** (3): `pay_ledger`, `pay_ledger_summary`, `pg_summary`
- **pembelian** (7): `po_delete`, `po_update`, `po_close`, `po_submit`, `pi_match_preview`, `pi_summary`, `vdep_summary`
- **laporan** (3): `rpt_po_outstanding`, `rpt_production_cost_summary`, `rpt_supplier_performance`

## 3. Reklasifikasi risk (40)

Aturan: *read* = GET/POST murni baca; *write* = membuat/mengubah draft atau keadaan reversibel tanpa posting; *critical* = posting GL/stok/WAC, batal/void/balik dokumen terposting, pembayaran, keputusan persetujuan, perubahan kontrol approval.

| Tool | Perubahan | Alasan / efek |
|---|---|---|
| `appr_request_revision` | write → critical | Tidak ada efek GL/stok. |
| `appr_rule_create` | write → critical | Tidak ada efek GL/stok; mengubah siapa yang harus menyetujui dokumen/pengajuan berikutnya (kontrol internal). |
| `appr_rule_update` | write → critical | Tidak ada efek GL/stok; mengubah kontrol persetujuan berikutnya. |
| `att_counts` | write → read | Hitung jumlah lampiran per dokumen secara batch (POST hanya karena body berisi daftar ID; tidak mengubah data). |
| `cdep_apply` | write → critical | GL: DR 2.1.2 Uang Muka Pelanggan / CR 1.2.1 Piutang Usaha sebesar amount. Invoice.outstanding berkurang (status PartiallyPaid/Paid) dan dibuat Custome |
| `do_create` | write → critical | Stok: pergerakan Keluar per item (stok turun, per gudang) dengan unitCost WAC terkunci saat kirim. TIDAK ada jurnal GL (HPP diposting invoice). Cabang |
| `do_update` | write → critical | Stok: membalik pergerakan keluar lama dan membuat pergerakan keluar baru (stok & WAC per item berubah). TIDAK ada jurnal GL. Bypass stok minus butuh c |
| `fa_import` | critical → write | Tidak ada efek GL/stok; hanya master aset + jadwal penyusutan (belum diposting). |
| `ga_asset_delete_photo` | critical → write | Tidak ada efek GL/stok; file foto dihapus permanen. |
| `gi_movement_create` | write → critical | Tidak ada jurnal GL (stok GA terpisah dari Persediaan akuntansi); mengubah stok GA per lokasi (GaStockByLocation) dan menulis log mutasi; tidak menyen |
| `gm_wo_add_parts` | write → critical | Stok inventaris GA (bukan stok ERP/GL): GaStockByLocation berkurang dan GaInventoryMovement OUT dibuat. Tidak ada jurnal GL. Tidak ada endpoint pengem |
| `gam_asset_cat_delete` | critical → write | Tidak ada efek GL/stok; baris master dihapus permanen (tidak bisa dibatalkan). |
| `gam_branch_delete` | critical → write | Tidak ada efek GL/stok; baris master dihapus permanen (tidak bisa dibatalkan). |
| `gam_cc_delete` | critical → write | Tidak ada efek GL/stok; baris master dihapus permanen (tidak bisa dibatalkan). |
| `gam_doctype_delete` | critical → write | Tidak ada efek GL/stok; baris master dihapus permanen (tidak bisa dibatalkan). |
| `gam_invcat_delete` | critical → write | Tidak ada efek GL/stok; baris master dihapus permanen (tidak bisa dibatalkan). |
| `gam_location_delete` | critical → write | Tidak ada efek GL/stok; baris master dihapus permanen (tidak bisa dibatalkan). |
| `ga_veh_add_service` | write → critical | Default: tidak ada GL (menunggu antrian Tagihan EAM). Bila postJournal=true: DR akun beban (default 6.7 Beban Pemeliharaan Kendaraan atau accountId) / |
| `ga_veh_approve_service` | write → critical | Tidak ada efek GL/stok. Membuat WO OPEN. Keputusan persetujuan tidak bisa ditarik. |
| `ga_veh_reject_service` | write → critical | Tidak ada efek GL/stok. |
| `gr_create` | write → critical | Stok masuk (StockMovement In) + stok per gudang bertambah; WAC dihitung ulang dengan lockedUnitCost (atau averageCost bila 0). Jurnal: DR Persediaan ( |
| `inq_delete` | critical → write | Tidak ada efek GL/stok. Data inquiry dihapus permanen (tidak ada undo). |
| `inq_convert_payload` | read → write | Tidak ada efek GL/stok. Efek samping: membuat master Pelanggan baru dan mengisi inquiry.partyId bila prospek belum terdaftar. |
| `inv_mov_create` | write → critical | Stok: +/- qty di gudang & total item; WAC dihitung ulang (rata-rata tertimbang) untuk In/AdjustmentIn dengan unitCost > 0. GL (bila qty x unitCost > 0 |
| `inv_mov_update` | write → critical | Membalik stok & jurnal lama (jurnal lama berstatus Cancelled), memposting stok & jurnal baru sesuai nilai baru (DR/CR Persediaan vs akun lawan seperti |
| `prod_run_update` | write → critical | Cabang bypass (Admin): stok input/output lama dibalik, WAC output dihitung ulang, jurnal lama dibatalkan, stok & jurnal baru diposting (JV-<runNo>-R<n |
| `pay_record` | write → critical | Receive: DR Kas/Bank (per split) / CR Piutang Usaha (1.2.1), outstanding SI turun. Pay: DR Hutang Usaha (2.1.1) / CR Kas/Bank (per split), outstanding |
| `pg_create` | write → critical | Jurnal: DR Uang Jaminan Proyek (akun PROJECT_GUARANTEE, 1.8) / CR Kas-Bank sumber dana. Baris jurnal sengaja tanpa partyId agar piutang pihak tidak te |
| `pi_create` | write → critical | Cabang non-bypass: tidak ada efek GL/stok sampai disetujui (ApprovalRequest Pending, notifikasi ke Admin). Cabang bypass/standalone: DR Persediaan (ak |
| `quot_delete` | critical → write | Tidak ada efek GL/stok. Draft dihapus permanen. |
| `recon_delete` | critical → write | Tidak ada efek GL/stok (hanya menghapus data sesi Draft). |
| `rec_delete` | critical → write | Tidak ada efek GL/stok (hanya menonaktifkan template; dapat diaktifkan kembali lewat rec_update). |
| `rec_execute` | write → critical | Tipe journal: membuat Jurnal Umum berstatus Submitted dan memposting ke buku besar sesuai baris template (DR/CR menurut templateData); saldo akun dipe |
| `so_generate_do` | write → critical | Stok: pergerakan Keluar per item inventori (stok turun, per gudang), unitCost = WAC saat kirim. TIDAK ada jurnal GL (HPP baru diposting saat invoice). |
| `sret_create` | write → critical | Cabang langsung (role bypass): JV-RN: DR 4.3 Retur Penjualan (+ DR PPN Keluaran) / CR 1.2.1 Piutang (porsi mengurangi outstanding) dan CR Uang Muka Pe |
| `si_create` | write → critical | GL: DR 1.2.1 Piutang Usaha (grand total) [+ DR 1.5.4 PPh dibayar dimuka bila pphPct>0] / CR akun pendapatan per baris (4.1 Penjualan, 4.2 Pendapatan J |
| `svc_delete` | critical → write | Tidak ada efek GL/stok. Item jasa dinonaktifkan; dokumen lama tidak terpengaruh. |
| `set_company_update` | write → critical | Tidak ada jurnal. Mengubah konfigurasi global: mata uang, awal tahun fiskal, NPWP, rekening bank pada faktur, logo — berdampak ke dokumen/laporan beri |
| `stf_create` | write → critical | Stok: -qty di gudang asal, +qty di gudang tujuan (SM TransferOut/TransferIn berpasangan, biaya satuan = WAC item atau biaya batch terpilih). Tidak ada |
| `vdep_apply` | write → critical | Jurnal: DR Hutang Usaha (2.1.1) / CR Uang Muka Vendor (1.3) sebesar amount. outstanding PI turun (status PartiallyPaid/Paid), depositBalance pemasok t |

## 4. Modul/izin tidak sesuai guard

- att_counts: old attachments/edit -> attachments/view
- hc_run: old health/view vs guard audit
- hc_preview: old health/view vs guard audit
- prod_dash_oee: old production/view vs guard inventory
- prod_dash_production: old production/view vs guard inventory
- prod_dash_stats: old production/view vs guard inventory
- prod_dash_yield_trend: old production/view vs guard inventory
- notif_list: old settings/view -> notifications/view
- notif_unread_count: old settings/view -> notifications/view
- search_global: old reports/view -> parties/view
- tax_report: old reports/view vs guard settings

Catatan: `notifications` dan `attachments` bukan modul RBAC (terbuka untuk semua user login; guard di file/handler). Tahap 1 harus memperlakukannya sebagai "any authenticated" (tool memakai `roles` eksplisit + `accessNote`).

## 5. Dihapus / dipindah ke denylist atau digabung (60)

| Tool lama | Handler | Alasan |
|---|---|---|
| `set_runtime_get` | `GET /api/settings/runtime` | denylist |
| `set_check_update` | `GET /api/settings/check-update` | denylist |
| `usr_list` | `GET /api/users` | denylist |
| `usr_create` | `POST /api/users` | denylist |
| `usr_update` | `PUT /api/users/:id` | denylist |
| `usr_toggle` | `PATCH /api/users/:id/toggle` | denylist |
| `role_list` | `GET /api/roles` | denylist |
| `role_assignable` | `GET /api/roles/assignable` | denylist |
| `role_catalog` | `GET /api/roles/catalog` | denylist |
| `role_create` | `POST /api/roles` | denylist |
| `role_update` | `PUT /api/roles/:id` | denylist |
| `role_delete` | `DELETE /api/roles/:id` | denylist |
| `ai_cfg_whitelist_delete` | `DELETE /api/ai/config/whitelist/:id` | denylist |
| `att_delete` | `DELETE /api/attachments/:id` | denylist |
| `usr_tg_unlink` | `DELETE /api/users/:id/telegram` | denylist |
| `ai_cfg_settings_get` | `GET /api/ai/config/settings` | denylist |
| `ai_cfg_tools_list` | `GET /api/ai/config/tools` | denylist |
| `ai_cfg_whitelist_list` | `GET /api/ai/config/whitelist` | denylist |
| `att_file_get` | `GET /api/attachments/file/:id` | denylist |
| `auth_me` | `GET /api/auth/me` | denylist |
| `bk_download` | `GET /api/backup/download/:filename` | denylist |
| `bk_list` | `GET /api/backup/list` | denylist |
| `gd_version_file` | `GET /api/ga/documents/:id/versions/:vid/file` | denylist |
| `ga_pub_qr` | `GET /api/ga/public/:qrCode` | denylist |
| `ga_pub_qr_photo` | `GET /api/ga/public/:qrCode/photos/:photoId.:ext` | denylist |
| `imp_template` | `GET /api/import/template/:type` | denylist |
| `pub_branding` | `GET /api/public/branding` | denylist |
| `tg_config_get` | `GET /api/telegram/config` | denylist |
| `ai_cfg_tool_update` | `PATCH /api/ai/config/tools/:name` | denylist |
| `ai_cfg_whitelist_add` | `POST /api/ai/config/whitelist` | denylist |
| `ai_router_invoke` | `POST /api/ai/router` | denylist |
| `att_upload` | `POST /api/attachments/upload` | denylist |
| `auth_login` | `POST /api/auth/login` | denylist |
| `auth_logout` | `POST /api/auth/logout` | denylist |
| `bk_create` | `POST /api/backup/create` | denylist |
| `bk_restore` | `POST /api/backup/restore` | denylist |
| `bk_upload` | `POST /api/backup/upload` | denylist |
| `ga_asset_add_photo` | `POST /api/ga/assets/:id/photos` | denylist |
| `gd_add_version` | `POST /api/ga/documents/:id/versions` | denylist |
| `gm_wo_add_photo` | `POST /api/ga/maintenance/work-orders/:id/photos` | denylist |
| `hc_fix` | `POST /api/health-check/fix/:check` | denylist |
| `imp_coa` | `POST /api/import/coa` | denylist |
| `imp_inventory` | `POST /api/import/inventory` | denylist |
| `imp_journals` | `POST /api/import/journals` | denylist |
| `imp_parties` | `POST /api/import/parties` | denylist |
| `notif_check` | `POST /api/notifications/check` | denylist |
| `pub_inquiry` | `POST /api/public/inquiry` | denylist |
| `rec_run_due` | `POST /api/recurring/run-due` | denylist |
| `rpt_export` | `POST /api/reports/export` | denylist |
| `set_del_dummy` | `POST /api/settings/delete-dummy` | denylist |
| `set_gen_dummy` | `POST /api/settings/generate-dummy` | denylist |
| `set_reset_data` | `POST /api/settings/reset-data` | denylist |
| `tg_test` | `POST /api/telegram/test` | denylist |
| `usr_tg_link` | `POST /api/users/:id/telegram-link` | denylist |
| `usr_tg_test` | `POST /api/users/:id/telegram-test` | denylist |
| `ai_cfg_settings_update` | `PUT /api/ai/config/settings` | denylist |
| `tg_config_update` | `PUT /api/telegram/config` | denylist |
| `usr_me_password` | `PUT /api/users/me/password` | denylist |
| `inv_dash_metrics` | (duplikat handler) | digabung ke tool lain (`inv_dash_metrics`) |
| `gd_expiring` | (duplikat handler) | digabung ke tool lain (`gd_list`) |

Alasan lengkap tiap aturan denylist: [DENYLIST.md](DENYLIST.md).

## 6. Rename

- inv_low_stock → inv_dash_metrics
- prod_run_create → prod_draft_create
- get_aging_receivable → rpt_aging

Nama lain dipertahankan agar stabil (skema penamaan: `<modul>_<aksi>`, snake_case; prefiks per modul: `so_`, `do_`, `si_`, `po_`, `pi_`, `payreq_`, `eambill_`, `gam_`/`ga_veh_`/`gm_`/`gmr_`, `rpt_`, ...). Beberapa nama lama tidak seragam (mis. `get_trial_balance`, `get_receivable_schedule`, `get_cash_position`) — dipertahankan demi stabilitas; kandidat rename pada rilis mayor.

## 7. Temuan kode (tidak diubah di Stage 0 — untuk keputusan owner)

**Router AIRA (`routes/ai/router.ts`)**
- Jalur write meneruskan handler tanpa mensubstitusi `:param` path (hanya jalur read yang melakukannya) — tool write ber-`:id` tidak akan berfungsi lewat jalur itu. MCP tahap 1 tidak boleh memakai jalur ini.
- Approval `ai_tool:*` tidak bisa disetujui (`Tipe dokumen tidak didukung` di `approvalDecision`).
- `/api/ai/chat/*` tidak punya guard di mount (guard di dalam file).

**Guard tidak konsisten**
- Tanpa `doc.cancel`: `PATCH /customer-deposits/:id/cancel`, `PATCH /vendor-deposits/:id/cancel`, `POST /sales-orders/:id/cancel`, `PATCH /journals/:id/cancel`, `POST /stock-transfers/:id/cancel` (juga tanpa cek stok gudang tujuan). Pembatalan lain memerlukannya.
- `POST /goods-receipts/:id/cancel` menerima `allowNegativeStock` tanpa cek capability `inventory.negative_stock`.
- `DELETE /ga/vehicle/assets/:id/taxes/:tid` tidak mengecek `journalEntryId`/`purchaseInvoiceId`.
- `gmr_approve` tanpa capability; pemohon dapat menyetujui MR sendiri. Persetujuan servis/pajak kendaraan hanya butuh `ga_vehicle` edit.
- `POST ga/vehicle/.../taxes` status `IN_PROCESS` langsung masuk antrian Tagihan EAM tanpa approval.

**Logika/data**
- `PUT /ga/assets/:id` dan `PUT /ga/documents/:id` menjadikan field opsional yang tidak dikirim bernilai NULL; `PUT /settings/company` me-reset field yang tidak dikirim.
- `PUT /coa/:id` mengabaikan accountType/rootType/parentId/currency; `PUT /approvals/rules/:id` dapat menimpa field dengan undefined.
- `fa_depreciate(_bulk)` tidak mengecek tahun buku tertutup; `fa_dispose` hanya mengubah status (tanpa jurnal laba/rugi pelepasan).
- `opn_cancel` tidak mengembalikan revaluasi `averageCost`; `POST /stock-opname` langsung final (status Draft tidak dipakai).
- `rpt_ledger_detail` memulai saldo berjalan dari 0 tanpa saldo awal; `rpt_hpp` memakai WAC hari ini, bukan HPP GL.
- `executeTemplate` transaksi berulang tidak memeriksa debit = kredit atau `isActive`.
- Daftar lampiran mengembalikan `filePath`/`storedName` tanpa cek izin dokumen induk.
- `GET /inquiries/:id/convert-payload` (`inq_convert_payload`) berstatus GET tetapi membuat Party baru dan mengubah inquiry (diklasifikasikan write).

## 8. Keputusan yang perlu ditinjau owner

- **Reklasifikasi risk** (§3), terutama: `so_cancel`, `po_cancel`, `po_close`, `tdn_cancel` dan semua cancel = *critical* walau tanpa efek GL (aturan "cancel/void = critical"); approve/reject/return Pengajuan Pembayaran = critical; `recon_complete` critical vs write; `set_company_update` critical.
- **Denylist** ([DENYLIST.md](DENYLIST.md)): apakah `appr_rule_*` dan `sysacct_update` (perubahan kontrol approval/akun sistem) harus ikut dilarang; `audit-logs` & health-check read dipertahankan sebagai tool (Admin).
- **Modul pseudo untuk "semua user login"**: tool Pengajuan Pembayaran milik-sendiri memakai modul `payment_request`, padahal endpoint terbuka untuk semua user login; lapis izin-2 router (`can(role, module, permAction)`) akan memblokir staf biasa. Perlu pseudo-modul/pengecualian di tahap 1.
- **ga_***: modul GA tidak ada di `DEFAULT_MATRIX`, sehingga `roles` hasil turunan = Admin saja (registry lama menaruh Accountant/StaffProduksi).
