# AIRA Tool Coverage Analysis — Entaris (AKS)

> **Status:** ✅ **APPLIED** ke runtime (live registry + container AKS rebuild + healthy).
> Versi FULL — **SEMUA endpoint** dipetakan jadi tool, **default DISABLED**.
> Tanggal apply: 2026-06-25 · Repo: `~/ArahKarya/simple-erp` (RPi5, source of truth).

---

## 1. Ringkasan Eksekutif (versi FULL)

| Metrik | Nilai |
|---|---|
| Route file diaudit | **73** file (`server/src/routes/**/*.ts`) |
| Endpoint NYATA (router.METHOD) | **384** endpoint (recursive, incl. sub-router) |
| Endpoint dipetakan jadi tool | **386** (semua endpoint + `gd_expiring` terpisah) |
| Endpoint di-EXCLUDE | **0** (KEPUTUSAN BARU: masukkan semua tanpa kecuali) |
| **Tool registry LAMA (v1)** | **16** |
| **Tool registry BARU (FULL)** | **386** (**24×** lebih banyak) |
| Breakdown risk | read **168** · write **131** · critical **87** |
| Modul tercakup | **45** modul (36 bisnis + 9 sistem baru) |
| Tool default `enabled:true` | **0** (semua disabled, Ndoro enable sendiri via Settings) |
| Validator | **0 error** (386/386 lolos) |

**Perubahan dari versi 309 (branch `ai-tool-registry-expansion`):**
- **+76 endpoint EXCLUDE dimasukkan** semua jadi tool (AI self-config, file/multipart, import CSV, auth, backup/restore, dev-only, GA-master CRUD, notifikasi, telegram, public, health-check).
- **+1 `gd_expiring`** dipertahankan sebagai tool terpisah (TIDAK digabung ke `gd_list`).
- **Semua tool `enabled:false`** (versi 309 menyisakan 6 read v1 sebagai `true`; kini 0).
- **9 modul baru** ditambah ke header: `ai`, `auth`, `backup`, `telegram`, `public`, `notifications`, `health`, `import`, `attachments`.
- **Fix path:** `rpt_hpp/daily/profitability_sku/payable_schedule/receivable_schedule` (real route mount operationalRouter tanpa prefix → handler dikoreksi ke `/api/reports/*`); `inv_low_stock` (path mati → diarahkan ke `GET /api/inventory/dashboard/metrics` yang membawa `lowStockCount`).

**File output:**
- Live registry: `server/src/ai/aira-tool-router.json` (386 tool — TIMPA v1 16-tool).
- Builder reproducible: `build_full_registry_all.py` (basis branch full.json + EXCLUDE explicit).
- Validator: `scripts/validate-aira-config.mjs` (replikasi `validateTool()` di `registry.ts`).

---

## 2. Endpoint EXCLUDE yang kini DIMASUKKAN (76)

Semua endpoint yang sebelumnya di-EXCLUDE kini menjadi tool, dengan `description` menandai risikonya dan `enabled:false`:

| Kelompok | Jml | Catatan tool |
|---|---|---|
| AI self-config (`/api/ai/*`) | 8 | desc `[AI self-config — RISIKO loop, biarkan disabled]`; semua Admin-only; mayoritas `critical` |
| File I/O / multipart (attachments, photos, versions) | 11 | desc `[butuh file/multipart — mungkin tak dieksekusi via Tool Router teks]` |
| Import CSV (coa/parties/inventory/journals/template + FA import) | 6 | desc `[butuh file/multipart CSV]`; `critical`, Admin-only |
| Auth & session | 4 | `auth_login/logout/me`, `usr_me_password` |
| Backup & infra ops (+ health-check) | 8 | `bk_restore` = `[BAHAYA EKSTRIM]`; semua Admin-only |
| Public / integrasi (branding/inquiry/QR/telegram) | 7 | endpoint publik & config secret Telegram |
| Notifikasi & telegram-link per-user | 6 | write ringan |
| Dev-only destruktif (generate/delete-dummy, reset-data) | 3 | desc `[dev-only — JANGAN di produksi]`, `critical` |
| GA-master CRUD ringan + misc (run-due, reports/export) | 23 | master taksonomi EAM + scheduler internal + export file |
| **TOTAL EXCLUDE → tool** | **76** | + `gd_expiring` = **386 total** |

> Endpoint multipart/upload/import tetap didaftarkan agar coverage 100%, namun ditandai di description bahwa eksekusi via Tool Router teks mungkin tidak relevan. AI-self-config didaftarkan tapi DIRANCANG untuk tetap disabled (risiko loop).

---

## 3. Default DISABLED — bagaimana dijamin

Logika runtime (`server/src/ai/registry.ts` → `effectiveTools()`):
```ts
const enabled = ov?.enabled ?? t.enabled; // ov = row AiToolConfig (jika ada), else default registry
```
- Tool **tanpa** row `ai_tool_configs` → status = field `enabled` di registry JSON = **`false`**.
- Tidak ada row `ai_tool_configs` yang di-insert untuk auto-enable apa pun.
- **Tidak perlu** migration DB / perubahan `types.ts` — schema sudah mendukung.
- Gate global: `ai_settings.agentic_enabled` (default `false` di AKS) → saat false, SEMUA invoke ditolak 403.

---

## 4. Verifikasi (dijalankan, NYATA)

```
$ node scripts/validate-aira-config.mjs server/src/ai/aira-tool-router.json
Tools    : 386 total
Loaded   : 386 valid, 0 skipped
By risk  : read=168 write=131 critical=87
✅ VALID — 0 error.
```

- **Container:** `dist/ai/aira-tool-router.json` mode `644`, 386 tools, 0 enabled, 45 modules. App `healthy`.
- **GET `/api/ai/config/tools`** (admin) → 386 tools, **0 enabled**.
- **UI Settings → Agentic System** → "Daftar Tool **(0/386 aktif)**", semua toggle OFF, grup per modul + filter "Semua grup" termasuk grup baru "AI / Agentic".
- **Test enable+invoke:** `rpt_dashboard` di-enable + `agentic_enabled=true` (sementara) → invoke `/api/ai/router` → **data ERP asli** (`cashBalance`, `accountsReceivable`, `accountsPayable`, `inventoryValue`, `netProfit`). Lalu **dikembalikan disabled** + `agentic_enabled=false` (state akhir bersih: 0 tool enabled).
