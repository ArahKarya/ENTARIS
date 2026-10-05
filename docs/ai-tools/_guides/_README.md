# Katalog Tool AIRA/MCP Entaris

> File ini dibangkitkan dari `docs/ai-tools/_guides/_README.md` oleh `npm run ai-tools:docs` — edit sumbernya, bukan hasilnya.

Katalog ini mendokumentasikan **semua fungsi Entaris** yang dapat dipanggil agen (AIRA) sebagai *tool*. Saat ini: {{COUNTS}} Seluruh tool **aktif** secara default dan disajikan lewat satu endpoint MCP `/mcp` (lihat ARSITEKTUR-MCP.md); tier read/write/critical menentukan apakah panggilan langsung dieksekusi atau menunggu persetujuan manusia, dan owner dapat menonaktifkan/menetapkan tier per tool.

Arsitektur MCP (identitas per-user, tier, antrian persetujuan, spesifikasi token + actor assertion): [ARSITEKTUR-MCP.md](ARSITEKTUR-MCP.md). Panduan klien MCP + implementasi referensi penanda tangan: [PANDUAN-KLIEN-MCP.md](PANDUAN-KLIEN-MCP.md). Panel chat (sesi disimpan Entaris, kontrak ke engine, blok identitas): [PANEL-CHAT.md](PANEL-CHAT.md).

## Cara membaca

| File | Isi |
|---|---|
| [INDEX.md](INDEX.md) | Semua toolset + tabel seluruh tool (cari dengan Ctrl+F) |
| `<toolset>.md` | Tujuan, **ALUR BISNIS**, lalu rincian tiap tool (parameter, contoh, efek pembukuan) |
| [DENYLIST.md](DENYLIST.md) | Endpoint yang sengaja TIDAK menjadi tool + alasannya |
| [GLOSARIUM.md](GLOSARIUM.md) | Istilah bisnis & teknis (STT, BPB, DO/SJ, WAC/HPP, COA, JV, ...) |
| [AUDIT.md](AUDIT.md) | Hasil rekonsiliasi registry Juni 2026 vs kode (temuan & perbaikan) |
| `catalog.json` | Versi mesin-baca (dokumentasi per tool ikut disertakan) — kelak disajikan sebagai resource MCP |

Toolset: penjualan, pembelian, persediaan, produksi, akuntansi, kas-bank, aset-umum, pengajuan-pembayaran, persetujuan, laporan, dashboard, master-data, sistem, obrolan.

## Tier

| Risk | Tier | Arti |
|---|---|---|
| `read` | Auto | Hanya membaca. Termasuk POST murni baca (`safeNonGet`: preview/export data). |
| `write` | Draft/Approve | Membuat/mengubah draft atau keadaan yang dapat dibalik; tidak memposting GL/stok. |
| `critical` | Wajib-Approve | Memposting GL/stok/WAC, membatalkan/membalik dokumen terposting, pembayaran, keputusan persetujuan. |

Field penting per tool: `draftCapable` (hanya membuat draft / pengajuan pending), `postingEffect` (efek GL/stok/WAC), `confirm_template` (kalimat persetujuan), `roles` + `module`/`permAction` (izin RBAC nyata), `params` (path/query/body dengan tipe, wajib, enum).

## Konvensi

- Nama tool: `snake_case`, `<modul>_<aksi>` (mis. `so_submit`, `payreq_pay`). Nama lama dipertahankan bila benar.
- `handler` = `METHOD /api/path` persis seperti route Express (nama `:param` ikut menjadi nama argumen).
- Kode berbahasa Inggris, dokumentasi Bahasa Indonesia.
- `group` (legacy, dipakai whitelist modul AIRA di UI) tetap ada; `toolset` adalah pengelompokan katalog baru.

## Sumber kebenaran & alur kerja

- **Registry**: `server/src/ai/aira-tool-router.json` (satu-satunya; salinan lama di `docs/erd-ai-layer/config/` dihapus). Tipe: `server/src/ai/types.ts`; validasi: `server/src/ai/registry.ts`.
- **Inventori route**: dihitung statis dari kode (`server/src/ai/catalog/inventoryRoutes.ts`) — `npm run ai-tools:inventory` (JSON di `server/scripts/ai-tools/out/`).
- **Denylist**: `server/src/ai/catalog/denylist.ts`.
- **Panduan alur bisnis**: tulisan tangan di `docs/ai-tools/_guides/<toolset>.md` (paragraf pertama = tujuan; bagian `###` = ALUR BISNIS).
- **Dokumentasi**: `npm run ai-tools:docs` (server/) membangkitkan ulang seluruh `docs/ai-tools/` secara idempoten.

### Menambah endpoint baru

1. Buat route seperti biasa.
2. Tambahkan entri tool di registry (atau masukkan ke denylist dengan alasan).
3. `npm run ai-tools:docs`, commit hasilnya.
4. `npm run ai-tools:check` harus hijau.

### Drift guard (`npm run ai-tools:check` + test vitest `aiToolsCatalog`)

Gagal bila: (a) handler registry tak cocok route nyata; (b) route non-denylist tanpa tool; (c) tool write/critical tanpa `confirm_template`/`postingEffect`; (d) tool tanpa deskripsi/parameter terdokumentasi; (e) `docs/ai-tools` tidak mutakhir terhadap registry. CI menjalankannya setelah test server.
