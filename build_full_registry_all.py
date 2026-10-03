#!/usr/bin/env python3
"""Build FULL AIRA Tool Router registry — ALL endpoints as tools, default DISABLED.

Basis: 309 tools dari branch ai-tool-registry-expansion (full.json).
Tambah: 81 endpoint EXCLUDE + restore gd_expiring terpisah.
Fix: 6 handler path salah (rpt_* operational prefix, inv_low_stock dead path).
Semua tool enabled=false. Tambah modul baru ke header. Output -> server/src/ai/aira-tool-router.json (live).
"""
import json, os, re
from collections import Counter
from pathlib import Path

BASE = "/tmp/aira_work/aira-tool-router.full.json"
OUT = str(Path(__file__).resolve().parent / "server/src/ai/aira-tool-router.json")
EXCL = json.load(open("/tmp/aira_work/exclude_list.json"))

reg = json.load(open(BASE))
tools = reg["tools"]
byname = {t["name"]: t for t in tools}

ALL   = ["Admin", "Accountant", "StaffProduksi", "Viewer"]
ACC   = ["Admin", "Accountant"]
ACCV  = ["Admin", "Accountant", "Viewer"]
OPS   = ["Admin", "Accountant", "StaffProduksi"]
OPSV  = ["Admin", "Accountant", "StaffProduksi", "Viewer"]
ADMIN = ["Admin"]

# ── FIX 1: rpt_* operational prefix (real route mounts operationalRouter tanpa prefix) ──
rpt_fix = {
    "rpt_hpp": "GET /api/reports/hpp",
    "rpt_profitability_sku": "GET /api/reports/profitability-per-sku",
    "rpt_payable_schedule": "GET /api/reports/payable-schedule",
    "rpt_receivable_schedule": "GET /api/reports/receivable-schedule",
    "rpt_daily": "GET /api/reports/daily",
}
for n, h in rpt_fix.items():
    if n in byname:
        byname[n]["handler"] = h

# ── FIX 2: inv_low_stock dead path -> real metrics endpoint (low-stock count ada di dashboard/metrics) ──
if "inv_low_stock" in byname:
    byname["inv_low_stock"]["handler"] = "GET /api/inventory/dashboard/metrics"
    byname["inv_low_stock"]["desc"] = "Metrik inventaris termasuk jumlah item stok rendah (lowStockCount)."

# ── RESTORE gd_expiring terpisah (v1 name, JANGAN gabung ke gd_list) ──
if "gd_expiring" not in byname:
    tools.append({
        "name": "gd_expiring", "group": "EAM", "module": "ga_documents", "risk": "read",
        "roles": ADMIN, "handler": "GET /api/ga/documents",
        "desc": "Dokumen legal/sertifikat yang hampir kadaluarsa (reminder proaktif). Filter expiringSoon=true.",
        "input": {"expiringSoon": "boolean"}, "output": {"documents": "array"},
        "permAction": "view", "enabled": False, "level": 3, "phase": 5,
    })

# ════════════════════════════════════════════════════════════════════
# EXCLUDE 81 endpoint -> tool. Definisi eksplisit per endpoint.
# Format: handler -> (name, group, module, risk, roles, desc, perm, cap)
# ════════════════════════════════════════════════════════════════════
NEW_MODULES = ["ai", "auth", "backup", "telegram", "public", "notifications",
               "health", "import", "attachments"]

# helper untuk confirm template generik write/critical
def cf(desc): return desc

# explicit map: handler -> tool spec
EX = {}
def X(handler, name, group, module, risk, roles, desc, confirm=None, cap=None, perm=None):
    EX[handler] = dict(name=name, group=group, module=module, risk=risk, roles=roles,
                       desc=desc, confirm=confirm, cap=cap, perm=perm)

G_SYS = "Master & Sistem"
G_EAM = "EAM"
G_RPT = "Laporan/Universal"
G_AI  = "AI / Agentic"

# 4.1 AI self-config (8) — RISIKO loop, biarkan disabled
X("GET /api/ai/config/tools", "ai_cfg_tools_list", G_AI, "ai", "read", ADMIN,
  "[AI self-config — RISIKO loop, biarkan disabled] Daftar konfigurasi tool AIRA (enabled/tier efektif).")
X("PATCH /api/ai/config/tools/:name", "ai_cfg_tool_update", G_AI, "ai", "critical", ADMIN,
  "[AI self-config — RISIKO loop, biarkan disabled] Ubah enabled/tier 1 tool. AIRA TAK boleh kelola dirinya.",
  confirm="[BERBAHAYA — self-config] Ubah konfigurasi tool {name}. AIRA mengubah dirinya sendiri. Setujui?")
X("GET /api/ai/config/settings", "ai_cfg_settings_get", G_AI, "ai", "read", ADMIN,
  "[AI self-config — RISIKO loop, biarkan disabled] Ambil setting agentic (enabled, service token).")
X("PUT /api/ai/config/settings", "ai_cfg_settings_update", G_AI, "ai", "critical", ADMIN,
  "[AI self-config — RISIKO loop, biarkan disabled] Ubah setting agentic (toggle agentic, service token).",
  confirm="[BERBAHAYA — self-config] Ubah setting agentic AIRA. Setujui?")
X("GET /api/ai/config/whitelist", "ai_cfg_whitelist_list", G_AI, "ai", "read", ADMIN,
  "[AI self-config — RISIKO loop, biarkan disabled] Daftar whitelist aksi AIRA.")
X("POST /api/ai/config/whitelist", "ai_cfg_whitelist_add", G_AI, "ai", "critical", ADMIN,
  "[AI self-config — RISIKO loop, biarkan disabled] Tambah entri whitelist AIRA.",
  confirm="[BERBAHAYA — self-config] Tambah whitelist AIRA. Setujui?")
X("DELETE /api/ai/config/whitelist/:id", "ai_cfg_whitelist_delete", G_AI, "ai", "critical", ADMIN,
  "[AI self-config — RISIKO loop, biarkan disabled] Hapus entri whitelist AIRA.",
  confirm="[BERBAHAYA — self-config] HAPUS whitelist {id} AIRA. Setujui?")
X("POST /api/ai/router", "ai_router_invoke", G_AI, "ai", "critical", ADMIN,
  "[AI self-config — RISIKO loop, biarkan disabled] Endpoint Tool Router itu sendiri. JANGAN panggil dari dalam (loop tak terbatas).",
  confirm="[BERBAHAYA — loop] Invoke Tool Router dari dalam Tool Router. Setujui?")

# 4.2 File I/O / multipart (attachments + photos + versions)
X("POST /api/attachments/upload", "att_upload", G_SYS, "attachments", "write", ALL,
  "[butuh file/multipart — mungkin tak dieksekusi via Tool Router teks] Unggah lampiran ke dokumen.",
  confirm="Unggah lampiran (file biner). Setujui?")
X("POST /api/attachments/counts", "att_counts", G_SYS, "attachments", "write", ALL,
  "Ambil jumlah lampiran per referensi (batch).",
  confirm="Ambil count lampiran. Setujui?")
X("GET /api/attachments/file/:id", "att_file_get", G_SYS, "attachments", "read", ALL,
  "[file biner] Unduh file lampiran by id.")
X("GET /api/attachments/:referenceType/:referenceId", "att_list", G_SYS, "attachments", "read", ALL,
  "Daftar lampiran untuk satu referensi dokumen.")
X("GET /api/attachments/invoice/:type/:id/related", "att_invoice_related", G_SYS, "attachments", "read", ALL,
  "Lampiran terkait sebuah invoice (lintas dokumen).")
X("DELETE /api/attachments/:id", "att_delete", G_SYS, "attachments", "critical", ACC,
  "Hapus lampiran.", confirm="HAPUS lampiran {id}? Aksi permanen.")
X("POST /api/ga/assets/:id/photos", "ga_asset_add_photo", G_EAM, "ga_assets", "write", OPS,
  "[butuh file/multipart] Unggah foto aset.", confirm="Unggah foto aset {id} (file biner). Setujui?")
X("DELETE /api/ga/assets/:id/photos/:photoId", "ga_asset_delete_photo", G_EAM, "ga_assets", "critical", OPS,
  "Hapus foto aset.", confirm="HAPUS foto {photoId} aset {id}?")
X("POST /api/ga/maintenance/work-orders/:id/photos", "gm_wo_add_photo", G_EAM, "ga_maintenance", "write", OPS,
  "[butuh file/multipart] Unggah foto Work Order.", confirm="Unggah foto WO {id} (file biner). Setujui?")
X("POST /api/ga/documents/:id/versions", "gd_add_version", G_EAM, "ga_documents", "write", OPS,
  "[butuh file/multipart] Unggah versi baru dokumen legal.", confirm="Unggah versi dokumen {id} (file biner). Setujui?")
X("GET /api/ga/documents/:id/versions/:vid/file", "gd_version_file", G_EAM, "ga_documents", "read", OPS,
  "[file biner] Unduh file versi dokumen legal.")

# 4.3 Import CSV (multipart)
X("GET /api/import/template/:type", "imp_template", G_SYS, "import", "read", ACC,
  "[file biner] Unduh template CSV import.")
X("POST /api/import/coa", "imp_coa", G_SYS, "import", "critical", ADMIN,
  "[butuh file/multipart CSV] Import massal COA. Operasi setup berisiko.",
  confirm="[setup] Import COA dari CSV (massal). Setujui?")
X("POST /api/import/parties", "imp_parties", G_SYS, "import", "critical", ADMIN,
  "[butuh file/multipart CSV] Import massal pelanggan/vendor.",
  confirm="[setup] Import parties dari CSV (massal). Setujui?")
X("POST /api/import/inventory", "imp_inventory", G_SYS, "import", "critical", ADMIN,
  "[butuh file/multipart CSV] Import massal item inventori.",
  confirm="[setup] Import inventory dari CSV (massal). Setujui?")
X("POST /api/import/journals", "imp_journals", G_SYS, "import", "critical", ADMIN,
  "[butuh file/multipart CSV] Import massal jurnal. SANGAT berisiko (posting GL massal).",
  confirm="[setup BERBAHAYA] Import jurnal dari CSV (posting GL massal). Setujui?")
X("POST /api/fixed-assets/import", "fa_import", "Akuntansi", "fixed_assets", "critical", ADMIN,
  "[butuh file/multipart CSV] Import massal aset tetap.",
  confirm="[setup] Import aset tetap dari CSV (massal). Setujui?")

# 4.4 Auth & session
X("POST /api/auth/login", "auth_login", G_SYS, "auth", "critical", ALL,
  "[auth — bukan aksi bisnis] Login (set cookie sesi).", confirm="Login sesi baru. Setujui?")
X("POST /api/auth/logout", "auth_logout", G_SYS, "auth", "write", ALL,
  "[auth] Logout sesi.", confirm="Logout sesi. Setujui?")
X("GET /api/auth/me", "auth_me", G_SYS, "auth", "read", ALL,
  "[auth] Profil sesi aktif.")
X("PUT /api/users/me/password", "usr_me_password", G_SYS, "users", "critical", ALL,
  "[kredensial pribadi] Ganti password sendiri.", confirm="Ganti password akun sendiri. Setujui?")

# 4.5 Backup & infra ops
X("GET /api/backup/list", "bk_list", G_SYS, "backup", "read", ADMIN,
  "[infra] Daftar file backup.")
X("POST /api/backup/create", "bk_create", G_SYS, "backup", "critical", ADMIN,
  "[infra] Buat backup DB.", confirm="[infra] Buat backup database. Setujui?")
X("GET /api/backup/download/:filename", "bk_download", G_SYS, "backup", "read", ADMIN,
  "[file biner] Unduh file backup.")
X("POST /api/backup/upload", "bk_upload", G_SYS, "backup", "critical", ADMIN,
  "[butuh file/multipart] Unggah file backup.", confirm="[infra] Unggah file backup. Setujui?")
X("POST /api/backup/restore", "bk_restore", G_SYS, "backup", "critical", ADMIN,
  "[infra SANGAT DESTRUKTIF] Restore DB dari backup — TIMPA seluruh data.",
  confirm="[BAHAYA EKSTRIM] RESTORE database — SELURUH data saat ini akan DITIMPA. Setujui?")
X("GET /api/health-check", "hc_run", G_SYS, "health", "read", ADMIN,
  "[infra] Jalankan health-check sistem.")
X("GET /api/health-check/preview/:check", "hc_preview", G_SYS, "health", "read", ADMIN,
  "[infra] Preview detail satu health-check.")
X("POST /api/health-check/fix/:check", "hc_fix", G_SYS, "health", "critical", ADMIN,
  "[infra] Jalankan perbaikan otomatis satu health-check.",
  confirm="[infra] Jalankan auto-fix '{check}'. Setujui?")

# 4.6 Public / integrasi
X("GET /api/public/branding", "pub_branding", G_SYS, "public", "read", ALL,
  "[publik tanpa auth] Branding publik (logo/nama).")
X("POST /api/public/inquiry", "pub_inquiry", "Penjualan", "public", "write", ALL,
  "[publik tanpa auth] Kirim inquiry publik dari form.", confirm="Kirim inquiry publik. Setujui?")
X("GET /api/ga/public/:qrCode", "ga_pub_qr", G_EAM, "public", "read", ALL,
  "[publik tanpa auth] Info aset via QR code publik.")
X("GET /api/ga/public/:qrCode/photos/:photoId.:ext", "ga_pub_qr_photo", G_EAM, "public", "read", ALL,
  "[publik tanpa auth, file biner] Foto aset via QR publik.")
X("GET /api/telegram/config", "tg_config_get", G_SYS, "telegram", "read", ADMIN,
  "[integrasi — simpan secret] Ambil konfigurasi bot Telegram.")
X("PUT /api/telegram/config", "tg_config_update", G_SYS, "telegram", "critical", ADMIN,
  "[integrasi — simpan secret bot token] Ubah konfigurasi Telegram.",
  confirm="[secret] Ubah konfigurasi bot Telegram (token). Setujui?")
X("POST /api/telegram/test", "tg_test", G_SYS, "telegram", "write", ADMIN,
  "[integrasi] Tes kirim pesan Telegram.", confirm="Kirim pesan tes Telegram. Setujui?")

# 4.7 Notifikasi & telegram-link per-user
X("PATCH /api/notifications/:id/read", "notif_read", G_SYS, "notifications", "write", ALL,
  "Tandai notifikasi dibaca.", confirm="Tandai notifikasi {id} dibaca. Setujui?")
X("PATCH /api/notifications/read-all", "notif_read_all", G_SYS, "notifications", "write", ALL,
  "Tandai semua notifikasi dibaca.", confirm="Tandai SEMUA notifikasi dibaca. Setujui?")
X("POST /api/notifications/check", "notif_check", G_SYS, "notifications", "write", ALL,
  "Trigger pengecekan notifikasi baru.", confirm="Cek notifikasi baru. Setujui?")
X("POST /api/users/:id/telegram-link", "usr_tg_link", G_SYS, "users", "write", ADMIN,
  "Tautkan akun user ke Telegram.", confirm="Tautkan user {id} ke Telegram. Setujui?")
X("POST /api/users/:id/telegram-test", "usr_tg_test", G_SYS, "users", "write", ADMIN,
  "Tes kirim Telegram ke user.", confirm="Tes Telegram ke user {id}. Setujui?")
X("DELETE /api/users/:id/telegram", "usr_tg_unlink", G_SYS, "users", "write", ADMIN,
  "Putus tautan Telegram user.", confirm="Putus tautan Telegram user {id}. Setujui?")

# 4.8 Dev-only destruktif
X("POST /api/settings/generate-dummy", "set_gen_dummy", G_SYS, "settings", "critical", ADMIN,
  "[dev-only — JANGAN di produksi] Generate data dummy.",
  confirm="[DEV — BAHAYA] Generate data dummy. JANGAN di produksi. Setujui?")
X("POST /api/settings/delete-dummy", "set_del_dummy", G_SYS, "settings", "critical", ADMIN,
  "[dev-only — JANGAN di produksi] Hapus data dummy.",
  confirm="[DEV — BAHAYA] Hapus data dummy. Setujui?")
X("POST /api/settings/reset-data", "set_reset_data", G_SYS, "settings", "critical", ADMIN,
  "[dev-only — DESTRUKTIF] Reset seluruh data transaksi.",
  confirm="[BAHAYA EKSTRIM] RESET seluruh data transaksi DB. Setujui?")

# 4.9 GA-master CRUD ringan + misc
X("POST /api/ga/master/asset-categories", "gam_asset_cat_create", G_EAM, "ga_master", "write", OPS,
  "Buat kategori aset EAM.", confirm="Buat kategori aset '{name}'. Setujui?")
X("PUT /api/ga/master/asset-categories/:id", "gam_asset_cat_update", G_EAM, "ga_master", "write", OPS,
  "Ubah kategori aset EAM.", confirm="Ubah kategori aset {id}. Setujui?")
X("DELETE /api/ga/master/asset-categories/:id", "gam_asset_cat_delete", G_EAM, "ga_master", "critical", OPS,
  "Hapus kategori aset EAM.", confirm="HAPUS kategori aset {id}?")
X("POST /api/ga/master/document-types", "gam_doctype_create", G_EAM, "ga_master", "write", OPS,
  "Buat tipe dokumen legal.", confirm="Buat tipe dokumen '{name}'. Setujui?")
X("PUT /api/ga/master/document-types/:id", "gam_doctype_update", G_EAM, "ga_master", "write", OPS,
  "Ubah tipe dokumen legal.", confirm="Ubah tipe dokumen {id}. Setujui?")
X("DELETE /api/ga/master/document-types/:id", "gam_doctype_delete", G_EAM, "ga_master", "critical", OPS,
  "Hapus tipe dokumen legal.", confirm="HAPUS tipe dokumen {id}?")
X("POST /api/ga/master/inventory-categories", "gam_invcat_create", G_EAM, "ga_master", "write", OPS,
  "Buat kategori inventaris GA.", confirm="Buat kategori inventaris GA '{name}'. Setujui?")
X("PUT /api/ga/master/inventory-categories/:id", "gam_invcat_update", G_EAM, "ga_master", "write", OPS,
  "Ubah kategori inventaris GA.", confirm="Ubah kategori inventaris GA {id}. Setujui?")
X("DELETE /api/ga/master/inventory-categories/:id", "gam_invcat_delete", G_EAM, "ga_master", "critical", OPS,
  "Hapus kategori inventaris GA.", confirm="HAPUS kategori inventaris GA {id}?")
X("POST /api/ga/master/locations", "gam_location_create", G_EAM, "ga_master", "write", OPS,
  "Buat lokasi EAM.", confirm="Buat lokasi '{name}'. Setujui?")
X("PUT /api/ga/master/locations/:id", "gam_location_update", G_EAM, "ga_master", "write", OPS,
  "Ubah lokasi EAM.", confirm="Ubah lokasi {id}. Setujui?")
X("DELETE /api/ga/master/locations/:id", "gam_location_delete", G_EAM, "ga_master", "critical", OPS,
  "Hapus lokasi EAM.", confirm="HAPUS lokasi {id}?")
X("PUT /api/ga/master/branches/:id", "gam_branch_update", G_EAM, "ga_master", "write", OPS,
  "Ubah cabang.", confirm="Ubah cabang {id}. Setujui?")
X("DELETE /api/ga/master/branches/:id", "gam_branch_delete", G_EAM, "ga_master", "critical", OPS,
  "Hapus cabang.", confirm="HAPUS cabang {id}?")
X("PUT /api/ga/master/cost-centers/:id", "gam_cc_update", G_EAM, "ga_master", "write", OPS,
  "Ubah cost center.", confirm="Ubah cost center {id}. Setujui?")
X("DELETE /api/ga/master/cost-centers/:id", "gam_cc_delete", G_EAM, "ga_master", "critical", OPS,
  "Hapus cost center.", confirm="HAPUS cost center {id}?")
X("PATCH /api/ga/vehicle/assets/:id/services/:sid", "ga_veh_update_service", G_EAM, "ga_vehicle", "write", OPS,
  "Ubah catatan servis kendaraan.", confirm="Ubah servis {sid} kendaraan {id}. Setujui?")
X("DELETE /api/ga/vehicle/assets/:id/services/:sid", "ga_veh_delete_service", G_EAM, "ga_vehicle", "critical", OPS,
  "Hapus catatan servis kendaraan.", confirm="HAPUS servis {sid} kendaraan {id}?")
X("PATCH /api/ga/vehicle/service-requests/:id/cancel", "ga_veh_cancel_service_req", G_EAM, "ga_vehicle", "critical", OPS,
  "Batalkan permintaan servis kendaraan.", confirm="BATALKAN permintaan servis {id}?")
X("DELETE /api/ga/building/assets/:id/rentals/:rid", "ga_bld_delete_rental", G_EAM, "ga_building", "critical", OPS,
  "Hapus catatan sewa gedung.", confirm="HAPUS sewa {rid} gedung {id}?")
X("DELETE /api/ga/equipment/assets/:id/calibration-logs/:lid", "ga_eqp_delete_calibration", G_EAM, "ga_equipment", "critical", OPS,
  "Hapus log kalibrasi equipment.", confirm="HAPUS log kalibrasi {lid} equipment {id}?")
X("POST /api/recurring/run-due", "rec_run_due", "Bank & Kas", "recurring", "critical", ACC,
  "[scheduler internal] Jalankan transaksi berulang yang jatuh tempo.",
  confirm="[scheduler] Jalankan SEMUA transaksi berulang jatuh tempo. Setujui?")
X("POST /api/reports/export", "rpt_export", G_RPT, "reports", "write", ACCV,
  "[generate file] Export laporan ke file (Excel/PDF).", confirm="Export laporan ke file. Setujui?")

# ── EMIT EXCLUDE tools ──
missing = [h for h in EXCL if h not in EX]
if missing:
    raise SystemExit("BELUM dipetakan: " + "\n".join(missing))

for h in EXCL:
    s = EX[h]
    risk = s["risk"]
    perm = s["perm"] or ("view" if risk == "read" else "edit")
    t = {
        "name": s["name"], "group": s["group"], "module": s["module"], "desc": s["desc"],
        "risk": risk, "roles": s["roles"], "input": {}, "output": {},
        "handler": h, "permAction": perm, "enabled": False, "level": 1, "phase": 6,
    }
    if s["cap"]: t["requiresCapability"] = s["cap"]
    if s["confirm"]: t["confirm_template"] = s["confirm"]
    tools.append(t)

# ── ALL tools enabled=false ──
for t in tools:
    t["enabled"] = False

# ── add new modules ──
for m in NEW_MODULES:
    if m not in reg["modules"]:
        reg["modules"].append(m)

# ── dedupe name check ──
names = [t["name"] for t in tools]
dups = [n for n,c in Counter(names).items() if c > 1]
if dups:
    raise SystemExit("DUPLICATE names: " + ", ".join(dups))

reg["tools"] = tools
reg["generatedNote"] = "FULL registry — SEMUA endpoint (~385) sebagai tool, default DISABLED. gd_expiring dipertahankan terpisah. Generated by build_full_registry_all.py."

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(reg, f, indent=2, ensure_ascii=False)
    f.write("\n")

byrisk = Counter(t["risk"] for t in tools)
enabled_count = sum(1 for t in tools if t["enabled"])
print(f"Wrote {len(tools)} tools -> {OUT}")
print("By risk:", dict(byrisk))
print("Modules:", len(reg["modules"]))
print("Enabled (should be 0):", enabled_count)
print("gd_expiring present:", "gd_expiring" in names, "| gd_list present:", "gd_list" in names)
