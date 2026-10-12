# Denylist — Endpoint yang TIDAK BOLEH menjadi Tool

> Dibangkitkan dari `server/src/ai/catalog/denylist.ts`. Menambah/menghapus entri = keputusan owner.

Route non-denylist **wajib** punya tool di registry (drift guard). Route di bawah ini sengaja tidak tersedia bagi agen.

| Aturan | Kategori | Cakupan | Alasan |
|---|---|---|---|
| `auth-session` | autentikasi | `/api/auth*` | Login/logout/me mengelola sesi & cookie JWT/CSRF. Identitas pemanggil AIRA ditetapkan lewat actor assertion (tahap 1), bukan lewat login sebagai user. |
| `password-change` | kredensial-akses | `PUT /api/users/me/password` | Pengubahan kata sandi — kredensial tidak boleh disentuh agen. |
| `user-admin` | kredensial-akses | `/api/users*` | Administrasi user (buat/ubah/aktif-nonaktif/tautan Telegram). Mengelola siapa yang boleh masuk sistem = hak manusia (Admin); pada AIRA identitas dikelola lewat AIRA registry. |
| `role-admin` | kredensial-akses | `/api/roles*` | Administrasi role & matriks izin RBAC. Agen tidak boleh mengubah/membaca peta hak akses (eskalasi hak). |
| `backup-restore` | backup-restore | `/api/backup*` | Backup/restore/hapus/unggah/unduh database memuat seluruh data & dapat menimpa DB produksi. |
| `system-reset` | destruktif-sistem | `POST /api/settings/reset-data`<br>`POST /api/settings/generate-dummy`<br>`POST /api/settings/delete-dummy`<br>`GET /api/settings/demo-data`<br>`POST /api/settings/demo-data/generate`<br>`POST /api/settings/demo-data/delete` | Reset data, data dummy & data uji coba menghapus/menimpa data transaksi. Tidak boleh dipicu agen. |
| `health-fix` | destruktif-sistem | `POST /api/health-check/fix/:p` | Perbaikan data otomatis (mutasi massal tanpa dokumen sumber) — hanya Admin manual setelah pratinjau. |
| `bulk-import` | file-biner | `/api/import*` | Impor massal COA/jurnal/pihak/stok dari berkas unggahan (multipart/CSV/XLSX) — tidak cocok sebagai panggilan tool JSON dan berisiko menimpa master. |
| `ai-internal` | ai-internal | `/api/ai*` | Router/konfigurasi/chat AIRA itu sendiri (whitelist, enable-tool, service token, invoke). Agen tidak boleh mengubah kontrol atas dirinya (rekursi & eskalasi); chat panel dipanggil UI, bukan tool. |
| `telegram` | integrasi-eksternal | `/api/telegram*` | Konfigurasi bot Telegram (token) & uji kirim. Kredensial integrasi + tautan identitas channel dikelola manual. |
| `public-endpoints` | publik | `/api/public*` | Endpoint tanpa autentikasi (branding publik, formulir inquiry publik). Bukan operasi ERP terautentikasi. |
| `public-qr` | publik | `/api/ga/public*` | QR publik aset (tanpa auth) + streaming foto. Bukan operasi ERP terautentikasi. |
| `attachment-binary` | file-biner | `POST /api/attachments/upload`<br>`GET /api/attachments/file/:p`<br>`DELETE /api/attachments/:p` | Unggah/unduh/hapus berkas biner (multipart/stream). Tool hanya mengekspos metadata lampiran, bukan isi berkas. |
| `infra-meta` | infra | `GET /health`<br>`GET /api/version` | Probe infrastruktur (health & versi build) — dipantau di luar katalog; bukan fungsi bisnis. |
| `file-upload-download-ga` | file-biner | `POST /api/ga/assets/:id/photos`<br>`POST /api/ga/documents/:id/versions`<br>`GET /api/ga/documents/:id/versions/:vid/file`<br>`POST /api/ga/inventory/items/:id/image`<br>`GET /api/ga/inventory/items/:id/image`<br>`POST /api/ga/maintenance/work-orders/:id/photos`<br>`POST /api/ga/vehicle/assets/:id/inspections/:iid/photos`<br>`GET /api/ga/vehicle/assets/:id/inspections/:iid/photos/:pid/file` | Unggah/unduh berkas biner EAM (foto aset/WO/inspeksi, PDF dokumen legal, gambar item) via multipart atau stream. Tool JSON tidak dapat membawa berkas; metadata tersedia lewat tool daftar/detail masing-masing. |
| `file-payment-request` | file-biner | `POST /api/payment-requests/:id/attachments`<br>`GET /api/payment-requests/attachments/:attId` | Unggah lampiran (multipart) dan unduh lampiran (sendFile) Pengajuan Pembayaran. Metadata lampiran tersedia di payreq_get. |
| `report-export-binary` | file-biner | `POST /api/reports/export` | Membuat berkas .xlsx dari data yang dikirim klien (stream biner, bukan pembacaan data ERP). Agen memakai tool laporan JSON. |
| `recurring-run-due` | destruktif-sistem | `POST /api/recurring/run-due` | Memicu massal eksekusi semua template berulang jatuh tempo (posting jurnal banyak sekaligus). Sudah dijalankan scheduler harian 02:00; gunakan rec_execute untuk satu template. |
| `settings-infra` | infra | `GET /api/settings/runtime`<br>`GET /api/settings/check-update`<br>`POST /api/settings/company/onboarding` | runtime membocorkan info infrastruktur (hostname, versi Node, memori); check-update menjalankan git fetch + request keluar di server; onboarding hanya penanda wizard UI. Bukan fungsi bisnis. |
| `notification-job` | infra | `POST /api/notifications/check` | Memicu job pemeriksaan notifikasi manual (tugas penjadwal). Dijalankan scheduler, bukan agen. |
