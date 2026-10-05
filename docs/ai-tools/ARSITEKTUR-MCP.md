# Arsitektur MCP: Entaris sebagai MCP Server untuk Hermes

Status: **Tahap 1-2 diimplementasikan** (endpoint `/mcp`, identitas per-user, tier & antrian persetujuan, token & riwayat di Settings). Panel chat masih memakai proxy lama (tahap 3). Katalog tool: [README.md](README.md) · [INDEX.md](INDEX.md). Panduan pemasangan Hermes: [HERMES-SETUP.md](HERMES-SETUP.md).

## Ringkasan

- **Satu endpoint** `POST /mcp` (Streamable HTTP, **stateless**, respons JSON). Tidak ada endpoint per-toolset.
- Menyajikan **semua tool registry yang tidak masuk denylist** (462, semuanya `enabled:true` secara default; owner dapat menonaktifkan/menetapkan tier per tool lewat `PATCH /api/ai/config/tools/:name`) ditambah meta-tool `cari_tool`, `dokumen_tool`, `whoami` (+ `panggil_tool` pada mode ringkas).
- **Entaris, bukan Hermes, memutuskan siapa boleh apa**: tiap panggilan dijalankan lewat handler Express asli dengan JWT berumur pendek atas nama **user Entaris** yang sedang dilayani. RBAC, validasi Zod, `needsApproval`, jejak audit berlaku seperti di UI.
- Hanya dijangkau lewat jaringan privat (Tailscale); jangan dipublikasikan ke internet.

## Identitas: token + actor assertion

Dua lapis autentikasi per request:

1. **Token servis per profil Hermes**: `Authorization: Bearer entmcp_...` (dibuat di *Settings > AIRA (MCP)*). Hanya `sha256(token)` yang disimpan. Token punya `signing secret` (`entsig_...`) yang dipakai menandatangani assertion.
2. **Actor assertion per panggilan** yang menyatakan *siapa* yang sedang dilayani.

### Spesifikasi actor assertion (v1)

| Header | Isi |
|---|---|
| `X-Entaris-Actor` | `base64url(JSON)` tanpa padding |
| `X-Entaris-Actor-Sig` | hex `HMAC-SHA256(signingSecret, <string base64url persis seperti di header>)` |

Payload JSON:

```json
{"v":1,"uid":"<id user Entaris>","ch":"whatsapp|telegram|panel|cli","gf":false,"ts":1790000000,"nonce":"<uuid>","ref":"<opaque chat/session ref, opsional>"}
```

- `uid` = id user Entaris (Hermes memetakan identitas channel -> user id; **nomor WhatsApp/Telegram tidak disimpan di Entaris**).
- `gf` = *group floor*: Hermes memakai anggota grup berprivilese terendah sebagai `uid`. Bila `gf=true`, level `direct` diturunkan menjadi `standard` (tulis/kritis selalu lewat persetujuan).
- `ts` epoch detik. **TTL 120 detik**; `ts` boleh maksimal 30 detik di depan jam server.
- `nonce` **sekali pakai**. Disimpan di tabel `mcp_nonces` (unique `(token_id, nonce)`): insert unik = atomik lintas replika dan tahan restart; dibersihkan scheduler tiap jam (retensi = TTL + skew). Dipilih dibanding Map in-memory karena TTL 120 detik akan terbuka untuk replay setelah restart bila hanya di memori.
- Verifikasi (urutan): bentuk base64url -> **tanda tangan constant-time** (`timingSafeEqual`) sebelum payload dipercaya -> skema payload -> TTL -> nonce -> user ada/aktif/**terdaftar AIRA** (`airaEnabled`).
- Tanpa assertion: panggilan bertindak sebagai `defaultActorUserId` token (untuk CLI/dev/Claude Desktop), channel `cli`. Tanpa aktor default -> `401 actor_required`. Assertion yang *dikirim tetapi salah* tidak pernah jatuh ke aktor default.
- **Alternatif pembawa** untuk klien yang hanya punya header statis (mis. Hermes, lihat HERMES-SETUP): assertion yang sama boleh dikirim di `params.arguments._entaris_actor` + `_entaris_actor_sig` pada `tools/call`. Kunci itu dibuang sebelum tool dijalankan; keamanan identik (HMAC + TTL + nonce, model AI tidak memegang secret sehingga tak bisa memalsukan). Header menang bila keduanya ada.

Kode galat (HTTP + JSON-RPC `error.data.code`): `token_missing|token_invalid|token_revoked|token_expired` (401), `actor_assertion_malformed|actor_signature_invalid|actor_assertion_expired|actor_assertion_future|actor_nonce_replayed|actor_required` (401), `actor_unknown|actor_inactive|actor_not_registered` (403), `agentic_disabled` (503), `rate_limited` (429, `Retry-After`), `payload_too_large` (413), `method_not_allowed` (405).

### Registrasi pengguna AIRA

`User.airaEnabled` (default `false`), `User.airaTier`, `User.airaJabatan` (diatur di *Manajemen Pengguna*):

| Level | Perilaku |
|---|---|
| `read` (Baca saja) | hanya tool `risk=read`; tool tulis tidak tampil di `tools/list` dan ditolak bila dipanggil |
| `standard` (Standar) | read langsung; write langsung **hanya bila `draftCapable`**; write non-draft dan **semua critical** masuk antrian persetujuan |
| `direct` (Langsung) | write/critical dijalankan langsung sebagai aktor (tetap RBAC + gate normal handler; UI memberi peringatan) |

Override per tool (`AiToolConfig`): `enabled=false` menyembunyikan tool; tier `must_approve` memaksa antrian untuk semua level; tier `auto` membuat tool langsung dijalankan (kecuali level `read`).

**Izin efektif satu panggilan = RBAC role user (modul + capability, dijalankan oleh handler asli) ∩ matriks tier di atas.** `tools/list` hanya memuat tool yang lolos modul/capability role + level AIRA; handler asli tetap penentu akhir.

## Alur eksekusi

```
Hermes --POST /mcp (Bearer + assertion)--> gerbang: token -> kill switch -> rate limit -> aktor
   tools/call:
     meta-tool            -> hasil langsung
     tool domain:
       tier read / draft  -> handler asli (loopback HTTP, JWT 120 dtk atas nama aktor) -> hasil
       tier queue         -> ApprovalRequest `ai_tool:<nama>` (payload {tool,args,handler,confirm,actor,via:'mcp'})
                             -> hasil `pending_approval` + approvalId + teks konfirmasi
   catat McpCallLog (hash argumen, keputusan, durasi, approvalId)

Manusia di Entaris > Persetujuan:
   Setuju -> services/approvalDecision.ts -> mcp/approve.ts: klaim atomik Pending->Executing,
             jalankan panggilan tersimpan lewat handler asli SEBAGAI PENGAJU ASLI (via=mcp di jejak audit),
             tandai Approved + simpan hasil. Handler menolak -> kembali Pending + payload.lastError.
   Tolak  -> tidak ada yang dijalankan.
```

- Path `:id` disubstitusi dari argumen (nilai `.`/`..`/berisi `/` ditolak), sisa argumen -> query (GET/DELETE) atau body JSON.
- Gate yang sudah ada tetap bekerja karena eksekusi lewat handler normal: `needsApproval` (produksi/PI/DO/retur), edit-approval, `requireCap`, RBAC modul, audit trail. Contoh: aktor non-bypass level `direct` memanggil `prod_draft_post` tetap menghasilkan pengajuan `ProductionRun` (202) milik sistem.
- Validasi cepat (enum, wajib, tipe dasar) dilakukan **sebelum** antrian agar kesalahan argumen tak baru ketahuan saat approver menyetujui.
- Hasil dibatasi 60.000 karakter (daftar dipotong dengan keterangan + petunjuk `page`/`limit`), rahasia disamarkan (`utils/redact.ts`), galat handler (Bahasa Indonesia) diteruskan apa adanya sebagai `isError`, tidak pernah HTTP 500 ke klien MCP.
- **Idempotensi**: argumen opsional `idempotencyKey` (tool write/critical). Pasangan `(token, key)` unik; panggilan ulang mengembalikan hasil pertama (`replayed:true`) tanpa menjalankan ulang. Kegagalan melepas kunci sehingga bisa dicoba lagi.
- **Mode ringkas** (`X-Entaris-Tools: compact` atau `?mode=compact`): `tools/list` hanya memuat meta-tool + `panggil_tool({tool,args})` dan **tidak butuh aktor**. Wajib dipakai klien yang membatasi konteks: `tools/list` penuh untuk Admin ~445 KB (±465 definisi).

## Keputusan keamanan

| Topik | Keputusan |
|---|---|
| Token | `sha256` saja di DB; tampil sekali; dapat dicabut; opsional kedaluwarsa; `lastUsedAt/IP` (ditulis maks. sekali/menit) |
| Signing secret | AES-256-GCM at-rest, kunci HKDF-SHA256 dari env `MCP_SECRET_KEY` (fallback `JWT_SECRET`). Tampil sekali; **rotate-secret** menggantikan seketika. Memutar `JWT_SECRET` tanpa `MCP_SECRET_KEY` membuat secret lama tak terbaca (wajib rotate semua token) |
| Nonce | tabel DB `mcp_nonces`, insert unik (lihat di atas) |
| Rate limit | jendela geser in-memory per token (`rateLimitPerMin`, default 120). Per proses: multi-replika = batas x jumlah replika |
| Ukuran | body JSON-RPC maks. 256 KB (413); hasil dipotong 60.000 karakter |
| Kill switch | `AiSetting.agenticEnabled=false` -> semua panggilan `503` seketika (dicek tiap request, dicatat) |
| Denylist | endpoint di `catalog/denylist.ts` (auth, user/role admin, backup, import, `/api/ai/*`, ...) tidak ada di registry sehingga tak dapat dipanggil |
| Identitas internal | JWT 120 detik bertanda `via:'mcp'` (+ nama token, channel, tool, approvalId) -> kolom `audit_trail.via` / `via_meta`; IP klien diteruskan lewat `X-Forwarded-For` ke loopback |
| Riwayat | `mcp_call_logs`: token, aktor, channel, tool, risk, **hash** argumen, keputusan (`allowed/queued/denied/error`), HTTP status, durasi, approvalId. Argumen mentah tak disimpan |
| Jalur lama | `/api/ai/router`, A3 HMAC (`airaApproval`), `x-aira-service-token` (Admin), `AiSetting.serviceToken`, whitelist channel/modul **dihapus** (kolom/tabel dibiarkan; `ai_settings.service_token` dikosongkan oleh migrasi) |

## Admin REST (`requireCap('rbac.manage')`)

`GET/PUT /api/ai/mcp/status` · `GET/POST /api/ai/mcp/tokens` · `PATCH/DELETE /api/ai/mcp/tokens/:id` (+ `POST .../revoke`) · `POST /api/ai/mcp/tokens/:id/rotate-secret` · `GET /api/ai/mcp/calls` (halaman `{data,total,page,limit}`; filter `decision,tool,tokenId,actor,startDate,endDate`). Override per tool: `GET /api/ai/config/tools`, `PATCH /api/ai/config/tools/:name`.

## Konteks & fakta terverifikasi

- Hermes Agent punya MCP client (`hermes mcp add --url ... --auth header`) dan platform gateway `api_server`; profil: `aira-dev`, `aira-dpa`, `aira-pmd` (Raspberry Pi 5, Tailscale). Temuan kemampuan klien MCP Hermes: lihat [HERMES-SETUP.md](HERMES-SETUP.md).
- Plugin `erp_pmd` (repo aira-pmd) saat ini mengotorisasi di sisi klien dengan satu user servis ERP; digantikan oleh model ini.
- Registry: `server/src/ai/aira-tool-router.json` (sumber tunggal) -> [README.md](README.md).

## Tier katalog

| Risk | Tier | Perilaku (level `standard`) |
|---|---|---|
| `read` | Auto | langsung (tetap dibatasi izin pemanggil) |
| `write` | Draft/Approve | langsung bila `draftCapable` (membuat draft/pengajuan pending), selain itu antrian persetujuan |
| `critical` | Wajib-Approve | selalu antrian persetujuan manusia |

`draftCapable`, `postingEffect`, `confirm_template` menjadi bahan UI persetujuan (teks konfirmasi dirender dari template + argumen).

## Keputusan: Hermes menggantikan AIRA Core

**AIRA Core** (agent core LangGraph.js; tidak berjalan di RPi5) **digantikan oleh profil Hermes Agent** (Opsi 1 owner). Panel chat Entaris akan diarahkan ulang ke `api_server` profil Hermes (tahap 3; sementara proxy `/api/ai/chat/*` dipertahankan dan menampilkan *offline*).

**Dipindahkan ke service server Entaris (tahap 2 lanjutan):** logika cashbook-dari-struk (`classifyRows`, `buildCashBookDraft`, `journalBuilder`, `resolvers`) -> tool tulis **`kas_buat_draft_dari_baris`** yang membuat draft jurnal; tier `policy.ts`/`AIRA_AUTO_MAX_AMOUNT` -> ambang tier per tool. **Tidak dipindahkan:** memory/RAG (Honcho) dan penjadwal (cron Hermes).

## Tahapan

| Tahap | Isi | Status |
|---|---|---|
| 0 | Katalog lengkap + drift guard | selesai |
| 1-2 | `/mcp`, token + actor assertion, tier, antrian persetujuan, Settings AIRA (MCP), registrasi pengguna | **selesai (dokumen ini)** |
| 2b | Tool `kas_buat_draft_dari_baris`, prompts MCP, resource katalog | belum |
| 3 | Panel chat -> `api_server` Hermes | belum |
| 4 | Pensiun aira-core (proxy `/api/ai/chat/*`, env `AIRA_CORE_BASE_URL`/`AIRA_API_TOKEN`, jaringan `aira-net`) | belum |
