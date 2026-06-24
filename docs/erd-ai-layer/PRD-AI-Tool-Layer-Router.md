# PRD: AIRA Tool Router & Tool Layer — Simple ERP (sisi aplikasi)

**Fitur:** Tool Router Configuration + Tool Layer + UI Konfigurasi (Settings → Agentic System)
**Bagian dari:** BRD AIRA (AI Reasoning Agent) — ini **sisi aplikasi** (Pilar 3), bukan Agent Core
**Target awal:** AKS (`/home/yay/ArahKarya/simple-erp`)
**Disiapkan oleh:** Arah Karya Sinergi (AKS)
**Tanggal:** 24 Juni 2026 · **Versi:** 1.2 (open questions resolved)

---

## 0. Posisi dalam Arsitektur AIRA

BRD AIRA mendefinisikan **Agent Core** (otak reusable: Orchestrator, Planner, Memory, Guardrail, Tool
Router, LLM Gateway, Audit) yang dipakai ulang lintas-aplikasi. PRD ini **TIDAK** membangun Agent Core —
ia membangun **sisi aplikasi** yang wajib ada agar Agent Core bisa melayani ERP ini (BRD AIRA **Pilar 3**):

1. **Tool Router Configuration** per-aplikasi (`aira-tool-router.json`) — deklarasi tool app ini.
2. **Tool Layer** — endpoint API resmi yang dipanggil (sudah ada di ERP, dibungkus aman).
3. **UI Konfigurasi** — kelola tool dari Settings (on/off, lihat risk/role/handler).

> Saat Agent Core (AIRA) selesai dibangun, ia tinggal membaca `aira-tool-router.json` ERP ini → langsung
> bisa bekerja. Istilah & skema PRD ini mengikuti BRD AIRA §8.9 (risk read/write/critical, roles, handler,
> confirm_template) agar plug-and-play.

## 1. Ringkasan

Fitur ini menanam **fondasi AI agentic langsung di dalam aplikasi ERP**: sebuah *tool registry* (daftar
kemampuan yang boleh dipakai AI), sebuah *Tool Router* (satu pintu eksekusi yang menerima permintaan tool,
mengecek izin, lalu menjalankan/menahan untuk persetujuan), dan *UI konfigurasi* di menu Settings untuk
mengelola semuanya tanpa menyentuh kode.

Prinsip kunci: **"tinggal tambah list."** Menambah kemampuan AI baru = menambah satu entri di registry —
bukan menulis ulang logika. UI Settings memungkinkan owner menyalakan/mematikan tiap tool dan mengatur
tingkat izinnya (otomatis / konfirmasi / wajib approval) secara visual.

Fitur ini **belum** menyambungkan model AI (Hermes/Opus) maupun kanal WA/Telegram — itu tahap berikutnya.
Fokus PRD ini: **kerangka tool layer + router + UI config yang teruji**, siap disambung ke engine nanti.

## 2. Latar Belakang & Tujuan

ERP sudah memiliki fondasi agentic ~80% (RBAC dinamis, ApprovalRequest approve-before-effect, service
terbungkus, audit trail). Yang belum ada: lapisan yang mengubah endpoint ERP menjadi "tool" yang dapat
dipanggil AI secara aman dan terkontrol, plus UI untuk mengaturnya.

| Tujuan | Ukuran sukses |
|---|---|
| Registry tool deklaratif | 67 tool ter-load & tervalidasi saat start |
| Tool Router satu pintu | 1 endpoint memproses semua panggilan tool dgn cek izin 2-lapis |
| UI konfigurasi | Owner bisa on/off tool & ubah tier dari Settings tanpa deploy |
| Keamanan | Tool read jalan; tool action ditahan untuk approval (stub) |
| Rollout terkendali | Hanya tool `enabled` + fase aktif yang dimuat |

## 3. Lingkup

### Termasuk (fase ini)
- Tool registry runtime (load + validasi dari JSON) di server.
- Model data `AiToolConfig` (override per-tool) + `AiSetting` (global, API-based) + `AiWhitelist` (terstruktur).
- Route config: lihat tool, ubah enabled/tier, baca/tulis setting global (provider/baseUrl/apiKeyEnv/model/channels), CRUD whitelist.
- **Tool Router**: endpoint `POST /api/ai/router` — resolve tool → cek izin → eksekusi (read) / buat `ApprovalRequest` nyata (write/critical).
- UI **Settings → Agentic System**: pengaturan global API-based, whitelist terstruktur, tabel tool (toggle/tier/badge), tombol **Test Tool**.

### Tidak termasuk (tahap lain)
- Sambungan model AI (Hermes/Opus) & tool-calling nyata.
- Kanal WhatsApp/Telegram.
- Eksekusi penuh aksi finansial (fase ini: stub approval — buat ApprovalRequest, tak auto-eksekusi).
- Entitas percakapan penuh (AiConversation/Message) — menyusul saat engine tersambung.

## 4. Persona & User Story

| Persona | Story |
|---|---|
| **Owner (Ndoro)** | "Saya ingin melihat semua kemampuan AI dalam satu daftar, dan menyalakan hanya yang saya percaya, plus mengatur mana yang wajib minta izin saya." |
| **Developer AKS** | "Saya ingin menambah kemampuan AI baru cukup dengan menambah satu baris di registry, dengan validasi otomatis agar tidak salah." |
| **AI Engine (nanti)** | "Saya memanggil satu endpoint router dengan nama tool + argumen; router yang urus izin & eksekusi." |

## 5. Functional Requirements

| ID | Requirement |
|---|---|
| FR1 | Sistem memuat tool registry dari file JSON saat start, memvalidasi strukturnya; gagal validasi = log error + tool itu di-skip. |
| FR2 | Registry default dapat di-*override* per-tool via DB (`AiToolConfig`): `enabled` & `tier`. UI mengubah override, bukan file. |
| FR3 | `GET /api/ai/config/tools` mengembalikan gabungan registry + override (status efektif tiap tool). |
| FR4 | `PATCH /api/ai/config/tools/:name` mengubah `enabled`/`tier` satu tool (gate `settings` + cap `rbac.manage`). |
| FR5 | `GET/PUT /api/ai/config/settings` membaca/menyimpan setting global AI: **provider** (`9router`/`claude`/`ollama`/`openai`), **baseUrl**, **apiKeyEnv** (nama env var — bukan key asli), **model**, **channels**. Semua model AI dipanggil **via API** (OpenAI-compatible). `GET/POST/DELETE /api/ai/config/whitelist` mengelola tabel **`AiWhitelist` terstruktur** (channel ↔ user). |
| FR6 | **Tool Router** `POST /api/ai/router` menerima `{ tool, args }`: (a) cari tool di config; (b) tolak bila tak ada / `enabled=false`; (c) cek izin: role user ∈ `roles` tool + `can(role,module,permAction)` + `requiresCapability` (warisi izin app, BRD AIRA prinsip); (d) bila `risk=read` → panggil handler & kembalikan data; (e) bila `risk=write`/`critical` → tampilkan `confirm_template` + **benar-benar buat `ApprovalRequest` di DB** (bukan dummy), kembalikan status `pending_approval` + `approvalId`. Engine AI belum tersambung — pipa router→approval terbukti jalan via Test Tool, nanti engine cukup colok ke router yang sama. |
| FR7 | Semua keputusan router dicatat (log + nanti `AiToolCall`). |
| FR8 | UI Settings menampilkan tabel tool dikelompokkan per grup, dengan: nama, modul, kind, badge tier, endpoint, toggle enabled, dropdown tier. |
| FR9 | UI memungkinkan filter per grup & pencarian nama tool. |
| FR10 | UI menampilkan pengaturan global AI (provider, baseUrl, apiKeyEnv, model, kanal aktif, daftar whitelist terstruktur) — editable. |
| FR11 | Perubahan dari UI langsung tersimpan (optimistic + toast), tanpa perlu deploy. |
| FR12 | Tab "Agentic System" hanya tampil untuk user dengan cap `rbac.manage` (atau super-admin). |
| FR13 | UI menyediakan tombol **Test Tool** per tool read: panggil router langsung dari UI, tampilkan hasil/error — bukti pipa router berfungsi sebelum engine tersambung. |

## 6. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR1 | Tidak ada perubahan pada tabel ERP existing — hanya tabel `Ai*` baru (nol risiko regresi). |
| NFR2 | Router cek izin 2-lapis; tak pernah percaya klaim pemanggil soal izin. |
| NFR3 | Registry validasi mengikuti aturan: read→auto+GET, action≠auto, module/cap terdaftar. |
| NFR4 | UI mengikuti pola desain Settings existing (tab, Tailwind, Lucide, Sonner toast). |
| NFR5 | Bahasa UI: Indonesia. Kode: English. |
| NFR6 | Build server & client bersih (nol TS error); unit test registry + router lulus. |

## 7. Data Model (Prisma — entitas baru)

### AiToolConfig — override per-tool
| Field | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| toolName | string (unique) | Nama tool (ref registry) |
| enabled | boolean? | Override on/off (null = ikut registry) |
| tier | string? | Override tier (null = ikut registry) |
| updatedBy | uuid? | User yang mengubah |
| updatedAt | datetime | |

### AiSetting — konfigurasi global AI (semua via API)
| Field | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| provider | string | `9router` / `claude` / `ollama` / `openai` |
| baseUrl | string | endpoint API (OpenAI-compatible), mis. `http://localhost:20128/v1` |
| apiKeyEnv | string | **nama env var** tempat key asli (mis. `AIRA_API_KEY`) — key TAK PERNAH masuk DB |
| model | string | mis. `claude-opus-4`, `qwen2.5:32b` |
| channels | json | kanal aktif, mis. `["telegram","whatsapp"]` |
| updatedAt | datetime | |

> **Keputusan (Opsi B):** API key disimpan **sebagai referensi env var**, bukan terenkripsi di DB. Router baca `process.env[apiKeyEnv]` saat memanggil API. Ganti provider = ubah `provider/baseUrl/apiKeyEnv/model` dari UI; ganti key = edit `.env` ERP + restart. Provider-agnostic: 9router, Claude native, Ollama, OpenAI semua lewat pola HTTP API yang sama.

### AiWhitelist — daftar akses terstruktur
| Field | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| channel | string | `telegram` / `whatsapp` |
| externalId | string | ID user di kanal (mis. nomor WA / chat_id TG) |
| label | string? | nama/keterangan |
| role | string? | role efektif untuk pemanggilan via kanal ini (default `Viewer`) |
| enabled | boolean | aktif/nonaktif |
| createdAt | datetime | |

> Tabel terstruktur sejak awal (bukan key-value) — query/index per channel, audit jelas, siap dipakai engine.

> Catatan: registry JSON = *default & struktur*; DB = *override editable dari UI*. Status efektif =
> merge(registry, override). Ini memisahkan "definisi" (versioned di git) dari "konfigurasi runtime" (DB).

## 8. API Contract

```
GET /api/ai/config/tools
→ 200 [{ name, group, module, kind, tier, method, path, summary,
         enabled, phase, requiresCapability, source: "registry"|"override" }]

PATCH /api/ai/config/tools/:name        (gate: settings edit + cap rbac.manage)
body { enabled?: boolean, tier?: "auto"|"draft"|"must_approve" }
→ 200 { name, enabled, tier, source: "override" }

GET /api/ai/config/settings
→ 200 { provider: "9router", baseUrl: "http://localhost:20128/v1",
        apiKeyEnv: "AIRA_API_KEY", model: "claude-opus-4",
        channels: ["telegram","whatsapp"] }     // apiKeyEnv = NAMA env var, bukan key

PUT /api/ai/config/settings
body { provider?, baseUrl?, apiKeyEnv?, model?, channels? }
→ 200 { ...updated }

GET    /api/ai/config/whitelist          → 200 [{ id, channel, externalId, label, role, enabled }]
POST   /api/ai/config/whitelist          body { channel, externalId, label?, role? } → 201 {...}
DELETE /api/ai/config/whitelist/:id      → 204

POST /api/ai/router                      (inti — dipanggil engine nanti)
body { tool: "pay_list", args: { ... } }
→ 200 (read)   { ok: true, kind: "read", data: <hasil endpoint> }
→ 200 (action) { ok: true, kind: "action", status: "pending_approval", approvalId }
→ 403          { ok: false, error: "permission_denied", detail }
→ 404          { ok: false, error: "tool_not_found" | "tool_disabled" }
```

## 9. UI — Settings → Agentic System

Tab baru "Agentic System" (ikon Bot/Cpu) di `Settings.tsx`. Isi:

**Bagian 1 — Pengaturan Global AI (card atas) — semua via API:**
- **Provider** (dropdown): `9router` / `claude` / `ollama` / `openai`
- **Base URL** (teks): endpoint API OpenAI-compatible, mis. `http://localhost:20128/v1`
- **API Key Env** (teks): nama env var (mis. `AIRA_API_KEY`) — key asli di `.env` ERP, **tak pernah di DB/UI**
- **Model** (teks bebas, ikut provider): `claude-opus-4`, `qwen2.5:32b`, dst.
- **Kanal aktif** (checkbox): Telegram (approval), WhatsApp (info)

**Bagian 2 — Whitelist (tabel terstruktur):**
- Kolom: Channel · External ID · Label · Role · Aktif · Hapus. Tombol "+ Tambah".
- CRUD ke `AiWhitelist` (POST/DELETE), bukan blob key-value.

**Bagian 3 — Daftar Tool (tabel utama):**
- Filter grup (chips: Penjualan/Pembelian/Bank & Kas/…/Universal) + search box.
- Kolom: **Nama** · **Modul** · **Risk** (read/write/critical badge) · **Tier** (dropdown: auto🟢/draft🟡/approve🔴) · **Handler** (`METHOD /path`, mono) · **Aktif** (toggle) · **Test** (tombol).
- Baris dikelompokkan per grup dengan header.
- Ringkasan atas: total tool, jumlah enabled, breakdown per risk.

**Bagian 4 — Test Tool:**
- Tombol **Test** per tool read → panggil `POST /api/ai/router` langsung dari UI, tampilkan hasil JSON / error di panel.
- Bukti pipa router berfungsi (read jalan, write→ApprovalRequest) sebelum engine AI tersambung.

**Interaksi:**
- Toggle enabled → PATCH langsung + toast "Tool X diaktifkan/dinonaktifkan".
- Ubah tier → PATCH + toast. Tier `read` dikunci ke auto (tak bisa diubah, sesuai aturan).
- Visual mengikuti Settings existing (border-blue tab aktif, tabel rapi, badge warna tier).

## 10. Acceptance Criteria

| # | Kriteria |
|---|---|
| AC1 | Registry 67 tool ter-load; entri rusak ditolak validator dengan pesan jelas. |
| AC2 | `GET /api/ai/config/tools` mengembalikan status efektif (registry+override). |
| AC3 | Toggle enabled di UI → tersimpan di DB → terlihat saat reload. |
| AC4 | Ubah tier di UI → tersimpan; tool read tetap terkunci auto. |
| AC5 | `POST /api/ai/router` dengan tool read nyata (mis. `rpt_dashboard`) → mengembalikan data ERP asli. |
| AC6 | `POST /api/ai/router` dengan tool action → mengembalikan `pending_approval` + ApprovalRequest terbuat. |
| AC7 | Tool disabled / tak dikenal → 404; izin kurang → 403. |
| AC8 | Tab hanya muncul untuk cap `rbac.manage`. |
| AC9 | Build server & client bersih; unit test registry + router lulus. |
| AC10 | Nol perubahan tabel ERP existing (hanya `Ai*` baru). |

## 11. Rencana Implementasi (bertahap, verifikasi tiap langkah)

1. Registry runtime (`server/src/ai/registry.ts`) + pindah JSON + unit test load.
2. Prisma `AiToolConfig` + `AiSetting` (API-based) + `AiWhitelist` (terstruktur) + migrasi manual (DB no-expose).
3. Route `routes/ai/config.ts` (tools + settings + whitelist CRUD) + mount + gate.
4. **Tool Router** `routes/ai/router.ts` + cek izin 2-lapis + buat `ApprovalRequest` nyata (write/critical).
5. UI `settings/AgenticSystemTab.tsx` + daftarkan tab + tombol Test Tool.
6. Build + test server & client.
7. Test nyata: invoke read dari UI → data ERP asli; invoke write → `ApprovalRequest` tertulis di DB (verifikasi via psql).
8. Commit (push setelah Ndoro ACC).

## 12. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Router salah eksekusi aksi finansial | Fase ini action = stub approval (tak auto-eksekusi); cek izin 2-lapis |
| Override DB konflik dgn registry | Status efektif = merge eksplisit; registry tetap sumber struktur |
| Build berat di RPi5 (RAM) | Build server & client terpisah, satu per satu |
| Regresi ke ERP | Nol perubahan tabel existing; tab gated; route terpisah `/api/ai` |

## 13. Open Questions — RESOLVED ✅ (24 Jun 2026)

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Setting global key-value vs `AiWhitelist` terstruktur | **Tabel `AiWhitelist` terstruktur sejak sekarang.** |
| 2 | Action router: `ApprovalRequest` nyata vs dummy | **Benar-benar buat `ApprovalRequest` di DB.** Test via tool layer dulu; nanti tinggal sambung engine AI ke router yang sama. |
| 3 | Tombol "Test Tool" di UI fase ini | **Ada sekarang** — invoke read dari UI sebagai bukti pipa router jalan. |
| 4 | Nama tab | **"Agentic System"**. |
| 5 | Konfigurasi model AI | **Selalu via API, provider-agnostic** (9router/claude/ollama/openai). API key = **referensi env var** (Opsi B) — key di `.env` ERP, DB simpan nama var saja. |

---

*Disiapkan oleh Arah Karya Sinergi (AKS) — PRD AI Tool Layer & Tool Router, Juni 2026.*
