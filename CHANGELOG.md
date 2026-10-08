# Changelog

## [Unreleased]

### Surat Jalan: nomor PO pelanggan dari Pesanan (SO)
**Diperbaiki**:
- Surat Jalan yang dibuat dari Pesanan kini membawa **No. PO pelanggan** (`customerRefNo`) dan **No. SO** di semua tempat: daftar (kolom "Ref PO / SO"), drawer detail (No. PO Pelanggan, No. Pesanan), dan **PDF Surat Jalan** (No. PO dan No. SO di kolom kanan kop). Sebelumnya hanya daftar tertunda untuk invoice yang membawa data Pesanan, sehingga daftar, detail, dan PDF tidak menampilkan PO pelanggan sama sekali.
- Pencarian Surat Jalan kini juga mencari lewat No. SO dan No. PO pelanggan.
- Baris PO/SO di PDF hanya dicetak bila ada isinya (Surat Jalan tanpa Pesanan tidak berubah).

### AIRA — pembersihan jalur lama (Tahap 4)
**Dihapus**:
- Tabel `ai_whitelist` dan `ai_executed_runs` serta kolom `service_token`, `active_channels`, `whitelist_modules` pada `ai_settings` (migrasi `2026101500000_aira_legacy_cleanup.sql`, idempoten). Data lama (whitelist kanal, catatan eksekusi A3, token layanan) tidak dipakai lagi; jejak panggilan kini ada di `mcp_call_logs`. Kanal dikelola engine AIRA.
- Migrasi SQL lepas lama dijaga agar aman diulang setiap boot setelah kolom/tabel itu hilang.

### Panel chat AIRA tahap 3: sesi disimpan Entaris, agen lewat API kompatibel-OpenAI
**Ditambah**:
- Entaris menyimpan **sesi & pesan chat sendiri** per pengguna (`chat_sessions`, `chat_messages`, `chat_attachments`; migrasi loose idempoten `2026101400000_chat_sessions.sql` dengan FTS `simple` + trigram bila `pg_trgm` tersedia). Riwayat, pencarian, ganti nama, arsip/pulihkan, hapus (diaudit), ekspor Markdown/JSON, sesi terakhir dibuka lintas perangkat, lampiran gambar (dan PDF opsional).
- Panel memanggil agen pemilik lewat **API kompatibel-OpenAI** (stream SSE): ENV `AIRA_ENGINE_URL`, `AIRA_ENGINE_KEY`, opsional `AIRA_ENGINE_MODEL`, `AIRA_ENGINE_TIMEOUT_MS`, `AIRA_ENGINE_TURN_SECRET`, `AIRA_CHAT_*`; bukan di UI Pengaturan (hanya baris status "Engine terhubung/offline"). Tiap giliran mengirim jendela konteks (anggaran token) + ringkasan bergulir inkremental; `user` = id pengguna Entaris.
- **Blok identitas tepercaya** (peran, jabatan AIRA, level, toolset, kapabilitas, perusahaan, waktu WIB, aturan) disusun server dari DB pada setiap giliran sebagai pesan `system` pertama; konten `system` dari browser dibuang; `actorSnapshot` disimpan per pesan pengguna. Tool MCP `whoami` kini mengembalikan `identity_prompt` untuk kanal lain.
- `mcp_call_logs.ref` + `card`: panggilan tool per giliran (`ref` = `<sessionId>:<turnId>`) dan petunjuk **kartu hasil** seragam (`structuredContent.card`: Draft Buku Kas, draft produksi, pengajuan pembayaran, PO/penawaran/SO, antrian persetujuan). Panel menampilkan chip progres tool + kartu secara langsung.
- Toolset baru **`obrolan`** (14 toolset, 474 tool): `chat_cari_riwayat`, `chat_ambil_sesi` (hanya sesi milik aktor).
- Retensi opsional `AIRA_CHAT_RETENTION_DAYS` (hanya sesi arsip), batas 20 giliran/menit/pengguna, satu giliran per sesi.
- UI `/aira` dibangun ulang (daftar sesi dengan pencarian & kelompok waktu, drawer di 390 px, Markdown aman, chip tool, kartu, banner offline, stop/Coba lagi).
- Dokumen: `docs/ai-tools/PANEL-CHAT.md`; agen tiruan reusable untuk uji (`server/src/__tests__/helpers/mockAgent.ts`).

**Dihapus**: proxy panel chat ke layanan lama (`/api/ai/chat/approve`, `/cashbook-approve`, `/cashbook-cancel`, `aira-health`), env `AIRA_CORE_BASE_URL` / `AIRA_API_TOKEN`, jaringan Docker `aira-net`, komponen `CashBookCard`/`DraftCard`, cache sessionStorage panel.

**Deploy**: jalankan migrasi (`prisma migrate deploy` + file `.sql` lepas; entrypoint menjalankan keduanya). Set `AIRA_ENGINE_URL` + `AIRA_ENGINE_KEY` (+ `AIRA_ENGINE_TURN_SECRET`, >= 32 karakter) di `.env`; hapus `AIRA_CORE_BASE_URL`/`AIRA_API_TOKEN` dan jaringan `aira-net` dari konfigurasi lama. Di sisi agen: pasang hook yang memverifikasi tiket giliran dan menandatangani actor assertion per panggilan MCP (lihat `docs/ai-tools/PANEL-CHAT.md`). Tabel chat ikut `pg_dump` penuh dan volume `uploads` (tanpa perubahan skrip backup).

### Fitur: Buku Kas dari nota (Draft Buku Kas) - AIRA tahap 2b
**Ditambah**:
- **Draft Buku Kas** (`DKB-YYYYMM-NNNN`): halaman buku kas / nota yang dibaca engine AIRA dari foto (atau ditempel/CSV oleh manusia) disimpan sebagai draft tanpa efek ke buku besar. Tabel `cash_book_drafts`, `cash_book_draft_rows`, `cash_book_learned_maps`; migrasi loose idempoten `2026101300000_cash_book_drafts.sql`.
- Aturan **deterministik di server** (`utils/cashBookRules.ts`, bukan LLM): arah DR/CR dari kolom masuk/keluar; `pengeluaran` DR akun lawan / CR kas, `pemasukan` DR kas / CR akun lawan, `uang_muka` DR Uang Muka Karyawan (role `EMPLOYEE_ADVANCE`) / CR kas, `terima_kasbon` DR kas / CR Uang Muka Karyawan, `lainnya` (selalu ditinjau) ke akun usulan (`OTHER_EXPENSE` / `OTHER_INCOME` dari Akun Sistem). Keyakinan < 0,7, jenis yang bertentangan dengan arah, akun tak dikenal/grup/nonaktif, dan kemungkinan duplikat (tanggal + nominal + arah + keterangan sama pada akun kas yang sama) ditandai *perlu ditinjau*. Cek saldo (awal + masuk - keluar vs akhir) berupa peringatan, bukan penghalang.
- **Pola terpelajari**: koreksi akun oleh manusia disimpan (keterangan ternormalisasi + jenis -> akun, `hits`) dan dipakai untuk baris serupa berikutnya bila engine tak memberi akun/keyakinannya rendah; akun berkeyakinan tinggi dari engine tidak pernah ditimpa diam-diam.
- Posting: satu jurnal seimbang per baris non-skip (memakai `postJournalInTx`, guard tahun buku terbuka, atas nama pemosting), satu transaksi per draft, klaim atomik (tak bisa dobel-posting); `partial=true` memposting baris valid dan mencatat error per baris (`PartiallyPosted`).
- REST `/api/cash-book-drafts` (izin modul `journal`, sama dengan jurnal manual): `GET /`, `GET /accounts`, `GET /learned-maps`, `GET /:id`, `POST /`, `PUT /:id`, `PUT /:id/rows`, `POST /:id/rows`, `POST /:id/post`, `POST /:id/discard`; jejak audit; notifikasi ke Admin saat draft dibuat AIRA (tautan `/cash-book-drafts/:id`).
- MCP: 10 tool `kas_*` (toolset kas-bank): `kas_daftar_akun`, `kas_pola_terpelajari`, `kas_draft_list`, `kas_draft_get`, `kas_buat_draft_dari_baris`, `kas_draft_ubah_header`, `kas_draft_ubah_baris`, `kas_draft_tambah_baris`, `kas_draft_buang` (draftCapable) dan `kas_draft_posting` (critical: selalu antrian persetujuan untuk aktor Standar). `ref` actor assertion diteruskan ke handler (`mcpRef`) sebagai `sourceRef` draft. Panduan alur engine di `docs/ai-tools/_guides/kas-bank.md`.
- UI **Kas & Bank -> Draft Buku Kas** (`/cash-book-drafts`, daftar dengan tab status di URL) dan halaman tinjau `/cash-book-drafts/:id` (cek saldo langsung, kartu ringkasan, tabel editable dengan penanda *Ragu*/*Duplikat?* + alasan, akun massal, filter "hanya yang perlu ditinjau", Simpan/Posting semua/Buang dengan konfirmasi, hanya-baca setelah diposting dengan tautan jurnal) serta **Buat dari Tempel/CSV** (kolom tanggal, keterangan, masuk, keluar). Kata kunci pencarian global: buku kas, nota, kas harian, petty cash.

**Deploy**: jalankan migrasi (`prisma migrate deploy` + file `.sql` lepas; entrypoint menjalankan keduanya). Tidak ada env/konfigurasi baru. Pastikan Akun Sistem `EMPLOYEE_ADVANCE`, `OTHER_EXPENSE`, `OTHER_INCOME` terpetakan agar kasbon dan akun usulan berfungsi.

### AIRA sebagai MCP server lengkap untuk engine AIRA (`/mcp`)
**Ditambah**:
- Endpoint **`POST /mcp`** (Streamable HTTP, stateless) menyajikan seluruh 462 tool registry (kini `enabled:true` default; override per tool tetap via `AiToolConfig`) + meta-tool `cari_tool`, `dokumen_tool`, `whoami`, `panggil_tool` (mode ringkas `X-Entaris-Tools: compact`, tanpa aktor). `GET /mcp/health` tanpa auth.
- Identitas per-user: token servis per profil engine AIRA (`Authorization: Bearer entmcp_…`, hanya sha256 disimpan) + **actor assertion** bertanda tangan HMAC-SHA256 per panggilan (TTL 120 dtk, nonce sekali pakai di tabel `mcp_nonces`; dapat juga dibawa di `params.arguments` untuk klien dengan header statis). Aktor default opsional per token untuk CLI/dev.
- User: `airaEnabled`, `airaTier` (`read`/`standard`/`direct`), `airaJabatan`. `tools/list` per aktor = RBAC role ∩ level AIRA.
- Tier: read langsung; write langsung bila `draftCapable`; write non-draft + semua critical diantrikan sebagai `ApprovalRequest` `ai_tool:<nama>` dan dijalankan sebagai **pengaju asli** saat disetujui di *Persetujuan* (ditolak = tak ada efek). Level `direct` = langsung (tetap RBAC + gate normal). Chat grup (`gf=true`) menurunkan `direct`→`standard`.
- Eksekusi lewat handler Express asli (JWT internal 120 dtk, `audit_trail.via/via_meta` = `mcp` + token + channel + tool + approvalId), substitusi `:id` path, batas hasil 60.000 karakter + petunjuk paginasi, galat Indonesia sebagai `isError`, `idempotencyKey`, rate limit per token, body 256 KB, kill switch 503.
- Admin REST `/api/ai/mcp/*` (status, token CRUD/revoke/rotate-secret, riwayat panggilan) dan UI **Pengaturan → AIRA (MCP)** (status + kill switch, info endpoint MCP + header + health check siap-salin, token tampil sekali, riwayat) + **Akses AIRA / level / Jabatan** di Manajemen Pengguna; *Persetujuan* menampilkan "Permintaan AIRA".
- Tabel `mcp_tokens`, `mcp_call_logs`, `mcp_nonces`; kolom `users.aira_*`, `audit_trail.via/via_meta`; migrasi loose idempoten `2026101200000_aira_mcp.sql`.
- Dokumen: `docs/ai-tools/ARSITEKTUR-MCP.md` (spesifikasi), `docs/ai-tools/PANDUAN-KLIEN-MCP.md` (panduan klien MCP engine-neutral: koneksi, spesifikasi actor assertion, implementasi referensi Python/Node, curl, troubleshooting).

**Dihapus (dipensiunkan)**: `/api/ai/router`, verifikasi A3 HMAC (`airaApproval.ts`), jalur Admin `x-aira-service-token`, `AiSetting.serviceToken`, route whitelist/channels/whitelistModules/`tool-router` sync, serta UI channel/whitelist/tabel tool/Test Tool/health aira-core. Panel chat `/api/ai/chat/*` tetap (menampilkan *offline* sampai tahap 3).

**Deploy**: jalankan migrasi (`prisma migrate deploy` + file `.sql` lepas; entrypoint menjalankan keduanya), set env opsional **`MCP_SECRET_KEY`** (≥32 karakter acak; kosong = turunan `JWT_SECRET`), `AIRA_SERVICE_SECRET` tidak lagi wajib (dihapus dari `docker-compose.yml`; `AIRA_API_TOKEN` kini opsional). Buat token di Pengaturan → AIRA (MCP), beri Akses AIRA ke pengguna, lalu ikuti `docs/ai-tools/PANDUAN-KLIEN-MCP.md`.

### Katalog tool AIRA/MCP lengkap & terdokumentasi (Stage 0)
**Ditambah**:
- Inventori route statis (`npm run ai-tools:inventory`): memetakan 539 endpoint beserta guard mount-nya tanpa menjalankan server/DB; denylist endpoint yang tidak boleh menjadi tool (`server/src/ai/catalog/denylist.ts`); ekstraksi parameter dari skema Zod.
- Dokumentasi katalog dibangkitkan di `docs/ai-tools/` (README, INDEX, 13 file toolset dengan ALUR BISNIS, DENYLIST, GLOSARIUM, AUDIT, `catalog.json`, ARSITEKTUR-MCP) lewat `npm run ai-tools:docs`; panduan tulisan tangan di `docs/ai-tools/_guides/`.
- Drift guard: test vitest `aiToolsCatalog` + `npm run ai-tools:check` (dijalankan CI): handler registry harus cocok route nyata, route non-denylist wajib punya tool, write/critical wajib `confirm_template`/`postingEffect`, docs harus mutakhir.
- Field registry baru (opsional, kompatibel mundur): `toolset`, `draftCapable`, `postingEffect`, `safeNonGet`, `params`, `outputSummary`, `accessNote`, `prerequisites`, `errors`, `related`.

**Diubah**:
- Registry diperbarui: 386 -> 462 tool (136 ditambah untuk endpoint baru, 60 dihapus: 58 masuk denylist + 2 duplikat), 40 risk dikoreksi (aksi yang memposting GL/stok kini `critical`), deskripsi/parameter/roles diturunkan dari kode, semua tetap `enabled:false`. Nama `prod_run_create` -> `prod_draft_create`, `get_aging_receivable` -> `rpt_aging`.
- `risk=read` kini boleh handler non-GET bila `safeNonGet=true` (preview/search murni baca).
- Salinan `docs/erd-ai-layer/config/aira-tool-router.json` dihapus (sumber tunggal di server); validator dan skema JSON diperbarui.

### Fitur: input produksi disimpan sebagai draft dulu
**Berubah**:
- Input Data Produksi tidak lagi langsung diposting. `POST /api/inventory/production-runs` kini selalu menyimpan **draft** (`DPR-YYYYMM-NNNN`, tabel baru `production_run_drafts`) tanpa efek ke stok, jurnal, HPP/WAC, COGS, laporan, dasbor, maupun OEE; saat simpan hanya muncul peringatan stok (tidak memblokir).
- Posting adalah aksi terpisah (`POST /production-runs/drafts/:id/post`): role Admin/bypass langsung membentuk proses produksi; role lain mengirim pengajuan persetujuan (draft `Menunggu persetujuan`). Disetujui → proses produksi dibuat, draft `Diposting`; ditolak/perlu revisi → draft kembali `Draft` dengan catatan. Klaim atomik mencegah dobel-posting.
- Endpoint draft: `GET/PUT/DELETE /production-runs/drafts[/:id]` (hapus = soft, hanya status Draft; ubah/hapus/posting oleh pembuat atau pemegang `approval.bypass`).
- UI: tombol utama modal menjadi **Simpan Draft**; tampilan baru **Draft** di Proses Produksi (lencana jumlah, status, Edit/Posting/Hapus dengan konfirmasi, alert `lastError`).
- Migrasi loose idempoten `2026101100000_production_run_drafts.sql`. Pengajuan `ProductionRun` lama tetap bisa disetujui seperti biasa.

### Perbaikan: biaya rata-rata tertimbang saat edit/batal
**Diperbaiki**:
- Edit/batal produksi, batal STT, dan edit pergerakan stok menghitung ulang biaya rata-rata dengan merata-ratakan semua pergerakan masuk sekaligus — mengabaikan saldo berjalan, urutan, dan pergerakan keluar — sehingga nilai bisa melonjak (mis. 2.330 → 11.500) bila ada penyesuaian stok awal berharga lain. Kini dihitung dengan **memutar ulang pergerakan aktif secara kronologis** (createdAt, lalu id) memakai aturan yang sama dengan jalur langsung; `utils/weightedAverageReplay.ts`, dipakai oleh `services/averageCostRecompute.ts`. Jurnal/HPP yang sudah diposting tidak disentuh.
- Membatalkan pergerakan stok manual kini juga menghitung ulang biaya rata-rata (sebelumnya tidak).
- Bila stok barang tidak sepenuhnya dijelaskan oleh pergerakan, penghitungan ulang dilewati (biaya tersimpan dipertahankan) dan peringatan dicatat, bukan menebak.
- Generator data dummy: pembelian GKP kini memperbarui biaya rata-rata.

### Approval gate: edit produksi & revisi harga PI
**Keamanan**: dua mutasi finansial yang sebelumnya lolos gate kini ikut antrian persetujuan untuk role tanpa capability `approval.bypass` — `PUT /api/inventory/production-runs/:id` (edit data produksi) dan `POST /api/purchase/invoices/:id/revise-price` (revisi harga invoice pembelian). Keduanya tidak dieksekusi; dibalas `202 {pendingApproval}` dan dokumen baru berubah setelah Admin menyetujui. Role ber-bypass (Admin) tetap langsung (respons tidak berubah).

**Diubah**:
- Tipe baru `ProductionRunEdit` ("Edit Data Produksi") dan `PurchaseInvoiceRevisePrice` ("Revisi Harga Invoice Pembelian"). Nomor dokumen target terisi sejak pengajuan; payload = body asli + snapshot kondisi saat ini (`_before`).
- Ditolak 400/404 bila target tidak bisa diedit/direvisi (dibatalkan, Draft, baris asing); pengajuan kedua untuk target yang masih Pending ditolak 409. Saat approve, kondisi divalidasi ulang oleh service yang sama; bila gagal, pengajuan tetap Pending dengan pesan galat.
- Layar persetujuan menampilkan tabel sebelum/sesudah (baris berubah diberi label "Berubah", bukan hanya warna); badge/notice "Menunggu persetujuan" dan tombol Edit/Revisi Harga nonaktif selama ada pengajuan Pending (`GET /api/approvals/pending`). "Minta Edit" disembunyikan untuk tipe ini.

### Pensiun ga_finance
**Dihapus**: alias `/api/ga/finance` dan modul RBAC `ga_finance` (akses Tagihan EAM kini hanya lewat `payment_request` edit). Migrasi `2026101000000_remove_ga_finance_module.sql` (idempotent, penanda `data_fix_markers`) lebih dulu memberi `payment_request` edit ke role ber-`ga_finance` edit bila belum, lalu menghapus baris `ga_finance` dari `role_permissions`. Klien tetap mengalihkan `/ga/finance` ke Tagihan EAM.

### Dasbor: area kosong terisi + pemeliharaan
**Ditambah**:
- **Pemeliharaan** di Dasbor: tile KPI (terlambat + jatuh tempo minggu ini), baris di "Perlu perhatian" dengan tautan, dan widget "Pemeliharaan Mendatang" (8 item). Sumber: jadwal preventif, work order melewati target, pajak/KIR/asuransi kendaraan, dan dokumen kedaluwarsa (jendela 30 hari) — memakai definisi yang sama dengan halaman GA. Endpoint `GET /api/dashboard/maintenance`, diperiksa per sumber (`ga_maintenance`, `ga_vehicle`, `ga_documents`).
- Widget baru "Segera Jatuh Tempo" (faktur jatuh tempo 14 hari; `/dashboard/upcoming-due`).

**Diperbaiki**:
- Staf Produksi mendapat 403 pada Stok Kritis/Stok Negatif (kini cukup izin `inventory` atau `reports`); widget HPP disembunyikan tanpa izin jurnal.
- "Stok Menipis" menampilkan "–" (klien membaca field yang salah).
- Grafik pendapatan satu titik kini menampilkan 6 bulan terakhir; Profitabilitas per SKU kembali ke 12 bulan terakhir dengan label "Data terakhir"; kartu kosong menjadi satu baris ringkas; grid dasbor tidak lagi meninggalkan celah saat widget disembunyikan.
- Bar tab seksi dasbor (Overview/Keuangan/…) tidak lagi berbentuk oval; memakai komponen tab bersama (sudut kecil, garis bawah aktif, navigasi panah, panel tab semantik).

### Perbaikan PDF (pemeriksaan visual)
**Diperbaiki**:
- **Laba Rugi / Neraca / Arus Kas PDF menghilangkan tanda minus** — kerugian tampil sebagai laba positif ("LABA BERSIH" Rp 16,65 jt padahal rugi). Kini negatif tampil `-Rp …`. Neraca Saldo juga tidak lagi menampilkan "—" untuk angka negatif.
- Header tabel kini berulang di halaman berikutnya (Neraca Saldo, Aging); kolom Aging tidak lagi bertumpuk; judul seksi tidak lagi tertinggal sendirian di dasar halaman; baris "Seimbang" tidak lagi sendirian di halaman baru.
- Simbol yang tidak dapat dirender (`−` U+2212, `→`, `✓`, `⚠`) diganti: diskon di Penawaran/Faktur/Opname kembali bertanda minus, panah Transfer Gudang digambar sebagai SVG.
- Laporan Kendaraan: nama aset ditambahkan, nilai enum (mis. `PAJAK_TAHUNAN`, `GOOD`, `DEPAN_KIRI`) tampil dalam bahasa Indonesia, teks tidak lagi bertabrakan dengan kolom sebelah. Detail Inspeksi: sel identitas tidak lagi bertabrakan.
- Periode laporan ditulis ringkas ("01 Jan 2026 s/d 31 Okt 2026").

### Tampilan (UI/UX) — Fase 6: pembersihan akhir
**Diubah**:
- **Code-splitting:** semua halaman dimuat saat dibutuhkan; chunk utama 4,88 MB → 239 KB. Pada jaringan Fast 3G dengan CPU 4×, `/login` memuat 8,98 s → 2,51 s dan `/` 8,97 s → 3,02 s. Library berat (PDF, grafik) dipisah menjadi chunk vendor. Ada layar pemulihan "Muat ulang" bila chunk gagal dimuat (mis. setelah pembaruan versi), dan pramuat saat kursor/fokus di menu.
- **Picker lama dihapus** (`SearchableSelect`, `Select`, `WarehousePicker`, `BatchPicker`, `RupiahInput`) — diganti ComboboxFilter/Select/RupiahField di 21 berkas; tiga modal Aset Umum kini memakai Dialog; area unggah lampiran kini tombol sungguhan yang bisa dipakai dengan keyboard; tab dasbor Pelanggan dibangun ulang dengan token.
- **CSS lama dihapus:** `index.css` 927 → 464 baris, `App.css` dihapus; tidak ada lagi kelas warna mentah (`bg-white`, `text-gray-*`, …) di `.tsx`.
- **Gerbang lint:** pelanggaran lama dicatat di `client/eslint-suppressions.json`; pelanggaran baru membuat `npm run lint` gagal (`npm run lint:prune` untuk merapikan). **CI GitHub Actions** (`.github/workflows/ci.yml`) menjalankan lint, tsc, tes, dan build untuk client serta tsc + vitest untuk server pada setiap PR.
- Tes `weightedAverage` diperbaiki: tesnya yang salah (fungsi sesuai dokumentasi mengembalikan biaya satuan masuk saat stok 0); tidak ada perubahan kode keuangan.

### Tampilan (UI/UX) — Fase 5: laporan, dasbor, PDF
**Diubah**:
- **Kit laporan** (`components/report-kit/`): kerangka seragam (filter periode dengan preset + rentang kustom di URL, kartu ringkasan, tabel laporan keuangan dengan subtotal, angka negatif dalam kurung, status loading/kosong/error, menu ekspor). Dipakai 17 laporan: Neraca Saldo, Laba Rugi, Neraca, Arus Kas, Buku Besar, Pajak, Aging, Jadwal Hutang/Piutang, Harian, OEE, HPP, Biaya Produksi, Profitabilitas per SKU, PO Outstanding, Kinerja Pemasok. Grafik punya alternatif teks (tabel data). Angka tidak berubah (dibandingkan dengan API).
- **Semua Laporan**: katalog per kelompok (Keuangan, Penjualan & Piutang, Pembelian & Hutang, Produksi & Persediaan), ramah izin dan keyboard.
- **Dasbor** didesain ulang: strip KPI, tren dengan teks alternatif, daftar "Perlu perhatian", widget sesuai peran, skeleton/empty/error, tata letak 390px.
- **15 template PDF** diseragamkan (kop perusahaan, header tabel berulang tiap halaman, blok total, tanda tangan, footer "Halaman X dari Y" + waktu cetak), warna navy Entaris dengan isian ringan; format angka/tanggal lewat `lib/format`; status faktur kini berbahasa Indonesia.
- Retur penjualan pada Laba Rugi tampil negatif dalam kurung, mis. `(Rp 461.500)`.

### Tampilan (UI/UX) — Fase 4: formulir & modal
**Diubah**:
- ±55 modal dan drawer lama (Faktur, Pesanan, Penawaran, Surat Jalan, Retur, Inquiry, Garansi Proyek, uang muka, PO, STT, Faktur Pembelian, Pembayaran, Transfer, Rekonsiliasi, Biaya, Run Produksi, Persetujuan, Gerakan/Transfer Stok, Barang, Jurnal, Transaksi Berulang, Pelanggan/Vendor, Impor, dan dialog dasbor/GA) dipindah ke komponen bersama: Dialog untuk formulir, Sheet untuk detail, Field berlabel, dan ConfirmDialog menggantikan `window.confirm`. Fokus terjaga, Esc menutup, muat di layar 390px, tema terang/gelap. Logika bisnis, payload, dan perhitungan tidak berubah.
- Berkas besar dipecah: SalesInvoiceModal 1052→733, InvoiceDetailDrawer 1392→699, PurchaseInvoiceModal 893→604, ProductionRunModal 1775→(dipecah ke `components/production/`).
- Label status pada drawer Penjualan mengikuti registri: Pesanan "Dikonfirmasi", Surat Jalan "Diposting", Faktur "Belum Lunas".
- Kontras warna toast (sonner) diperbaiki agar lolos axe di tema terang dan gelap.
- Komponen ConfirmDialog lama kini adaptor tipis atas ConfirmDialog bersama.

### Pengajuan Pembayaran (baru)
**Ditambah**:
- **Pengajuan Pembayaran** (`/payment-requests`) menggantikan file Excel pribadi + email: reimbursement, pembayaran vendor, uang muka, perjalanan dinas, jamuan, dan jenis lain (master data di Pengaturan → Jenis Pengajuan). Alur: pemohon → atasan langsung → Keuangan → Direktur (bila nominal mencapai aturan persetujuan "Pengajuan Pembayaran (tahap Direktur)") → bayar. Semua pengguna bisa mengajukan dan hanya melihat pengajuannya sendiri; tidak ada yang bisa menyetujui pengajuannya sendiri. Lampiran nota, timeline riwayat, notifikasi per tahap.
- Pembayaran memposting jurnal seimbang: DR akun beban per baris / CR kas-bank; uang muka & perjalanan dinas DR **1.5.6 Uang Muka Karyawan** (akun sistem baru `EMPLOYEE_ADVANCE`). Periode terkunci ditolak; batal bayar membatalkan jurnal.
- Field "Atasan langsung" di Manajemen Pengguna; modul RBAC `payment_request` (Akuntan: edit).

### Pengajuan Pembayaran — tahap 2 (pertanggungjawaban & perjalanan dinas)
**Ditambah**:
- **Pertanggungjawaban uang muka / perjalanan dinas** (`/payment-requests/:id/settlement`): setelah dibayar, pengaju mengisi rincian realisasi (uraian, tanggal, nominal, kategori, bukti nota) → atasan menyetujui → Keuangan memverifikasi akun biaya dan memposting. Alur `OPEN → SUBMITTED → PENDING_FINANCE → SETTLED` (+ `REVISION` bila dikembalikan), riwayat, notifikasi, dan tidak ada yang menyetujui pertanggungjawabannya sendiri.
- Posting satu jurnal seimbang dengan pratinjau DR/CR sebelum konfirmasi: realisasi < uang muka (sisa dikembalikan ke kas/bank), = (tanpa baris kas), atau > (kurang bayar dibayar dari kas/bank). Periode terkunci ditolak; batal posting mem-void jurnal dan kembali ke Verifikasi Keuangan. Batal bayar uang muka tetap ditolak selama pertanggungjawaban berjalan atau sudah selesai.
- Tab **Belum Dipertanggungjawabkan** (umur dalam hari, sorotan > 14 hari, kartu total & per karyawan, ekspor Excel "Uang Muka Karyawan"), peringatan non-blokir saat membuat pengajuan baru bila masih ada uang muka lewat batas, dan pengingat harian ke pengaju.
- **Form Perjalanan Dinas**: kota/tujuan, tanggal berangkat & kembali (durasi otomatis), peserta, rincian per kategori (Transportasi, Penginapan, Uang Saku/Harian, Konsumsi, Lain-lain) dengan tombol tambah cepat dan bantuan tarif × hari; ringkasan perjalanan di detail; form pertanggungjawaban terisi dari rencana dengan pembanding rencana vs realisasi.
- Kolom **Atasan** di Manajemen Pengguna; kolom catatan di dialog Setujui.

**Diubah**:
- Pembayaran jenis uang muka/perjalanan dinas hanya membuka pertanggungjawaban bila `requiresSettlement` aktif (akun posting tetap mengikuti jenis).
- Halaman laporan/GA yang jarang dipakai dimuat lazy agar chunk utama tetap di bawah batas precache PWA.

**Deploy**: migrasi loose SQL `2026100800000_payment_request_settlement_travel.sql` (aditif, idempotent; jalan otomatis saat start) — hanya menambah kolom/tabel nullable.

### Pengajuan Pembayaran — tahap 3 (Tagihan EAM)
**Ditambah**:
- Tab **Tagihan EAM** di Pengajuan Pembayaran (hanya Keuangan, izin `payment_request` edit; badge = tagihan belum diposting): antrian pajak/STNK/KIR, servis kendaraan, dan MR sparepart dari EAM dengan jenis, aset/tujuan, tanggal, nilai, status, pencarian, filter tanggal/jenis/status posting, paging dari server, dan KPI. Bayar/posting lewat dialog yang sama (Jurnal Langsung DR beban / CR kas-bank, atau Faktur Pembelian DR beban / CR 2.1.1) dengan pratinjau jurnal; batal posting mengembalikan tagihan ke antrian.
- API `GET /api/payment-requests/eam` (+ `/summary`), `POST /api/payment-requests/eam/:kind/:id/pay|cancel` dengan validasi, guard periode fiskal, dan aturan posting yang sama seperti sebelumnya (satu sumber kebenaran: `gaFinance`). Snapshot audit untuk prefiks baru.

**Diubah**:
- Menu AKUNTANSI "Tagihan Aset & Umum" dihapus; `/ga/finance` dialihkan ke `/payment-requests?tab=eam`. Pencarian global ("tagihan eam", "tagihan aset", "stnk") menuju Pengajuan Pembayaran.
- API lama `/api/ga/finance` tetap berjalan sebagai alias **deprecated** selama satu rilis (dihapus di rilis berikutnya).
- Modul RBAC `ga_finance` ditandai "(lama)" dan hanya melindungi alias lama; akses kini lewat `payment_request`. Migrasi satu kali memberi `payment_request` edit ke role yang punya `ga_finance` edit (baris `payment_request` yang sudah ada tidak ditimpa).

**Dihapus**: halaman `GaFinancePage` dan kode klien lamanya (filter/urut/paging sisi klien).

**Deploy**: migrasi loose SQL `2026100900000_payment_request_eam_perm.sql` (idempotent; backfill izin hanya sekali lewat tabel penanda `data_fix_markers`; tidak ada perubahan skema Prisma). Setelah rilis berikutnya `/api/ga/finance` dan modul `ga_finance` dapat dicabut.

### Deploy & Operasional
**Diubah**:
- Image Docker (`Dockerfile`, `Dockerfile.allinone`) kini menyetel zona waktu proses server `TZ=Asia/Jakarta` (paket `tzdata` dipasang); `docker-compose.yml` meneruskan `TZ` (default `Asia/Jakarta`, dapat diubah di `.env`). Batas periode laporan (awal/akhir hari & bulan) pada deployment Docker kini sesuai WIB, bukan UTC.

### Akuntansi
**Diperbaiki**:
- Neraca Saldo kini menyertakan akun grup yang memiliki posting langsung (mis. HPP lama yang diposting ke grup `5`), sehingga total debit/kredit tetap seimbang.

**Diubah**:
- Instalasi baru: COA bawaan menambah akun detail `5.1 Harga Pokok Penjualan` dan peran akun sistem COGS dipetakan ke `5.1` (hanya bila COGS belum dipetakan; tenant lama tidak berubah).

### Arsitektur
**Diubah**:
- EAM kini menjadi modul di aplikasi utama; aplikasi/subdomain EAM terpisah (`client-eam/`, service Docker `client-eam`) dihapus. `COOKIE_DOMAIN` tetap didukung tetapi opsional — hanya perlu bila sesi dibagi lintas subdomain.

**Ditambahkan** (dipindahkan dari aplikasi EAM lama):
- Halaman **Ringkasan Aset & Pemeliharaan** (`/ga`): aset tetap, nilai buku, perintah kerja aktif/terlambat, akses cepat.
- **Foto aset** di form tambah/edit aset (unggah, pratinjau, hapus).
- Tab **Pengajuan** di Pemeliharaan: pengajuan servis & pajak/KIR kendaraan dengan setujui/tolak. Dropdown kendaraan kini memakai daftar aset yang benar (di EAM lama endpoint-nya tidak ada sehingga pengajuan tak bisa dibuat).
- Logo perusahaan di header PDF laporan kendaraan, inspeksi, stok opname, stok gudang, laporan harian, dan laporan umum.
- Notifikasi modul aset (WO, permintaan barang, kalibrasi, dokumen, sewa) mengarah ke halaman yang tepat.

**Diperbaiki**:
- Data aset tidak lagi tampak hilang saat berpindah antar halaman Kendaraan/Gedung/Peralatan (bentrok cache query).
- Foto unggahan tampil di mode pengembangan (proxy `/uploads`).

### Akun demo
**Diubah**:
- Akun bawaan (seed) memakai domain `@entaris.demo`: `admin@entaris.demo`, `staff@entaris.demo`, `produksi@entaris.demo`, `viewer@entaris.demo` (sebelumnya `@entaris.local`). Seed mencari pengguna lewat username, jadi akun yang sudah ada ikut diperbarui tanpa duplikat.

### Diperbaiki
- Form Faktur Pembelian: mencentang STT bisa menambahkan barisnya dua kali.
- **Halaman Kendaraan, Gedung & Sewa, Peralatan & Kalibrasi kosong di instalasi selain klien pertama**: halaman memakai ID kategori yang ditulis mati dari database satu klien. Server kini mencari kategori lewat jenis (`categoryKind`); ID lama tetap dipakai bila ada. Instalasi baru juga mendapat kategori aset bawaan (Kendaraan, Bangunan, Gudang, Peralatan, dll.) — dibuat hanya bila kodenya belum ada.
- Form Kendaraan: target ganti oli kini mengikuti odometer +5.000 km (sebelumnya membeku di digit pertama yang diketik).
- Saldo awal di Bagan Akun: mengetik `1.000.000` terbaca 1 (titik dianggap desimal). Kini mengikuti format Indonesia (titik = ribuan, koma = desimal).
- **Instalasi baru: stok opname dengan selisih dan biaya konversi produksi gagal (500).** Seed memetakan peran `INVENTORY_VARIANCE → 6.38` dan `PRODUCTION_CONVERSION → 6.39`, tetapi kedua akun itu tidak ada di COA bawaan sehingga pemetaannya dilewati. Seed kini membuat `6.38 Selisih Persediaan` dan `6.39 Biaya Konversi Produksi` — hanya bila nomornya belum dipakai (akun tenant yang sudah ada tidak diganti namanya).
- Transaksi Kas & Bank: uang muka pelanggan & refund vendor tampil sebagai uang keluar (kini masuk); daftar terpotong di 50 pembayaran + 100 jurnal; label jurnal Pinbuk tampil sebagai "Beban"; jumlah lampiran jurnal tidak pernah tampil; batalkan uang muka pelanggan dari halaman ini selalu ditolak (kini diarahkan ke halaman uang muka).
- **Instalasi baru tidak bisa membuat STT/BPB** (error 500): akun sistem "Hutang Pembelian Belum Ditagih" dan "Selisih Harga Pembelian" tidak dipetakan oleh seed. Seed kini menambah akun `5.11 Selisih Harga Pembelian` dan memetakan kedua peran (2.2.3 dan 5.11) — **hanya bila peran itu belum punya pemetaan**, sehingga tenant lama tidak berubah.
- Migrasi pembersih token AIRA di audit log menyebut tabel yang salah (`audit_logs`, seharusnya `audit_trail`) sehingga selalu gagal tanpa suara; kini benar.
- Modal refund/offset uang muka (pelanggan & vendor) menampilkan saldo hutang/piutang Rp 0 sehingga offset tidak bisa dilakukan — endpoint `GET /api/parties/:id` yang dipanggil modal kini tersedia.
- **Filter tanggal di halaman daftar Penjualan meleset satu hari.** Batas hari dihitung dalam UTC, padahal tanggal dokumen adalah hari kalender WIB — dokumen bertanggal X tidak muncul saat difilter "tanggal X" (dan dokumen X+1 bisa ikut). Kini filter memakai hari kalender zona waktu bisnis (default WIB; atur `APP_UTC_OFFSET` untuk WITA/WIT).

### Tampilan (UI/UX)
**Diubah**:
- **Data Induk & Sistem (Fase 3 selesai).** Pelanggan & Vendor: tab Semua/Pelanggan/Vendor di URL, ringkasan piutang/hutang/uang muka, tautan ke faktur terkait, ekspor semua baris terfilter (dasbor lama di tab "Analisis"). Notifikasi: semua notifikasi berhalaman (sebelumnya 50 terakhir), filter dibaca/jenis/cari. Pengaturan: navigasi per kelompok (Perusahaan, Pengguna & Akses, Sistem) dengan bagian di URL, bilah Simpan dengan status perubahan, validasi inline, matriks hak akses yang aksesibel (centang per grup/modul), konfirmasi untuk tindakan berisiko. Manajemen Pengguna: ringkasan, filter peran/status, label peran Indonesia, konfirmasi aktif/nonaktif & reset kata sandi. Jejak Audit: berhalaman server, panel detail (`?log=`) dengan perbedaan per kolom, ekspor semua baris terfilter. Pemeriksaan Sistem: status OK/Peringatan/Gagal dan pratinjau sebelum "Perbaiki".

- **PO Tahap 3:** **pencocokan 3 arah PO ↔ STT ↔ Faktur Pembelian** — per baris Sesuai / Selisih qty / Selisih harga (toleransi qty 0%, harga 2%) di form faktur, detail faktur, dan ringkasan persetujuan; menyimpan dengan selisih meminta konfirmasi (tidak memblokir). **Pengingat PO terlambat** (notifikasi `po_overdue` yang membuka detail PO) dan penanda/filter "Terlambat" di daftar PO. Laporan baru **PO Outstanding** (sisa qty & nilai per PO/item) dan **Kinerja Pemasok** (ketepatan kirim, lead time, fill rate, selisih harga faktur vs PO), dengan ekspor Excel.

- **PO Tahap 2:** PO bisa disimpan sebagai **Draf** lalu **Ajukan**; bila ada aturan persetujuan PO yang cocok (nilai ≥ batas), PO menunggu persetujuan di menu Persetujuan — disetujui → "Dipesan", ditolak → kembali Draf dengan alasan. Tanpa aturan yang cocok, PO langsung "Dipesan". **Harga lengkap** (diskon % & PPN % per item, biaya lain/ongkir, subtotal–diskon–PPN–grand total, perhitungan sama dengan Faktur Pembelian), **termin pembayaran** + jatuh tempo, **gudang tujuan** (otomatis terisi saat Buat STT dari PO), **nomor penawaran pemasok**; PDF PO ikut menampilkan semuanya. Mengedit PO yang sudah Dipesan tidak boleh menaikkan nilai melewati batas persetujuan. PO lama tetap berlaku sebagai "Dipesan".

- **Pesanan Pembelian (PO) dilengkapi:** status penerimaan Belum Diterima / Diterima Sebagian / Diterima Penuh / Ditutup di daftar (+ filter) dan progres per item di detail; tombol **Buat STT dari PO** (STT terisi sisa qty & tertaut ke baris PO); **Tutup PO** dengan alasan untuk sisa qty yang tidak akan dikirim (PO tertutup tidak muncul lagi di pilihan STT dan ditolak server); **Edit** selama belum ada STT/faktur, **Duplikat**; **Cetak / PDF PO** dengan logo, pemasok, item, total, syarat, dan kolom tanda tangan.

- **Halaman Aset & Pemeliharaan (GA/EAM)**. Kendaraan menjadi modul armada: daftar armada dari server dengan status kepatuhan pajak/STNK/KIR/asuransi (ikon + teks), detail per kendaraan dengan tab Ringkasan, Servis, Pajak & STNK, Asuransi, BBM, Ban & Oli, Inspeksi, Insiden, Dokumen, Laporan; Laporan Armada dengan periode di URL & grafik. Pemeliharaan: tab Work Order / Jadwal Preventif / Pengajuan di URL, filter prioritas/status/jatuh tempo/"WO Saya", detail WO di panel samping. Permintaan Barang, Inventaris Kantor, Dokumen & Sertifikat (status kedaluwarsa), Daftar Aset (foto, QR, detail), Gedung & Sewa, Peralatan & Kalibrasi, Data Induk Aset memakai pola daftar & data induk yang sama.

- **Dasbor persediaan & produksi didesain ulang** (pola ERP manufaktur): KPI dihitung server untuk semua barang aktif (sebelumnya dari 100 barang pertama), panel "Perlu tindakan" (stok habis/menipis), grafik nilai stok per kategori/gudang, gerakan terbaru, periode di URL. Dasbor produksi: KPI periode (yield tertimbang, biaya konversi, HPP rata-rata), tren yield, persetujuan menunggu, produk teratas. Standar Biaya, Master Proses, Mesin: tabel data induk dengan cari, status Aktif/Nonaktif, form di panel samping. Batas minimum stok di dasbor kini per barang (sebelumnya 20.000 kg untuk semua).

- **Halaman Akuntansi.** Bagan Akun kini tabel pohon yang bisa dinavigasi keyboard (cari dengan induk tetap tampil, filter jenis, buka/tutup semua, subtotal grup, saldo negatif dalam kurung, badge "Sistem"); akun sistem & grup yang masih punya sub-akun tidak bisa dihapus dari UI. Jurnal Umum per halaman dari server dengan filter akun/status/periode; jurnal otomatis dari modul lain menampilkan "Batalkan dari modul asal". Persetujuan: tab di URL, tab Aturan hanya untuk yang berwenang, tolak/minta revisi wajib alasan. Aset Tetap: tab Daftar Aset / Posting Penyusutan, panel detail aset dengan jadwal penyusutan, posting penyusutan dengan konfirmasi. Tagihan Aset & Umum: filter status posting, jenis, tanggal.

- **Halaman Persediaan & Produksi** (Stok & Produksi, Stok per Gudang, Stok Opname, Transfer Stok, Daftar Gudang) memakai pola daftar baru. Stok & Produksi: tab Barang / Gerakan Stok / Proses Produksi / Item Jasa tersimpan di URL, data per halaman dari server, kartu ringkasan sesuai filter, panel detail gerakan stok, aksi "Riwayat gerakan" per barang, ekspor Excel semua baris terfilter. Stok per Gudang mengikuti tanggal "per" yang dipilih (sebelumnya selalu stok saat ini) dan menandai stok negatif dengan ikon & label. Detail opname/transfer punya URL sendiri.

- **Halaman Kas & Bank** (Transaksi Kas & Bank, Rekonsiliasi Bank, Transaksi Berulang, Uang Jaminan Proyek) memakai pola daftar baru. Transaksi Kas & Bank menggabungkan pembayaran & jurnal kas per halaman dari server dengan ringkasan Kas Masuk/Keluar/Arus Bersih, filter tipe/arah/pihak/akun, dan ekspor Excel. Ruang kerja rekonsiliasi punya URL sendiri (`?recon=`). Uang Jaminan Proyek menandai "Lewat / Segera jatuh tempo" dan menampilkan riwayat settlement di panel detail.
- "Jalankan sekarang" di Transaksi Berulang kini meminta konfirmasi (jurnal langsung terposting dan jadwal berikutnya dihitung ulang dari hari ini).

- **Halaman daftar Pembelian** (Pesanan Pembelian, Penerimaan Barang, Faktur Pembelian, Uang Muka Vendor): data dimuat per halaman dari server, filter & urutan di URL, kartu ringkasan sesuai filter, status Indonesia ("Belum/Sudah Ditagih", "Titipan" untuk STT). Faktur Pembelian: tab Daftar / Persetujuan; "Edit lengkap" di menu baris. Tombol "Bayar Hutang" kini butuh izin edit pembayaran.

- **Halaman daftar Penjualan** (Pertanyaan Pelanggan, Penawaran, Pesanan Penjualan, Surat Jalan, Faktur Penjualan, Retur Penjualan, Uang Muka Pelanggan): data dimuat per halaman dari server — tidak lagi terpotong diam-diam di 200/500 baris. Filter (cari, status, pelanggan, tanggal) & urutan tersimpan di URL; kartu ringkasan dihitung server sesuai filter; status berbahasa Indonesia; angka rata kanan; baris bisa dibuka dengan keyboard; tampilan mobile ringkas.
- Surat Jalan: satu halaman dengan tab "Surat Jalan Resmi" / "Surat Jalan Sementara"; status DO "Sudah/Belum Diinvoice" dan aksi "Buat faktur".
- Total nilai penawaran tidak lagi menghitung penawaran yang dibatalkan (konsisten dengan faktur).
- Tombol buat/aksi tulis disembunyikan untuk pengguna tanpa izin edit (server sudah menolak sebelumnya).

- **Halaman login baru**: panel brand navy yang tenang + form ringkas. Animasi, statistik dekoratif, kredit pribadi, versi build, dan tombol bergradien dihapus. Validasi di bawah field, banner salah kata sandi, hitung mundur saat terlalu banyak percobaan, peringatan Caps Lock, dialog "Lupa kata sandi?", dan mode gelap.
- **Warna mengikuti brand Entaris** (biru #2F6FC4, navy #1B2B48) untuk mode terang & gelap; semua pasangan teks/latar lolos kontras WCAG AA.
- **Tema**: pilihan disederhanakan menjadi Terang / Gelap / Sistem (default mengikuti sistem). Tema lama otomatis dialihkan ke Sistem.
- Halaman publik `/welcome`, `/tanya`, dan `/aset/:kode` memakai logo & warna resmi.
- Zoom (pinch) di perangkat mobile diaktifkan kembali.

- **Navigasi baru**: sidebar 9 seksi berbahasa Indonesia (mis. "Faktur Penjualan", "Pesanan Pembelian (PO)"), satu menu aktif, bisa diciutkan (rail), drawer di mobile. URL tidak berubah. Breadcrumb mengikuti halaman (tidak lagi "Finance / …").
- **Header baru**: pencarian ⌘K, tombol "Tanya AIRA", notifikasi, dan menu akun (ganti kata sandi, tema, pintasan, Tentang Entaris, keluar). Versi & kredit pembuat pindah ke "Tentang Entaris".
- Palet perintah ⌘K bisa membuka halaman dan meneruskan pertanyaan ke AIRA; bantuan pintasan keyboard diperbarui.
- **Onboarding** disimpan di server dan hanya tampil untuk admin; tenant lama otomatis dianggap selesai; kartu "Lengkapi penyiapan" di dasbor.
- Chat AIRA & kartu persetujuan memakai warna brand dan mendukung mode gelap; "Tolak" kini meminta konfirmasi.
- Notifikasi toast mengikuti mode gelap.

**Ditambahkan**:
- Komponen dasar bersama: Field, PageHeader, StatusBadge, ConfirmDialog, BrandMark/Wordmark; format angka/tanggal & label status Bahasa Indonesia terpusat.
- Infrastruktur uji UI: Vitest, Playwright (screenshot semua halaman) + axe (aksesibilitas).

### Merek
**Diubah**:
- **Logo AIRA baru "Lipat Δ"**: saudara ∇ Entaris (Δ = agen yang bertindak; bilah biru = agen, navy = manusia yang menyetujui, crossbar = Tool Layer). Ikon AIRA di aplikasi kini SVG tajam yang otomatis berganti ke varian negatif di mode gelap; aset lengkap (SVG/PNG, favicon, PWA, generator) & panduan di `docs/brand/aira/`. Sumber logo AIRA lama dihapus.
- Produk berganti nama (dari nama produk sebelumnya) menjadi **Entaris** (*Enterprise Agentic Reasoning Integrated System*) — tagline "Agentic Reasoning System".
- Logo baru **"Anyaman ∇"**: tiga bilah yang saling menindih membentuk segitiga terbalik (∇) — tiga pilar operasi yang menyatu dan simbol gradien untuk penalaran AI. Ikon aplikasi berlatar navy, favicon 16/32/48, apple-touch, ikon PWA `any` + `maskable` terpisah (`pwa-maskable-512x512.png`), dan `mask-icon.svg` satu warna untuk Safari.
- Judul tab, manifest PWA, `theme-color` (navy `#1B2B48`), nama cadangan di login/sidebar/onboarding/landing kini memakai Entaris.
- Logo bawaan tidak lagi di-*invert* di sidebar & halaman login (ikon baru berwarna penuh).
- Halaman login memakai palet Entaris (gradien navy → biru) menggantikan biru steel lama; label panel menjadi "Agentic Reasoning System". Kontras tombol & tautan ≥ 4,5 : 1.
- Panduan merek & file sumber logo di `docs/brand/entaris/`.

### Lisensi
**Diubah**:
- Lisensi berganti dari **MIT** menjadi **proprietary** (seluruh hak dilindungi PT Arah Karya Sinergi; penggunaan hanya melalui perjanjian lisensi tertulis). `LICENSE`, badge README, dan bagian Lisensi diperbarui; `package.json` server/client/client-eam ditandai `"license": "UNLICENSED"` dan `private`.
- Badge "Demo Live" yang menunjuk ke server produksi klien dihapus; diganti badge kontak lisensi & demo (solutions@arahkarya.com).
- Klaim "gratis" dan "tanpa biaya lisensi" dihapus dari README.

**Catatan**: pengenal teknis lama (kontrak `app` ke aira-core, nama proses pm2, nama project Docker Compose, user/DB Postgres, prefiks file backup) tidak diubah agar integrasi dan deploy yang berjalan tidak putus.

## [3.19.0] - 2026-10-02

Rilis kumulatif sejak 3.18.1 (31 Jul): modul Surat Jalan Sementara, pembenahan HPP/persediaan, EAM terintegrasi keuangan, dan sejumlah perbaikan integritas data.

### Penjualan
**Ditambahkan**:
- **Surat Jalan Sementara (SJS)** — tab baru di Penjualan > Surat Jalan untuk barang yang dikirim sebelum produksi diinput. Tidak memotong stok, tanpa jurnal, tidak bisa diinvoice. Nomor `SJS-YYYYMM-NNNN`; status Terbuka → Tertaut / Dibatalkan. Ditautkan ke DO resmi saat membuat DO (langsung maupun dari SO) atau ke DO yang sudah ada (`POST /api/temporary-delivery-notes/:id/link`); qty DO boleh berbeda. DO dibatalkan → SJS kembali Terbuka. Banner pengingat SJS Terbuka > 7 hari, cetak PDF "Surat Jalan Sementara". Migrasi `20261002000000_temporary_delivery_notes.sql` (tabel baru saja, tanpa ALTER tabel lama).
- Kolom tanda tangan **Verifikasi Fisik (Security)** di PDF Delivery Order.
- Invoice bernilai **Rp 0** (sumbangan/sampel) otomatis berstatus `Paid` saat submit tanpa jurnal piutang; tetap bisa dibatalkan dari UI.
- Linimasa riwayat pembayaran gabungan pada detail invoice, termasuk uang muka yang dibatalkan.

**Diperbaiki**:
- Retur qty-saja (tarif 0, mis. barang titipan) kini diizinkan tanpa syarat total > 0.
- Cache `customerDepositBalance` disinkronkan saat submit dan cancel retur.
- Daftar Surat Jalan Sementara gagal dimuat (cast tanggal kosong ke `date`); kini memakai `NULLIF`.

### Pembelian & Penerimaan
**Ditambahkan**:
- Satu invoice pembelian dapat menagih **lebih dari satu STT/BPB** (pilih ganda); constraint UNIQUE `goods_receipts.invoice_id` dihapus.
- Detail pengajuan invoice pembelian lengkap bagi penyetuju (STT, lampiran, hutang dan deposit pemasok, harga sebelumnya); cek qty terhadap STT memperhitungkan refaksi.
- Guard WAC: STT dengan harga satuan 0 ditolak untuk barang milik sendiri (barang titipan dikecualikan).

**Diubah**:
- Edit dan batal movement stok bertipe STT **per baris diblokir** (`PUT /api/inventory/movements/:id`, `/cancel`); gunakan batal/revisi dari halaman STT agar jurnal GRNI ikut terbalik.

### Persediaan, Produksi & HPP
**Ditambahkan**:
- Akun **5.12 Biaya Konversi Dibebankan ke Persediaan** — kredit biaya konversi produksi dipisah dari 5.1 HPP (sisa selisih NRV tetap di 5.1); reklasifikasi historis Mei–Sep 2026.
- **Modal bahan baku murni (WAC2)** di detail produksi dan laporan Modal Produksi per Periode.
- Input manual nilai/satuan (`unitCost`) di Stock Opname (ERP + EAM).

**Diperbaiki**:
- `recalculateAccountBalances()` kini berbasis `accounting_ledger_entries` (sumber kebenaran), bukan `journal_entry_accounts`.
- **Reversal otomatis penyelesaian HPP (COGS backfill)** saat dokumen pemicu dibatalkan atau diedit — produksi, invoice pembelian, dan mutasi manual (`services/cogsBackfillReverse.ts`). Sebelumnya jurnal penyelesaian dan antrian tertinggal sehingga persediaan overstated. Operasi idempoten; `averageCost` tidak dibalik secara aritmetika.
- Guard HPP edit produksi disamakan dengan submit (maklon cost 0 / NRV produk samping tinggi).
- Detail produksi menampilkan jurnal aktif terbaru (revisi `-R1`/`-R2`), bukan jurnal pertama yang sudah Cancelled.
- Stock Opname tidak lagi terblokir oleh item minus historis yang tak disentuh pengguna.
- Penomoran dokumen melewati nomor yang turunan `entryNumber`-nya sudah ada.

### EAM / General Affairs
**Ditambahkan**:
- Integrasi **Tagihan GA ke keuangan** — pajak/STNK/KIR, riwayat servis, dan material request masuk antrian, diposting sebagai jurnal langsung atau faktur pembelian; akun **6.41 Beban Pajak & Perizinan Kendaraan** sebagai default pajak.
- Alur pengajuan dan approval Pajak/STNK; panel Pengajuan terpusat (servis dan pajak) sebagai tab di Maintenance/WO.
- Pengajuan servis yang disetujui otomatis membuat Work Order; menutup WO otomatis membuat riwayat servis kendaraan.
- Inventaris GA: foto per item, tab Dashboard stok dan tab Tools (opname cepat, export CSV).
- Export Excel rekap Work Order; biaya WO dan MR berstatus PAID digabung di Report Armada tanpa hitung ganda.

**Diperbaiki**:
- Antrian Tagihan GA tidak lagi hilang karena status pajak tertimpa; status pajak terjurnal dikunci (409).
- Status PAID ditambahkan di badge, label, dan filter MR; foto item inventaris dan file `/uploads` dilayani lewat endpoint aman.

### Laporan & Keuangan
**Diperbaiki**:
- Logo dan kop perusahaan kini tampil di Laba Rugi, Neraca, Neraca Saldo, Arus Kas, Aging, dan Laporan Harian.
- Halaman Bank & Kas: baris jurnal manual (biaya adm, bunga, pindah-buku) membuka detail jurnal.
- Pembatalan jurnal aplikasi Uang Muka dari Buku Besar diblokir lewat pola narasi.
- Rentang tanggal preset dashboard dihitung ulang saat dimuat, bukan memakai cache localStorage basi.
- Panel approval mengambil daftar pihak/barang dengan limit tinggi agar tidak hilang dari peta pencarian.

**Kompatibilitas**: semua migrasi baru additive dan idempotent; tidak ada perubahan yang mengubah data lama secara otomatis.

## [3.18.1] - 2026-07-31

### Export PDF Hasil Inspeksi Berkala Kendaraan

Riwayat inspeksi kendaraan kini bisa diunduh sebagai dokumen PDF per record — sebelumnya hasil inspeksi hanya bisa dilihat di layar, dan PDF "Report Kendaraan" yang ada cuma memuat satu baris ringkas inspeksi terakhir (ringkasan TCO/biaya, bukan detail checklist).

**Ditambahkan**:
- `client/src/lib/pdf/InspectionDetailPDF.tsx` + `client-eam/src/lib/pdf/InspectionDetailPDF.tsx` (identik) — dokumen A4 @react-pdf/renderer berisi header perusahaan + logo, ringkasan (hasil keseluruhan, odometer, level BBM, jadwal inspeksi berikutnya), identitas kendaraan, tabel checklist per kategori dengan status berwarna (OK hijau / Perlu Perhatian amber / Rusak merah), catatan, grid foto bukti per kategori, dan footer "dicetak oleh <user> · <tanggal cetak>" + nomor halaman
- Tombol "PDF" per baris di tabel riwayat inspeksi (tab Inspeksi, `GaVehiclePage.tsx` ERP + EAM) — nama file `Inspeksi_<plat|kode>_<tanggal>.pdf`
- `GET /api/ga/vehicle/assets/:id/inspections/:iid/photos/:pid/file` — serve file foto inspeksi lewat route ber-RBAC dengan path-traversal guard

**Diperbaiki**:
- Foto bukti inspeksi sebelumnya dirujuk sebagai `/uploads/<filePath>` langsung, padahal `/uploads/*` tidak di-serve sebagai static oleh backend (request jatuh ke SPA fallback dan mengembalikan `index.html`), sehingga gambar tidak pernah tampil. Kini `<img>` di riwayat dan gambar di PDF sama-sama memakai endpoint file di atas (di PDF byte-nya di-inline sebagai data URL).

**Kompatibilitas**: checklist format lama (12 item datar) tetap tercetak di PDF pada grup "Checklist (format lama)"; tidak ada perubahan skema DB.

## [3.18.0] - 2026-07-31

### Inspeksi Berkala Kendaraan — Komprehensif

Fitur Inspeksi Berkala di modul Kendaraan (ERP `client/` + EAM `client-eam/`) diperluas dari checklist 12 item datar menjadi inspeksi komprehensif: checklist detail per kategori, foto bukti per kategori, nama inspektor, level BBM, dan jadwal inspeksi berikutnya otomatis.

**Ditambahkan**:
- Checklist detail 33 sub-item dalam 6 kategori (Mesin & Cairan, Kelistrikan, Rem & Kemudi, Ban & Roda, Keselamatan, Lain-lain) — UI accordion per kategori dengan tombol "tandai semua" per kategori, bukan grid datar 2 kolom
- Foto bukti per kategori inspeksi (1 foto/kategori, JPG/PNG/WEBP maks 5 MB) — tabel `ga_vehicle_inspection_photos`, endpoint `POST/DELETE /api/ga/vehicle/assets/:id/inspections/:iid/photos`, file di `uploads/ga/inspections/`
- Kolom `inspector_name`, `inspector_user_id`, `fuel_level` (enum `GaVehicleFuelLevel`: KOSONG/SEPEREMPAT/SETENGAH/TIGA_PEREMPAT/PENUH), `next_due_date` di `ga_vehicle_inspections`
- Jadwal inspeksi berikutnya dihitung otomatis saat simpan (default interval 30 hari, dapat diubah per inspeksi) + banner reminder status TERLAMBAT / segera jatuh tempo di tab Inspeksi
- KPI armada "Inspeksi Jatuh Tempo" di `GET /api/ga/vehicle/fleet-summary` (`inspectionOverdue`, `inspectionDueSoon`, `inspectionNeverDone`) — dihitung dari inspeksi terakhir per kendaraan
- Endpoint `GET /api/ga/vehicle/inspection-categories` (struktur kategori + sub-item untuk FE)
- Baris riwayat inspeksi bisa di-expand: detail checklist per kategori, foto, inspektor, BBM, jadwal berikutnya

**Kompatibilitas data lama**: checklist tetap disimpan sebagai JSON flat (`{key: OK|PERLU_PERHATIAN|RUSAK}`), jadi inspeksi format lama (12 item) tetap terbaca. Sub-item yang tidak dikenal kategori baru ditampilkan di grup "Checklist (format lama)", bukan blank/error. Endpoint lama `GET /api/ga/vehicle/inspection-checkpoints` tetap ada. Migrasi `20260731000000_ga_vehicle_inspection_detail.sql` additive-only & idempotent (semua kolom baru nullable, backfill `next_due_date` = tanggal + 30 hari untuk data lama).

## [3.17.0] - 2026-07-28

### EAM (Enterprise Asset Management) — Aplikasi Terintegrasi Satu Repo

Modul EAM (dulu General Affairs) kini punya frontend standalone di `client-eam/`, dideploy terpisah di subdomain sendiri (mis. `eam.perusahaan-anda.com`), **tetap satu monorepo, satu backend/API, satu database** dengan ERP utama — bukan produk/repo terpisah.

**Ditambahkan**:
- `client-eam/` — React+Vite SPA baru, di-clone dari `client/` lalu dipangkas hanya rute modul GA/EAM (Aset, Kendaraan, Gedung, Equipment, Maintenance, Permintaan Barang, Inventaris, Dokumen, Master Data)
- Dashboard EAM (`/`) — total aset, nilai buku (NBV), work order aktif & overdue, breakdown per kategori, quick links
- Login SSO cross-subdomain: cookie di domain induk (`sameSite: lax`) sehingga 1 login ERP otomatis berlaku juga di EAM
- Filter kategori multi-value di `GET /api/fixed-assets` & `GET /api/ga/assets` (`?categoryId=A,B`) — dipakai tiap halaman modul EAM supaya otomatis hanya menampilkan kategori miliknya (mis. halaman Kendaraan hanya tampilkan aset Kendaraan)
- Tampilan login EAM dibedakan dari ERP: palet hijau tosca/emerald, ikon & copy khusus aset/maintenance (bukan replikasi identik ERP)
- Service `client-eam` ditambahkan ke `docker-compose.yml` — deploy jadi bagian siklus `docker compose up -d --build` yang sama dengan ERP

**Diubah**:
- `server/src/routes/auth.ts` — cookie domain induk (produksi) + `sameSite: lax` (dari `strict`) supaya cookie ikut terbawa lintas subdomain ERP↔EAM
- `server/src/routes/ga/assets.ts` — `buildAssetWhere()` menerima `categoryId` comma-separated (backward-compatible, single ID tetap jalan seperti biasa)

**Tidak berubah**: modul GA di ERP utama tetap aktif dan tersinkron real-time dengan EAM (baca/tulis ke endpoint & DB yang sama).

## [3.1.3] - 2026-05-22

### Strict Mode: Stok Tidak Boleh Minus (Hapus Bypass)

Lapis pelindung tambahan setelah patch v3.1.2: **stok minus DILARANG total**. Flag `allowNegativeStock` di server diabaikan, checkbox UI dihapus.

**Files patched (server)**:
- `services/deliveryOrderSubmit.ts` — hard block, hapus flag bypass
- `services/deliveryOrderEdit.ts` — sama
- `services/productionRunSubmit.ts` — hard block input qty > stok
- `services/productionRunEdit.ts` — block reverse In (kalau output sudah dipakai) + block new input oversold
- `services/productionRunCancel.ts` — block cancel kalau output sudah dipakai (output sudah jadi stok yg di-konsumsi hilir)
- `routes/inventory/movements.ts` — extend Out validation ke AdjustmentOut juga

**Files patched (client)**:
- `DeliveryOrderModal.tsx` — hapus checkbox "Izinkan stok minus", ganti dengan pesan jelas
- `ProductionRunModal.tsx` — hapus checkbox

**Stock Transfer**: sudah punya validasi per-warehouse di `services/stockTransfer.ts:60-71` (tidak diubah).

### Rationale

Insiden 2026-05: stok satu SKU sudah negatif berminggu-minggu (oversold). Setiap In berikutnya trigger bug WAC karena formula `(cQty × cCost + iQty × iCost) / (cQty + iQty)` dengan cQty negatif menghasilkan angka liar. Compound antara produksi cascading + DO submit yang lock avg corrupt → COGS dua invoice penjualan jadi berlipat-lipat dari modal sebenarnya.

Hapus bypass = tidak mungkin lagi stok negatif = tidak mungkin lagi WAC corruption ini terulang.

---

## [3.1.2] - 2026-05-22

### Fix WAC Korup Saat Stok Negatif

Bug kritis di `server/src/utils/weightedAverage.ts`: formula WAC `(cQty × cCost + iQty × iCost) / (cQty + iQty)` menghasilkan angka absurd saat `currentStock < 0` (oversold). Empirik trace:

- `calcWeightedAverage(-9.863, 8.842, 7.825, 14.050)` returns **-11.153** (negative)
- Di runtime, multiple production cancel/edit cycles meng-compound nilai sampai average_cost satu SKU menjadi **berlipat ratusan kali** dari harga wajar
- Akibat: dua invoice penjualan dibukukan dengan COGS per Kg jauh di atas harga jual → saldo akun persediaan produk terkait menjadi **negatif besar**

**Fix**: kalau `currentQty ≤ 0`, fallback pakai `inUnitCost` (anchor avg cost ke harga inbound) — jangan pakai formula yang punya pembagian dengan angka anomali. Pathological case `totalQty ≤ 0` juga di-handle sama.

### Block Oversold di Surat Jalan

`server/src/services/deliveryOrderSubmit.ts`: validasi qty kirim ≤ stok per-gudang **sebelum** decrement. Kalau tidak cukup, lempar `BusinessError`:

```
Stok 'Produk A 25 kg' di gudang Gudang Utama kurang.
Tersedia 0 Kg, diminta 10000 Kg.
Buat produksi/transfer/penerimaan dulu sebelum kirim.
```

Tanpa block ini, oversold meleluasa → stok fisik jadi negatif → trigger bug WAC di atas → COGS rusak total.

### Dashboard Hapus Clamp Math.max(0, ...)

`server/src/routes/dashboard.ts:86` dan `server/src/routes/inventory/dashboard.ts:39`:

Sebelum: `inventoryValue: Math.max(0, sum)` — menyembunyikan saldo persediaan negatif sebagai 0 di widget Dashboard.
Sesudah: `inventoryValue: sum` — tampil apa adanya supaya pemilik langsung tahu kalau ada anomali.

### Data Fix: Rekonsiliasi Stok

Adjustment fisik dijalankan satu kali (script sekali pakai, sudah dihapus) untuk item yang average cost-nya korup atau stoknya negatif: qty disesuaikan ke hasil hitung fisik dan average cost di-anchor ke harga wajar. Selisihnya dibukukan lewat satu jurnal penyesuaian: DR Persediaan masing-masing / CR 8.8 Pembulatan & Selisih, sehingga saldo akun 1.4.x kembali positif.

### Catatan Outstanding

- Masih ada sisa selisih historis di luar item yang di-fix, perlu input fisik terpisah.
- Dua invoice penjualan terdampak tidak di-cancel, dibiarkan apa adanya (COGS yang inflated sudah ter-offset oleh adjustment ke 8.8 di periode yang sama).

---

## [3.1.1] - 2026-05-20

### Landed Cost Pembelian (Material + Refaksi → Persediaan)

Selisih harga PI ↔ STT tidak lagi di-post ke akun **5.11 Selisih Harga Pembelian** sebagai expense terpisah. Sekarang seluruh komponen line PI (material + line tambahan seperti biaya risiko/susut) **diserap masuk ke nilai Persediaan** sebagai landed cost adjustment. Ini sesuai prinsip akuntansi: biaya tambahan yang *attributable* ke perolehan barang adalah bagian dari harga pokok, bukan expense periode.

**Rumus harga akhir per Kg** (saat refaksi berbeda dengan qty fisik STT):
```
unitCost = total invoice PI / qty STT (qty fisik diterima)
```

Contoh: 10.000 Kg fisik diterima di STT @ Rp 8.000/Kg (provisional), PI total Rp 82.000.000 (material + refaksi). Sebelum fix: stockMovement @ Rp 8.000/Kg (provisional STT). Setelah fix: stockMovement @ Rp 8.200/Kg (landed = 82.000.000 / 10.000).

### Implementation

- **Backend** (`purchaseInvoiceSubmit.ts`):
  - Hapus posting variance ke 5.11. Delta `effectiveAmount − provisionalTotal` di-DR ke akun Persediaan (per-item account kalau ada, fallback ke 1.4.0).
  - Negative delta otomatis ter-normalisasi ke credit side.
  - Update `stockMovement.unit_cost` dan `total_value` di akhir transaction (sumber kebenaran untuk batch picker).
  - Recalc `inventory_items.averageCost` proporsional: `(stok × avgLama + delta) / stok` dibulatkan 2 desimal.
- **Frontend**: tidak ada perubahan UI — batch picker, modal sales, dan PDF otomatis pakai unit_cost terbaru.

### Migration

Tidak ada perubahan schema. PI lama yang sudah Submitted tidak ditarik ulang (data historis tetap apa adanya). Untuk STT yang menunggu PI (status Submitted, invoice_id null), submit PI baru akan otomatis pakai logic landed cost.

---

## [3.1.0] - 2026-05-20

### Modul Produksi — Loaded HPP & Traceability
- **Phase 1**: master Standar Biaya Produksi (per kategori cost: listrik, buruh, kirim, dll) — rate Rp/Kg input atau output. Tidak posting GL, snapshot dipakai oleh production run untuk hitung HPP loaded.
- **Phase 2**: batch picker untuk bahan baku input produksi — pilih batch tertentu dari inbound stock movement, lock COGS ke harga batch (bukan WAC), simpan `sourceMovementId` + `batchUnitCost` snapshot.
- **Phase 3**: cost components per run + auto-calc HPP loaded = (material + cost input side + cost output side − by-product NRV) / qty main output. Optional override manual. Persistent `production_runs.computedHpp` + `unitCostLoaded` di output stockMovement.
- **Phase 5**: batch picker meluas — SalesInvoice (default WAC fallback, opsional specific identification), StockTransfer (lock cost dari batch source), StockMovement adjustment Out. Schema baru `stock_movements.source_movement_id` (universal back-link).
- **Phase 6**: laporan **Profitability per SKU** (Material WAC vs Loaded HPP margin side-by-side + coverage %), drawer invoice menampilkan loaded vs material margin.
- **Master Proses Produksi**: list proses (Drying, Huller, Polishing, Packing, dll) sebagai multiselect chip di production modal — traceability murni, tidak posting GL.
- **PDF Production Run**: layout A4 dengan header company, input/output/byproduct table (dengan batch ref), komponen biaya, HPP loaded breakdown, signature 3 kolom (Staff/Supervisor/Manajer).
- **Cost standard per gudang**: rate bisa di-scope per gudang (mis. biaya listrik mesin A hanya muncul di gudang produksi A, biaya mesin B hanya di gudang produksi B).
- **HPP main output optional**: kalau staff biarkan kosong, server auto-fill dari loaded HPP yang terhitung.
- **Dedup cost standard di modal**: standar yang sudah dipakai di baris lain (di sisi yang sama) disembunyikan dari dropdown baris berikutnya.

### Aset Tetap — Import Massal + Lifecycle Lengkap
- **Import aset tetap massal** via script sekali pakai (Tanah, Bangunan, Mesin, Peralatan) dengan opening accumulated depreciation per kategori, sekaligus generate jadwal depresiasi sampai akhir umur aset.
- **Opening Balance JE** aset tetap (script sekali pakai): DR akun aset (1.6.x) / CR akm penyusutan (1.7.x) + ekuitas saldo awal (3.1). Sebelum ini, rasio keuangan ngaco karena aset tetap belum masuk neraca.
- **Bulk depreciation posting**: tombol "Posting Bulanan" di halaman Aset Tetap — 1 klik post semua JE depresiasi sekaligus per bulan (vs klik manual per aset). Preview modal: count, total Rp, breakdown per kategori. Idempotent (entry sudah-post di-skip).
- **Confirm dialog single posting**: tombol "Posting" per entry sekarang buka modal konfirmasi dengan detail (asset, periode, jumlah, JE yg akan dibuat) supaya tidak ke-klik tidak sengaja.
- **Edit metadata aset**: tombol pencil per row, edit name/category/description. Field nominal (cost, masa manfaat, akun) immutable supaya JE historis tetap konsisten.
- **Export CSV** semua aset tetap dengan label akun lengkap.
- **Import CSV** dengan dropzone, preview validasi per-row (akun unknown / nominal invalid → ditandai merah), max 500 baris/import, auto-generate jadwal depresiasi. Tidak auto-post opening JE.

### Dashboard Enrichment
- **Section baru "Aset"** di Dashboard utama (Admin/Accountant/Viewer) — 4 widget: KPI (count/cost/akumulasi/nilai buku), distribusi per kategori (pie chart), penyusutan due bulan ini + 5 upcoming, top 10 aset by nilai buku.
- **Widget Profitability per SKU** di section Sales — table top 10 SKU dengan margin Material vs Loaded side-by-side + coverage % (% line yang link ke batch).
- **Widget Production Deep Dive** di section Produksi — 4 mini-KPI (run periode, total input/output, avg loaded HPP per Kg), yield trend line chart, top input/output bars, best/worst yield rank, loaded HPP breakdown.
- **Endpoint backend**: `/api/dashboard/fixed-assets` (comprehensive), extend `/api/inventory/dashboard/production` dengan `loadedHpp` block (per-product weighted avg HPP).
- 4 widget Aset share 1 fetch via TanStack Query (queryKey `dashboard-fixed-assets`).

### Stok Wajib via Surat Jalan / STT
- **Direct-sale invoice ditutup**: Sales Invoice dengan inventory line WAJIB link ke DeliveryOrder yang sudah submit. Stok keluar hanya via DO. Invoice = tagihan saja, tidak gerakkan stok.
- **Direct-purchase invoice ditutup**: Purchase Invoice dengan inventory line WAJIB link ke STT/BPB yang sudah submit. Stok masuk hanya via STT. Mirror dari sales.
- Frontend warning banner merah di SalesInvoiceModal & PurchaseInvoiceModal dengan list item yang masih orphan + petunjuk solusi.
- Service items / line akun bebas (tanpa inventoryItemId) **tetap bisa** direct via invoice.
- Backward compat: existing direct-sale/direct-purchase invoices tetap valid, cancel/payment workflow normal. Hanya CREATE baru yang di-block.

### Buku Besar (General Ledger) — Pagination
- Footer paginasi: First / Prev / Next / Last + selector per-halaman (25/50/100/200) + info "Menampilkan X–Y dari Z jurnal".
- Filter (search + hideCancelled) sekarang **server-side** supaya konsisten antar halaman (sebelumnya cuma filter 50 hasil pertama).
- Auto-reset ke page 1 saat filter berubah, indikator "memuat ulang…" saat ganti page, `placeholderData(prev)` untuk transisi mulus.

### VersionWatcher (Auto-Reload)
- Setiap deploy baru: VersionWatcher di-mount global, polling `/api/version` setiap 2 menit + sekali setiap tab kembali fokus. Versi berubah → toast persistent "Versi terbaru tersedia — Muat Ulang".
- `index.html` di-serve dengan `Cache-Control: no-store`, `/assets/*` immutable 1 tahun (Vite content-hash). Tidak perlu Ctrl-Shift-R manual lagi.

### Bug Fixes Penting
- **"Data duplikat terdeteksi" saat reuse DO/STT setelah invoice cancel**: invoice cancellation sekarang clear `delivery_order_item_id` / `goods_receipt_item_id` di sales_invoice_items / purchase_invoice_items (kolom `@unique` constraint). Plus backfill 1 record orphan.
- **DO pending tidak refresh setelah cancel invoice**: frontend invalidate cache `delivery-orders`, `delivery-orders-pending`, `stock-movements`, `journals`, `payments`, `dashboard-metrics`, `aging-summary` saat cancel.
- **Batch picker overshoot stok**: FIFO auto-absorb konsumsi legacy outbound (sales/transfer pre-Phase 5) supaya list batch di picker tidak melebihi stok gudang sebenarnya. Item yang dulu memunculkan puluhan batch kini hanya menampilkan batch sesuai stok real.
- **List Pelanggan/Vendor**: nama panjang dan label "Pelanggan/Vendor" tabrakan/overlay (h3 inline-flex → flex; nama panjang truncate dengan ellipsis; badge shrink-0).
- **Rasio Keuangan dashboard**: setelah opening balance JE Aset Tetap, Total Aset, Current Ratio, dan D/A kini mencerminkan aset tetap di neraca.

### Schema Migrations
- `20260518_add_production_loaded_hpp_phase1.sql`: tabel `production_cost_standards`, `production_run_costs`; kolom totals + `computedHpp` di `production_runs`, `sourceMovementId` + `batchUnitCost` + `nrvUnitValue` di `production_run_items`, `unitCostLoaded` di `stock_movements`.
- `20260518b_stock_movement_batch_source.sql`: `source_movement_id` universal di `stock_movements`, `sales_invoice_items`, `stock_transfer_items` + `unit_cost_loaded` di `sales_invoice_items`.
- `20260518c_cost_standard_warehouse_scope.sql`: `warehouse_id` di `production_cost_standards`.
- `20260519_add_production_processes.sql`: tabel `production_processes` + junction `production_run_processes`.

## [3.0.0] - 2026-05-10

### Rebrand
- **Nama aplikasi** baru di PWA manifest, browser title, login screen, dan semua surface internal
- **Domain** produksi dipindah ke subdomain `erp.` (hard cutover, nginx 301 redirect siap kalau DNS lama dibuka kembali)

### Pipeline Penjualan Lengkap (Inquiry → Penawaran → Invoice)
- **Modul Inquiry**: catat pertanyaan calon customer / prospect sebelum penawaran resmi
  - Workflow: Baru → Diproses → Dikonversi / Hilang / Ditutup
  - Channel tracking: WhatsApp, Telepon, Email, Walk-in, Referral, Lainnya
  - Hybrid items: free-text textarea atau structured rows (qty/unit/est. harga)
  - Auto-create Party saat conversion (prospect → customer)
- **Public Inquiry Form** (`/tanya`): customer/prospect isi sendiri, langsung masuk pipeline
  - Mobile-first branded form dengan logo perusahaan
  - Anti-spam: honeypot field + rate limit 5/IP/jam
  - Channel auto-detect dari `?src=` URL parameter
- **QR Code Generator**: header Inquiry punya tombol "QR Form"
  - Generate QR (warna abu-abu) + tracking sumber (qr-cetak/qr-toko/qr-kartu-nama/wa/ig/ref)
  - Aksi: copy link, download PNG, share via WA, native Web Share API
- **Modul Penawaran (Quotations)**: full lifecycle dengan conversion ke Sales Invoice
  - Status: Draft → Sent → Accepted/Rejected/Expired/Cancelled
  - Auto-expire sweeper tiap 1 jam + notifikasi 3 hari sebelum expiry
  - PDF "PENAWARAN HARGA" branded dengan validity box, status badge, signatures
  - Excel export per-item

### UI/UX
- **Sidebar Modular** (9 modul): Penjualan, Pembelian, Stok & Produksi, Bank & Kas, Akuntansi, Laporan, Master Data, Sistem — dengan submenu collapse/expand, persist state di localStorage, auto-expand modul aktif
- **Theme Toggle** dipindah dari sidebar ke header (samping Search): cycle Light → Dark → System
- **Sticky table thead** + body scroll-lock pada modal
- **ConfirmDialog adoption**: replace 3 native `confirm()` (PurchaseInvoice edit, Approval delete, FixedAsset dispose) dengan modal yang konsisten, dark-mode-safe, focus-trap
- **Browser tab title** auto-update per route ("Penawaran — <nama aplikasi>")
- **Industrial Professional theme**: OKLCH steel blue, Inter + Plus Jakarta Sans
- Copyright "© Arah Karya by Yayang Setya Nugroho" di footer sidebar

### Invoice Enhancements
- **Excel Export per-item** (Sales & Purchase): 1 invoice dengan N item → N baris di Excel, plus kolom kualitas/timbangan untuk Purchase
- **No. Referensi PO/Penawaran** (`customerRefNo`) di Sales Invoice — tampil di modal create/edit, drawer detail, dan PDF
- **Total Qty** di Sales/Purchase Modal & Drawer — agregat per unit (mis. "5,000 Kg · 50 Sak"); Purchase prefer `timbanganDiterima`
- **grandTotal >= 0**: invoice gratis (sample/replacement/100% diskon) sekarang bisa di-submit
- **Vendor Deposit Refund**: endpoint baru `/vendor-deposits/:id/refund` untuk offset hutang FIFO + refund kas (mirror Customer pattern)

### Security & Reliability
- Magic-byte MIME validation pada upload attachment (cegah file disamarkan via Content-Type spoof)
- Token blacklist purge cron (1 jam interval)
- `apiRateLimit` dipindah sebelum auth routes (rate-limit `/api/auth/me`, `/logout`)
- `Content-Disposition` filename di-encode RFC 5987 (cegah header injection)
- `cogsBackfill` ditambah role guard (Admin/Accountant)
- PATCH method ditambah ke audit trail
- ALE.referenceType bug fix: stock movement adjustment sekarang correctly tagged 'JournalEntry' (sebelumnya 'StockMovement' menyebabkan false-positive di health check)

### Performance
- Composite indexes: `accounting_ledger_entries (account_id, date) WHERE NOT is_cancelled`, `stock_movements (item_id, date)`, `(reference_type, reference_id)`
- Recalculate accounts.balance dari JI source-of-truth (eliminate drift)

### Generalize (Multi-vertical)
- Terminology hook: vendor/customer label configurable per industri

### Bug Fixes
- Cancel reversal pattern: journals/customerDeposits/vendorDeposits sekarang soft-cancel originals (`is_cancelled=true`) bukan create `[BATAL]` reversal entries
- Vendor Deposit list: `remaining = amount - applied - refunded` (sebelumnya tidak kurangi refunded)
- Inventory Dashboard: `inventoryValue` pakai SUM(accounts.balance) WHERE 1.4.* (bukan stock_movements cumulative)
- Health Check: ALE↔JI sync, account drift, orphan ALE, stock mismatch — semua 0 issues
- Data fixes: merge party duplikat akibat typo nama, rekonsiliasi saldo awal pelanggan, sinkronisasi tracking deposit vendor, transfer deposit antar vendor

## [2.4.0] - 2026-04-05

### Fitur Baru
- **Dashboard Pelanggan & Vendor** — KPI (piutang, hutang, deposit), aging analysis piutang/hutang, top 10 pelanggan/vendor, invoice jatuh tempo, pembayaran terakhir
- **Dashboard Proses Produksi** — KPI produksi, volume input/output/samping, tren rendemen, top bahan input/output, rendemen tertinggi/terendah, dengan filter periode dan produk
- **Edit Proses Produksi** — Edit data produksi yang sudah dibuat (reverse stok & jurnal lama, buat baru)
- **Detail Proses Produksi** — Drawer detail dengan ringkasan biaya, jurnal GL, dan tombol pembatalan

### Perbaikan
- Fix GL posting invoice jasa: item bertipe service tanpa serviceItemId sekarang otomatis masuk ke akun 4.2 (Pendapatan Jasa) bukan 4.1 (Penjualan)
- Fix data 10 invoice item jasa yang salah masuk akun 4.1, dipindahkan ke 4.2 beserta jurnal dan ledger
- Fix rendemen produksi multi-input: kalkulasi total output / total input, produk samping tidak dihitung
- Fix duplikasi journal entry number saat edit produksi berulang (suffix -R, -R2, -R3, dst)
- Fix mobile overflow text/nilai keluar dari card container

## [2.3.0] - 2026-04-04

### Fitur Baru
- **PWA (Progressive Web App)** — Aplikasi bisa diinstall seperti native app di HP/desktop melalui browser
- **Buku Besar (General Ledger)** — Laporan mutasi per akun dengan filter tanggal dan export Excel
- **Pengaturan Akun Sistem** — Halaman pengaturan yang lebih lengkap dengan grouping, search, dan status konfigurasi
- **Stock Opname** — Fitur penyesuaian stok fisik dengan GL posting otomatis
- **Weighted Average Costing** — Metode HPP rata-rata tertimbang untuk perhitungan COGS
- **PPh Per-Item** — Pajak penghasilan per item di invoice penjualan, tampil di detail dan PDF
- **Upload Bukti Transfer** — Lampiran bukti transfer untuk semua transaksi kas/bank
- **Per-Item Inventory GL** — Posting GL persediaan per item (bukan bulk)
- **Opening Balance Deposits** — Saldo awal deposit pelanggan/supplier
- **Edit Stock Movement** — Edit pergerakan stok yang sudah diinput

### Perbaikan
- HPP penjualan & produksi posting ke akun 5.1 (HPP Beras), bukan parent 5
- Payment modal menampilkan saldo awal (non-invoice) outstanding
- GL reversal menggunakan metode swap pada semua flow pembatalan
- Produksi GL journal balanced (DR output = CR input)
- Dashboard dark mode chart dan nullish coalescing fix
- Tax report, security audit, dan database indexes
- COA menampilkan indikator D/K (Debit/Kredit)
- Report number overflow fix
- Docker build compatibility untuk PWA + Vite

## [2.2.0] - 2026-04-02

### Fitur Baru
- Sistem keuangan double-entry bookkeeping
- Modul penjualan, pembelian, pembayaran
- Chart of Accounts (COA) dengan tree structure
- Jurnal umum manual
- Laporan keuangan: Neraca, Laba Rugi, Arus Kas
- Manajemen inventori dengan produksi (gabah → beras)
- Multi-user dengan role: Admin, Accountant, Viewer
- Export PDF dan Excel
- Dark mode
- Docker Compose deployment
