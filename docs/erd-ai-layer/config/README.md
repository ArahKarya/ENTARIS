# AIRA Tool Router Configuration — Entaris (AKS)

File konfigurasi **Tool Router per-aplikasi** sesuai **BRD AIRA §8.9** (Pilar 3: tiap app WAJIB punya
Tool Router config sendiri). Agent Core (AIRA) membaca config ini → langsung tahu kemampuan app —
tanpa mengubah kode otak agent. **Menambah kemampuan = menambah 1 entri tool** (deklaratif).

## Isi folder

| File | Fungsi |
|---|---|
| ~~`aira-tool-router.json`~~ | **Dihapus dari folder ini.** Sumber tunggal: `server/src/ai/aira-tool-router.json`. Dokumentasi per tool dibangkitkan ke `docs/ai-tools/` (`cd server && npm run ai-tools:docs`). |
| `aira-tool-router.schema.json` | JSON Schema — guard struktur (selaras BRD §8.9). |
| `validate-aira-config.mjs` | Validator: cek config vs schema + aturan AIRA. Jalankan tiap edit. |
| `_archive-pre-aira/` | Format lama (pre-BRD AIRA) — arsip, jangan dipakai. |

## Struktur tiap entri tool (BRD AIRA §8.9)

| Field | Wajib | Keterangan |
|---|---|---|
| `name` | ✅ | Identitas tool snake_case (dipanggil agent) |
| `desc` | ✅ | Deskripsi natural — agent pakai untuk memutuskan kapan memanggil tool |
| `risk` | ✅ | `read` (auto) / `write` (perlu approval) / `critical` (approval + alasan) |
| `roles` | ✅ | Daftar role berhak (Admin/Accountant/StaffProduksi/Viewer). Agent tolak jika role user tak termasuk |
| `module` | ✅ | Modul RBAC ERP (backend cek `can(role, module, permAction)`) |
| `handler` | ✅ | Endpoint API existing: `METHOD /path` (no query DB langsung) |
| `input` | – | Skema argumen `{ arg: tipe }` |
| `output` | – | Bentuk hasil `{ field: tipe }` |
| `confirm_template` | – | **Wajib untuk write/critical** — teks ringkasan approval, placeholder `{arg}` |
| `service` | – | Service ERP eksekutor (referensi) |
| `permAction` | – | `view`/`edit` (dicek backend) |
| `requiresCapability` | – | Capability sensitif (mis. `doc.cancel`) |
| `enabled` | – | On/off (rollout). Default true |
| `level` | – | Tingkat AIRA: 1=Copilot, 2=Workflow Agent, 3=Autonomous (BRD §6) |
| `phase` | – | Fase rollout 0-6 |

## Cara menambah tool/fitur baru

1. Tambahkan objek ke array `tools` di `server/src/ai/aira-tool-router.json` (lalu `npm run ai-tools:docs`):
   ```json
   {
     "name": "submit_leave",
     "desc": "Ajukan permohonan cuti",
     "risk": "write",
     "roles": ["Accountant", "StaffProduksi"],
     "module": "settings",
     "input": { "startDate": "date", "endDate": "date", "reason": "string" },
     "output": { "requestId": "string", "status": "string" },
     "handler": "POST /api/leave/requests",
     "confirm_template": "Ajukan cuti {startDate}-{endDate}? Alasan: {reason}",
     "enabled": false, "level": 2, "phase": 3
   }
   ```
2. Validasi: `node validate-aira-config.mjs` (membaca registry server) dan `cd server && npm run ai-tools:check`
3. Perbaiki sampai `✅ Config valid`.

## Aturan guard (otomatis)

- `name` unik & snake_case · `module`/`roles`/`requiresCapability` harus terdaftar.
- `risk=read` → `handler` WAJIB GET, tak perlu `confirm_template`.
- `risk=write`/`critical` → WAJIB `confirm_template` (human-in-the-loop, BRD §8.9).
- `handler` format `METHOD /path` · `level` 1-3.

## Posisi dalam arsitektur AIRA

```
Agent Core (AIRA — otak reusable, 1 untuk semua app)
      │ baca config app ini saat load
      ▼
server/src/ai/aira-tool-router.json (config app simple-erp — sumber tunggal)
      │ handler = endpoint resmi
      ▼
Tool Layer (API ERP existing + validasi bisnis + cek izin)
```

> Tiap app (ERP AKS, HRIS, ERP klien lain) punya file config sendiri. Agent Core identik —
> yang beda hanya config-nya. Inilah Pilar 1 + Pilar 3 BRD AIRA.

## Ajv (opsional, validasi schema penuh)

```bash
npm i -D ajv && node validate-aira-config.mjs
```
