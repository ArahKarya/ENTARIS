# Dokumen Teknis: ERD & AI Layer untuk Entaris — Fungsi ERP Lengkap

**Produk:** Lapisan AI Agentic (AI Resident Assistant) untuk Entaris — ArahKarya
**Arsitektur:** engine AIRA + ERP Tool API + model AI terkelola
**Cakupan:** SELURUH 35 modul ERP (250+ endpoint, 96 entitas)
**Disiapkan oleh:** Arah Karya Sinergi (AKS)
**Tanggal:** 23 Juni 2026 · **Versi:** 1.0 (Highest-Effort / ERP-wide)

---

# BAGIAN A — KONTEKS & STRATEGI

## A1. Ringkasan Eksekutif

Dokumen ini adalah **blueprint engineering** untuk membangun lapisan AI agentic di atas Entaris — bukan
proof-of-concept satu fitur, melainkan rancangan menyeluruh yang memetakan **seluruh 35 modul ERP** ke
kemampuan AI (membaca data, menyiapkan draf dokumen, dan mengeksekusi transaksi dengan persetujuan manusia).

Inti dokumen:
1. **ERD Layer AI** — tujuh entitas data baru yang menjadi tulang punggung AI (percakapan, pesan, tool-call,
   audit aksi, whitelist, identitas agen, memori) beserta relasinya ke 96 entitas ERP yang sudah ada.
2. **Pemetaan fungsi ERP lengkap** — katalog tool agentic untuk tiap modul (READ / DRAFT / ACTION) lengkap
   dengan tingkat izin (tier), dipetakan ke endpoint dan service nyata di kode.
3. **Arsitektur & keamanan** — engine AIRA, kanal WhatsApp (informasi) + Telegram (persetujuan),
   model izin dua-lapis, dan jejak audit penuh untuk setiap aksi AI.

Temuan kunci dari audit kode: **fondasi agentic sudah ~80% tersedia.** ERP telah memiliki RBAC dinamis,
mekanisme `ApprovalRequest` dengan pola *approve-before-effect*, service submit/cancel terbungkus per dokumen,
audit trail, double-entry otomatis, dan integrasi Telegram. Lapisan AI tidak membangun ulang logika bisnis —
ia **memanggil fondasi yang sudah teruji** melalui Tool API tipis.

## A2. Latar Belakang — Realita Kode (hasil audit)

Seluruh dokumen ini dibangun di atas audit kode nyata, bukan asumsi. Ringkasan temuan:

| Aspek | Temuan terverifikasi |
|---|---|
| Route files | 49 file (`server/src/routes/`) |
| Endpoint REST | ~250 |
| Service terbungkus | 30+ (submit/cancel/edit/revise per dokumen) |
| Model Prisma (entitas) | **96** (schema 2.662 baris) |
| Modul RBAC | **35 modul** dalam 8 grup |
| Capability sensitif | 6 (`doc.cancel`, `approval.decide`, `approval.bypass`, `approval.view_all`, `inventory.negative_stock`, `rbac.manage`) |
| Approval gate | `ApprovalRequest` — payload JSON, dokumen dibuat saat approve |
| RBAC | Dinamis: Role × Module → view/edit + capabilities |
| Double-entry | Otomatis di setiap transaksi (GL balanced) |
| Audit trail | `AuditLog` middleware di semua mutasi |
| Integrasi pesan | `telegramService.ts` (395 baris) sudah ada |
| Lib AI/LLM | **Belum ada** — greenfield bersih |

### Cakupan domain ERP (lebih luas dari ERP dagang biasa)

| Grup | Modul | Catatan |
|---|---|---|
| Penjualan | SO, DO, Invoice, Quotation/Inquiry, Retur, Uang Muka Pelanggan | Rantai Quotation→SO→DO→Invoice |
| Pembelian | PO, Penerimaan (BPB/STT), Invoice Beli, Uang Muka Vendor | Rantai PO→GR→PI→Payment |
| Stok & Produksi | Stok/Gudang, Transfer, Opname, **Produksi**, Daftar Gudang | Produksi: Machine, ProductionRun, OEE, downtime |
| Bank & Kas | Transaksi Bank/Kas, Rekonsiliasi, Berulang, Jaminan Proyek | **Pilot pertama di sini** |
| Akuntansi | COA, Jurnal/Buku Besar, Aset Tetap, Approval | Double-entry, depresiasi |
| EAM (General Affairs) | Aset, Kendaraan, Gedung & Sewa, Equipment & Kalibrasi, Maintenance & Work Order, Inventaris, Dokumen Legal, Master Data | 40+ entitas `Ga*` |
| Laporan | Semua laporan keuangan & operasional | Jadi tool READ |
| Master & Sistem | Pelanggan & Vendor, Pengaturan, User, Audit | |

## A3. Visi — dari Pilot Bank ke ERP-wide Agentic

Pendekatan bertahap: mulai dari **pencatatan bank** (use-case pilot, tier berisiko tinggi tapi terbungkus rapi),
lalu meluas ke modul read-only (laporan, query stok/piutang), kemudian modul transaksional (penjualan,
pembelian), dan akhirnya EAM/GA. Setiap fase menambah tool ke katalog yang sama tanpa membangun ulang engine.

**Tujuan akhir:** staf cukup berbicara natural ("buatkan invoice untuk PO-123", "berapa piutang jatuh tempo
minggu ini", "catat transfer masuk 50 juta dari PT X") di kanal chat, dan AI menyiapkan + mengeksekusi
(dengan persetujuan) di ERP — sambil setiap langkah tercatat dan dapat diaudit.

## A4. Prinsip Desain (tidak bisa ditawar)

1. **Agen tidak menulis database secara langsung.** Semua mutasi lewat service ERP yang sudah ada
   (`salesInvoiceSubmit`, `paymentSubmit`, dll) — menjaga integritas double-entry, stok, dan validasi.
2. **Izin dua-lapis.** Agen mengecek izin sebelum memanggil tool, DAN backend mengecek ulang izin saat
   tool dijalankan. Mencegah prompt-injection memaksa aksi di luar wewenang.
3. **Approve-before-effect untuk aksi berdampak.** Re-use `ApprovalRequest`: aksi finansial/berisiko tidak
   langsung jadi — disimpan sebagai draf, dieksekusi hanya setelah owner menyetujui via Telegram.
4. **Identitas AI jelas.** Setiap aksi yang diinput AI tercatat atas nama service-user khusus "AI Agent",
   sehingga laporan dapat memfilter "diinput AI vs manusia".
5. **Audit penuh.** Setiap percakapan, tool-call, dan aksi tercatat di entitas AI-layer (lihat Bagian B)
   plus tetap masuk `AuditLog` ERP existing.
6. **Whitelist akses.** Hanya user yang di-whitelist (channel ID ↔ user ERP) yang boleh memerintah AI.

---

# BAGIAN B — ERD LAYER AI (Model Data Inti)

Lapisan AI memerlukan tujuh entitas baru. Semuanya berprefiks `Ai*` agar terpisah jelas dari entitas ERP.
Entitas ini **menambah**, tidak mengubah, skema ERP existing — relasi ke ERP dilakukan via foreign key lunak
(menyimpan ID + tipe, bukan FK keras) agar lapisan AI dapat dilepas tanpa merusak ERP.

## B1. Daftar Entitas AI-Layer

| Entitas | Fungsi | Volume (estimasi) |
|---|---|---|
| `AiConversation` | Sesi percakapan per kanal/user | Sedang |
| `AiMessage` | Tiap giliran (user/assistant/tool) + token & biaya | Tinggi |
| `AiToolCall` | Catatan tiap tool dipanggil: argumen, hasil, status, latensi | Tinggi |
| `AiActionAudit` | Aksi yang menyentuh ERP (dokumen dibuat/diubah, atas nama AI) | Sedang |
| `AiWhitelist` | Pemetaan channel ID ↔ user ERP ↔ scope izin | Rendah |
| `AiAgentIdentity` | Definisi service-user "AI Agent" + role khusus | Sangat rendah |
| `AiMemory` | Memori semantik per-user/per-entitas (fase lanjut) | Sedang |

## B2. Detail Field per Entitas

### AiConversation — sesi percakapan
| Field | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| channel | string | `telegram` / `whatsapp` |
| channelChatId | string | ID chat/grup sumber |
| userId | uuid (FK→User, lunak) | User ERP pemilik sesi (via whitelist) |
| title | string? | Ringkasan topik (auto) |
| status | string | `active` / `archived` |
| startedAt | datetime | |
| lastMessageAt | datetime | |

### AiMessage — giliran percakapan
| Field | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| conversationId | uuid (FK→AiConversation) | |
| role | string | `user` / `assistant` / `tool` / `system` |
| content | text | Isi pesan |
| toolCallId | uuid? (FK→AiToolCall) | Bila pesan = hasil tool |
| tokensIn / tokensOut | int | Untuk akunting biaya |
| costUsd | decimal? | Biaya token model AI |
| createdAt | datetime | |

### AiToolCall — panggilan tool
| Field | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| conversationId | uuid (FK) | |
| toolName | string | mis. `record_bank_payment` |
| tier | string | `auto` / `draft_approve` / `must_approve` |
| argsJson | json | Argumen tool |
| resultJson | json? | Hasil (atau error) |
| status | string | `success` / `error` / `pending_approval` / `rejected` |
| latencyMs | int? | |
| createdAt | datetime | |

### AiActionAudit — jejak aksi ke ERP
| Field | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| toolCallId | uuid (FK→AiToolCall) | |
| module | string | Modul ERP (mis. `payment`) |
| erpEntityType | string | Tipe dokumen (mis. `Payment`) |
| erpEntityId | string? | ID dokumen ERP yang terpengaruh |
| approvalRequestId | uuid? (FK→ApprovalRequest, lunak) | Bila lewat approval gate |
| actedAsUserId | uuid (FK→User) | Service-user "AI Agent" |
| effect | string | `created` / `updated` / `cancelled` / `drafted` |
| createdAt | datetime | |

### AiWhitelist — kontrol akses
| Field | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| channel | string | `telegram` / `whatsapp` |
| channelUserId | string | ID user/nomor di kanal |
| userId | uuid (FK→User) | User ERP yang dipetakan |
| scopeJson | json? | Batas scope (modul/tier yang diizinkan), null = ikut role |
| isActive | boolean | |

### AiAgentIdentity — identitas agen
| Field | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| serviceUserId | uuid (FK→User) | User "AI Agent" untuk pencatatan |
| roleKey | string | Role RBAC khusus AI (scoped) |
| modelName | string | mis. `claude-opus-4` |
| isActive | boolean | |

### AiMemory — memori semantik (fase lanjut)
| Field | Tipe | Keterangan |
|---|---|---|
| id | uuid (PK) | |
| userId | uuid (FK→User) | |
| scope | string | `user` / `entity` |
| refType / refId | string? | Entitas ERP yang dirujuk |
| content | text | Fakta yang diingat |
| embedding | vector? | Untuk pencarian semantik (pgvector, opsional) |
| createdAt | datetime | |

## B3. Relasi ke ERP Existing

```
AiConversation ──< AiMessage >── AiToolCall ──< AiActionAudit
       │                                              │
       │ (lunak)                                      │ (lunak)
       ▼                                              ▼
     User ◄──────── AiWhitelist            ApprovalRequest ──► (dokumen ERP saat approve)
       ▲                                              │
       │                                              ▼
AiAgentIdentity ──► User (service "AI Agent")    AuditLog (ERP existing)
```

- **Relasi keras** hanya antar entitas `Ai*` (cascade aman).
- **Relasi ke ERP** (`User`, `ApprovalRequest`, dokumen) disimpan sebagai **ID + tipe lunak** — lapisan AI
  dapat di-drop tanpa migrasi merusak ERP.
- Saat aksi tier 🔴 disetujui, `ApprovalRequest` existing yang mengeksekusi (membuat dokumen) — `AiActionAudit`
  hanya mencatat tautannya.

## B4. Migrasi Prisma

Tujuh model `Ai*` ditambahkan ke `schema.prisma` sebagai blok terpisah. Karena DB ERP tidak meng-expose
port (pola multi-tenant), migrasi mengikuti prosedur manual existing: tulis `migration.sql` → `docker exec`
psql `CREATE TABLE` → catat `_prisma_migrations` → `prisma generate` di host. Tidak ada perubahan pada tabel
ERP existing → nol risiko regresi pada data transaksi.
