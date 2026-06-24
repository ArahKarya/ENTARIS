# BAGIAN D — ARSITEKTUR & KEAMANAN

## D1. Arsitektur Sistem

```
┌──────────────┐  WhatsApp (info & sumber transaksi)   ┌────────────────────────────┐
│  Grup WA     │ ────────────────────────────────────► │   HERMES AGENT (engine)    │
│ (transaksi   │                                        │   • agent loop matang      │
│  masuk)      │ ◄──────────── hasil/laporan ────────── │   • tool-calling native    │
└──────────────┘                                        │   • memori percakapan      │
                                                        │   • model: Claude Opus     │
┌──────────────┐  Telegram (persetujuan owner)          │     via 9router            │
│ Owner (HP)   │ ◄────── notif draft + [Setuju] ─────── │                            │
│              │ ───────────── keputusan ─────────────► │                            │
└──────────────┘                                        └─────────────┬──────────────┘
                                                                      │ HTTPS + SERVICE_TOKEN
                                                                      ▼
                                                  ┌──────────────────────────────────┐
                                                  │   ERP TOOL API (/api/ai/tools/*)  │
                                                  │   wrapper tipis + cek izin ulang  │
                                                  └─────────────┬─────────────────────┘
                                                                ▼
                              ┌─────────────────────────────────────────────────────┐
                              │  Service ERP existing (paymentSubmit, salesInvoice…) │
                              │  + ApprovalRequest (approve-before-effect)           │
                              │  + double-entry GL + audit trail                     │
                              └─────────────────────────────────────────────────────┘
```

**Komponen yang dibangun:**
1. **ERP Tool API** (`/api/ai/tools/*`) — ~15-20 endpoint awal (READ + pilot bank), tumbuh bertahap.
   Auth via `SERVICE_TOKEN` (pola yang sudah dipakai ArahLead engine). Tiap tool = wrapper tipis di atas
   service existing + cek izin ulang.
2. **Konfigurasi Hermes** — daftarkan tool ERP, sambungkan model Opus@9router, set whitelist & kanal.
3. **Service-user "AI Agent"** + role RBAC khusus (scoped, tidak super-admin).
4. **Entitas AI-layer** (Bagian B) untuk audit & percakapan.

**Yang TIDAK dibangun (karena sudah ada di Hermes):** agent loop, tool-calling, manajemen percakapan,
integrasi Telegram/WA, memori. Inilah alasan pemilihan Hermes-engine — hemat ~6-8 sesi pengembangan.

## D2. Kanal — WhatsApp (Informasi) + Telegram (Persetujuan)

Keputusan final Ndoro: dua kanal dengan peran terpisah.

| Kanal | Peran | Alur |
|---|---|---|
| **WhatsApp** | Informasi & **sumber transaksi** | AI membaca grup WA tempat transaksi sekarang ditulis; staf tetap chat seperti biasa. AI mengubahnya jadi draf ERP. Hasil dikirim balik ke grup WA. |
| **Telegram** | **Persetujuan** owner | Aksi tier 🔴 → notif draf + tombol [Setuju]/[Tolak] di Telegram. Owner menyetujui dari HP. |

Alur ujung-ke-ujung (contoh pencatatan bank):
```
Grup WA: "masuk 50jt dari PT Sukses ke BCA, buat invoice INV-123"
   → AI baca → cek whitelist pengirim → search_global("PT Sukses", "INV-123")
   → pay_draft_receive(amount=50jt, account=BCA, allocate=INV-123)
   → notif ke Telegram owner: "Catat Payment Rp 50jt ke BCA, alokasi INV-123? [Setuju]"
   → owner Setuju → pay_record() via paymentSubmit (atas nama "AI Agent")
   → AiActionAudit dicatat → hasil balik ke grup WA: "✅ tercatat PAY-0456"
```

## D3. Model Izin Dua-Lapis

| Lapis | Mekanisme | Tujuan |
|---|---|---|
| **Lapis 1 (Agen)** | AI cek `AiWhitelist.scope` + role sebelum memanggil tool | Agen tahu apa yang boleh; menolak permintaan di luar wewenang |
| **Lapis 2 (Backend)** | Tool API cek ulang `can(role, module, action)` + `hasCap()` | Pertahanan terakhir — walau agen "dibujuk" prompt-injection, backend menolak |

Matriks tier × modul:

| Tier | Definisi | Modul tipikal |
|---|---|---|
| 🟢 Auto | Read-only, langsung dijalankan | Semua laporan, query, search, status |
| 🟡 Draft/Konfirmasi | Konfirmasi di chat, efek ringan/master | Quotation, master data, GA work order |
| 🔴 Wajib Approve | Persetujuan owner via Telegram | Semua yang menyentuh GL/kas/stok: payment, invoice, DO, journal, dll |

## D4. Keamanan & Tata Kelola

1. **Anti prompt-injection.** Backend tak pernah percaya klaim agen soal izin — selalu cek ulang. Tool 🔴
   selalu lewat `ApprovalRequest`, tak bisa di-bypass dari sisi agen.
2. **Identitas AI.** Aksi tercatat atas nama service-user "AI Agent". Laporan dapat memfilter input AI vs manusia.
3. **Audit berlapis.** `AiToolCall` + `AiActionAudit` (lapisan AI) DAN `AuditLog` (ERP existing) — dua jejak independen.
4. **Batas nominal.** (Keputusan kemarin: tidak ada plafon staf — SEMUA aksi finansial 🔴 wajib approve owner.)
5. **Whitelist ketat.** Hanya channel ID terdaftar yang dilayani; sisanya diabaikan/ditolak.
6. **Kill switch.** Nonaktifkan `AiAgentIdentity.isActive` → semua aksi AI berhenti seketika.
7. **Privacy data finansial.** Model via 9router; tidak ada data ke layanan publik tak terkontrol. Opsi
   masa depan: model lokal (Mac Mini) untuk isolasi penuh.

---

# BAGIAN E — ROADMAP & TATA KELOLA

## E1. Roadmap Rollout Bertahap

Prinsip: **risiko menaik bertahap.** Mulai dari nol-risiko (read), lalu satu use-case berisiko terkontrol
(pilot bank), lalu meluas.

| Fase | Cakupan | Tools | Risiko | Estimasi |
|---|---|---|---|---|
| **0. Fondasi** | Entitas AI-layer, service-user "AI Agent", Tool API kerangka, sambung Hermes↔Opus, whitelist | infra | Rendah | 2-3 sesi |
| **1. READ-only** | Semua laporan + query (🟢) — "berapa laba", "piutang jatuh tempo", "stok menipis" | ~77 READ | **Nol** | 2-3 sesi |
| **2. Pilot Bank** | Pencatatan bank (draft→approve→record) via WA+Telegram | ~6 (Bank) | Terkontrol | 3-4 sesi |
| **3. Transaksional Inti** | Penjualan + Pembelian (SO/DO/Invoice/PO/GR/PI) | ~40 | Sedang | 5-7 sesi |
| **4. Stok & Akuntansi** | Transfer/Opname/Produksi + Jurnal/COA/Aset | ~30 | Sedang | 4-6 sesi |
| **5. EAM/GA** | Aset, kendaraan, gedung, maintenance, dokumen (mostly 🟡) | ~32 | Rendah-sedang | 4-6 sesi |
| **6. Memori & Proaktif** | AiMemory + reminder proaktif (dokumen kedaluwarsa, stok minim, piutang due) | — | Rendah | 3-4 sesi |

**Quick win terbesar = Fase 1 (READ).** Nol risiko, langsung berguna, membangun kepercayaan sebelum aksi.

## E2. Definition of Done per Fase

- **Fase 0:** entitas AI-layer ter-migrasi; Hermes memanggil 1 tool dummy ERP via SERVICE_TOKEN sukses; whitelist berfungsi.
- **Fase 1:** AI menjawab ≥10 pertanyaan laporan dengan akurat dari data nyata; nol mutasi DB.
- **Fase 2:** 1 transaksi bank end-to-end (WA→draft→Telegram approve→record→audit) sukses & terverifikasi di GL.
- **Fase 3+:** tiap modul punya ≥1 alur transaksional teruji + tercatat di AiActionAudit + lolos cek GL balanced.

## E3. Metrics & Monitoring

| Metrik | Target | Sumber |
|---|---|---|
| Akurasi tool-call (benar argumen) | >95% | AiToolCall.status |
| Approval rate (draf disetujui tanpa koreksi) | >80% | AiActionAudit vs ApprovalRequest |
| Biaya token / transaksi | terukur, terkendali | AiMessage.costUsd |
| Latensi rata-rata aksi | <30 dtk | AiToolCall.latencyMs |
| Insiden izin (tool ditolak backend) | mendekati 0 | log Tool API |

## E4. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| AI salah catat keuangan | Tinggi | Tier 🔴 wajib approve owner; double-entry validasi; cancel cascade tersedia |
| Prompt-injection via grup WA | Tinggi | Izin 2-lapis; backend cek ulang; whitelist; tool 🔴 selalu approval |
| Salah party/invoice (entity resolution) | Sedang | `search_global` + konfirmasi di draf sebelum approve |
| Biaya token membengkak | Sedang | Monitoring costUsd; batasi konteks; model lokal masa depan |
| Ketergantungan Hermes | Sedang | Tool API standar (REST) — engine bisa diganti tanpa ubah ERP |
| Data sensitif ke cloud | Sedang | 9router terkontrol; opsi Mac Mini lokal (isolasi penuh) |

## E5. Keputusan Final (terkunci)

| # | Aspek | Keputusan |
|---|---|---|
| 1 | ERP target awal | AKS (generic) |
| 2 | Engine | Hermes + ERP Tool API + Opus@9router |
| 3 | Kanal | WhatsApp = info/sumber · Telegram = approval |
| 4 | Akses | Whitelist user |
| 5 | Plafon | Tidak ada — semua aksi finansial 🔴 wajib approve owner |
| 6 | Model | Claude Opus @9router |
| 7 | Identitas | Aksi AI atas nama service-user "AI Agent" |
| 8 | Pilot | Pencatatan bank |

## E6. Open Questions (untuk fase implementasi)

1. Format pesan WA yang akan "dibaca" AI — bebas natural, atau ada pola/keyword pemicu?
2. Siapa saja di-whitelist awal (owner saja, atau + staf keuangan)?
3. AiMemory pakai pgvector (perlu extension) atau tunda ke fase 6?
4. Reminder proaktif (Fase 6) — kanal mana & frekuensi?
5. Kebijakan retensi data percakapan AI (AiMessage bisa besar) — arsip/purge berapa lama?

---

*Disiapkan oleh Arah Karya Sinergi (AKS) — Dokumen Teknis ERD & AI Layer ERP, Juni 2026.*
