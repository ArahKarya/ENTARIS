# Arsitektur Target: Entaris sebagai MCP Server untuk Hermes (Decision Record)

Status: **Diputuskan owner** (Stage 0 = katalog tool lengkap; kode MCP belum ada).
Dokumen ini menjadi acuan agar tahap berikutnya selaras. Katalog tool: [README.md](README.md) · [INDEX.md](INDEX.md).

## Konteks & fakta terverifikasi

- Hermes Agent **v0.21.5** punya MCP client (`hermes mcp add --url ... --auth header|oauth`) dan platform gateway `api_server` (kompatibel OpenAI).
- Profil Hermes yang sudah ada: `aira-dpa`, `aira-pmd` (Raspberry Pi 5, jaringan Tailscale). Profil KSO menyusul.
- Plugin `erp_pmd` (repo aira-pmd) saat ini melakukan otorisasi **di sisi klien**: `access.py` (`RULES` regex per path, domain, group floor, antrian tulis dengan ACC SuperAdmin) memakai **satu user servis ERP**. `catalog.json`-nya adalah salinan basi dari registry ini dan akan diganti dengan pengambilan katalog dari Entaris.
- Registry saat ini: `server/src/ai/aira-tool-router.json` (sumber tunggal). Semua tool `enabled:false`; pengaktifan = keputusan owner di tahap berikutnya.

## Keputusan

### (i) Transport
Entaris mengekspos MCP lewat **Streamable HTTP**: satu endpoint per toolset `/mcp/<toolset>` (penjualan, pembelian, persediaan, produksi, akuntansi, kas-bank, aset-umum, pengajuan-pembayaran, persetujuan, laporan, dashboard, master-data, sistem) ditambah `/mcp` (semua tool + tool penemuan `cari_tool` dan `dokumen_tool`). Hanya dapat dijangkau lewat **Tailscale** (tidak dipublikasikan ke internet).

### (ii) Tier
| Risk | Tier | Perilaku |
|---|---|---|
| `read` | **Auto** | Dieksekusi langsung (tetap dibatasi izin pemanggil). |
| `write` | **Draft/Approve** | Membuat draft atau antrian persetujuan; tidak pernah posting sendiri, kecuali tool ditandai owner **dan** aktor terdaftar sebagai *direct writer*. |
| `critical` | **Wajib-Approve** | Nonaktif secara default; bila diaktifkan selalu lewat persetujuan manusia. |

Field katalog `draftCapable`, `postingEffect`, `confirm_template` menjadi bahan UI persetujuan.

### (iii) Model identitas (pilihan owner: per-user)
Di dalam Entaris dibuat **AIRA registry**: setiap orang yang boleh berbicara dengan AIRA terdaftar dengan
- user Entaris (nullable untuk pihak eksternal),
- pengenal channel (nomor WhatsApp / Telegram id),
- **peran AIRA** (Manajemen / Karyawan / Konsultan / Customer / Vendor / Publik; dapat diperluas),
- jabatan, departemen/entitas, **domain tambahan** (HR / Keuangan / Penjualan / PPIC / EAM / ERP / IT),
- flag (superadmin, direct writer) dan status aktif.

Ditambah **matriks kemampuan** (kemampuan x peran x tier) dan **matriks akses data** (kategori data x peran/domain) yang dapat diedit di *Settings > AIRA*.

**Izin efektif satu panggilan = RBAC Entaris user terpetakan ∩ matriks peran/domain AIRA ∩ tier tool ∩ konteks channel.**

### (iv) Autentikasi gateway
Gateway Hermes mengautentikasi tiap panggilan dengan **kredensial servis per profil** *ditambah* **actor assertion** bertanda tangan: HMAC atas `actor id + channel + group-floor flag + timestamp + nonce`, TTL pendek, anti-replay (nonce sekali pakai). Dengan begitu **Entaris, bukan plugin Hermes, yang memutuskan siapa boleh apa**. Chat grup memakai anggota berprivilese terendah (dihitung Hermes, dikirim dalam assertion).

### (v) Panel chat Entaris
Panel chat tetap ada: user login -> backend Entaris -> API server profil Hermes (OpenAI-compatible, platform gateway `api_server`) dengan assertion untuk user tersebut. Kontrak lama aira-core (`/v1/run/stream` dst., A3 HMAC, `AIRA_API_TOKEN`, service token yang bertindak sebagai Admin) **akan dipensiunkan**.

### (vi) Audit & kontrol
Setiap panggilan dicatat: aktor, channel, tool, hash argumen, keputusan (`allowed` / `queued` / `denied`), tampil di **Jejak Audit**. Kill switch `agenticEnabled`; rate limit per aktor/tool.

### (vii) Topologi
Satu instance Entaris + satu endpoint MCP + **satu profil Hermes per perusahaan** (DPA, PMD, KSO). App id `simple-erp` dipertahankan.

### (viii) Tahapan
| Tahap | Isi |
|---|---|
| **0** | Katalog lengkap, akurat, terdokumentasi + drift guard (**dokumen ini + `docs/ai-tools/`**) |
| 1 | MCP read-only + AIRA registry + actor assertion |
| 2 | Tulis draft/approval + prompts; porting logika deterministik aira-core (lihat bawah) |
| 3 | Panel chat -> API server Hermes |
| 4 | Pensiun aira-core |

## Keputusan: Hermes menggantikan AIRA Core

**AIRA Core** (repo `ArahKarya/aira/aira-core`: agent core LangGraph.js dengan planner/guardrail/memory-RAG/penjadwal L4/pipeline cashbook; **tidak berjalan di RPi5**, masih merujuk host lama `10.0.8.1`) **digantikan oleh profil Hermes Agent**. Keputusan owner = **Opsi 1: pensiunkan AIRA Core**; panel chat Entaris diarahkan ulang ke `api_server` profil Hermes; Hermes memakai tool Entaris lewat MCP.

**Dipindahkan (bukan dibuang) ke service server Entaris pada tahap 2:**
- Logika cashbook-dari-struk: `aira-core src/cashbook/classifyRows.ts`, `buildCashBookDraft.ts`, `src/erp/journalBuilder.ts`, `resolvers.ts` -> service server + tool tulis MCP **`kas_buat_draft_dari_baris`** yang membuat **draft jurnal** untuk disetujui manusia (OCR/vision dilakukan Hermes sendiri).
- Tier `policy.ts` dan `AIRA_AUTO_MAX_AMOUNT` -> matriks kemampuan AIRA registry / ambang tier per tool.

**Tidak dipindahkan:** memory/RAG (diganti Honcho) dan penjadwal (diganti cron Hermes).

**Dipensiunkan pada tahap 4:** proxy `/api/ai/chat/*` ke aira-core; header A3 HMAC (`airaApproval.ts`, tabel `ai_executed_runs`); service token yang bertindak sebagai Admin (`x-aira-service-token` di `middleware/auth.ts`); env `AIRA_CORE_BASE_URL` / `AIRA_API_TOKEN` / `AIRA_SERVICE_SECRET`; jaringan docker `aira-net`; fitur panel yang terikat kontrak aira-core (`/v1/run/stream`, `/v1/approve`, `/v1/cashbook/*`).

**Pengembangan:** owner akan membuat profil Hermes baru **`aira-dev`** yang terhubung ke Entaris dev lewat Tailscale.

## Konsekuensi untuk katalog (Stage 0)

- `/api/ai/*` (router, konfigurasi, chat) masuk **denylist**: agen tidak boleh mengubah kontrol atas dirinya.
- `catalog.json` (hasil generate) akan disajikan sebagai **resource MCP**; plugin Hermes mengambil katalog dari Entaris, bukan salinan lokal.
- Catatan teknis untuk tahap 1: `routes/ai/router.ts` meneruskan tool write via `fetch` tanpa substitusi `:param` path; MCP server harus mengeksekusi handler lewat service/internal call yang benar, bukan meniru jalur itu.
