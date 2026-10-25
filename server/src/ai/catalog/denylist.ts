// DENYLIST katalog tool AIRA/MCP — endpoint yang TIDAK BOLEH pernah menjadi tool.
// Sumber tunggal: dipakai drift guard (route non-denylist wajib punya tool), generator
// docs/ai-tools/DENYLIST.md, dan (tahap 1) filter di MCP server. Menambah entri = keputusan owner.

export type DenyCategory =
  | 'autentikasi'
  | 'kredensial-akses'
  | 'publik'
  | 'backup-restore'
  | 'destruktif-sistem'
  | 'ai-internal'
  | 'integrasi-eksternal'
  | 'file-biner'
  | 'infra';

export interface DenyRule {
  id: string;
  category: DenyCategory;
  reason: string;
  /** cocokkan awalan path (path penuh /api/...) */
  pathPrefix?: string;
  /** cocokkan persis "METHOD /path" (param dinormalkan :p) */
  exact?: string[];
  /** batasi method (kosong = semua) */
  methods?: string[];
  /** regex tambahan atas path penuh */
  pathRegex?: string;
}

export const DENY_RULES: DenyRule[] = [
  {
    id: 'auth-session',
    category: 'autentikasi',
    pathPrefix: '/api/auth',
    reason:
      'Login/logout/me mengelola sesi & cookie JWT/CSRF. Identitas pemanggil AIRA ditetapkan lewat actor assertion (tahap 1), bukan lewat login sebagai user.',
  },
  {
    id: 'password-change',
    category: 'kredensial-akses',
    exact: ['PUT /api/users/me/password'],
    reason: 'Pengubahan kata sandi — kredensial tidak boleh disentuh agen.',
  },
  {
    id: 'user-admin',
    category: 'kredensial-akses',
    pathPrefix: '/api/users',
    reason:
      'Administrasi user (buat/ubah/aktif-nonaktif/tautan Telegram). Mengelola siapa yang boleh masuk sistem = hak manusia (Admin); pada AIRA identitas dikelola lewat AIRA registry.',
  },
  {
    id: 'role-admin',
    category: 'kredensial-akses',
    pathPrefix: '/api/roles',
    reason: 'Administrasi role & matriks izin RBAC. Agen tidak boleh mengubah/membaca peta hak akses (eskalasi hak).',
  },
  {
    id: 'backup-restore',
    category: 'backup-restore',
    pathPrefix: '/api/backup',
    reason: 'Backup/restore/hapus/unggah/unduh database memuat seluruh data & dapat menimpa DB produksi.',
  },
  {
    id: 'system-reset',
    category: 'destruktif-sistem',
    exact: [
      'POST /api/settings/reset-data',
      'POST /api/settings/generate-dummy',
      'POST /api/settings/delete-dummy',
      'GET /api/settings/demo-data',
      'POST /api/settings/demo-data/generate',
      'POST /api/settings/demo-data/delete',
    ],
    reason: 'Reset data, data dummy & data uji coba menghapus/menimpa data transaksi. Tidak boleh dipicu agen.',
  },
  {
    id: 'health-fix',
    category: 'destruktif-sistem',
    exact: ['POST /api/health-check/fix/:p'],
    reason: 'Perbaikan data otomatis (mutasi massal tanpa dokumen sumber) — hanya Admin manual setelah pratinjau.',
  },
  {
    id: 'bulk-import',
    category: 'file-biner',
    pathPrefix: '/api/import',
    reason: 'Impor massal COA/jurnal/pihak/stok dari berkas unggahan (multipart/CSV/XLSX) — tidak cocok sebagai panggilan tool JSON dan berisiko menimpa master.',
  },
  {
    id: 'ai-internal',
    category: 'ai-internal',
    pathPrefix: '/api/ai',
    reason:
      'Router/konfigurasi/chat AIRA itu sendiri (whitelist, enable-tool, service token, invoke). Agen tidak boleh mengubah kontrol atas dirinya (rekursi & eskalasi); chat panel dipanggil UI, bukan tool.',
  },
  {
    id: 'telegram',
    category: 'integrasi-eksternal',
    pathPrefix: '/api/telegram',
    reason: 'Konfigurasi bot Telegram (token) & uji kirim. Kredensial integrasi + tautan identitas channel dikelola manual.',
  },
  {
    id: 'public-endpoints',
    category: 'publik',
    pathPrefix: '/api/public',
    reason: 'Endpoint tanpa autentikasi (branding publik, formulir inquiry publik). Bukan operasi ERP terautentikasi.',
  },
  {
    id: 'public-qr',
    category: 'publik',
    pathPrefix: '/api/ga/public',
    reason: 'QR publik aset (tanpa auth) + streaming foto. Bukan operasi ERP terautentikasi.',
  },
  {
    id: 'attachment-binary',
    category: 'file-biner',
    exact: ['POST /api/attachments/upload', 'GET /api/attachments/file/:p', 'DELETE /api/attachments/:p'],
    reason: 'Unggah/unduh/hapus berkas biner (multipart/stream) tidak bisa lewat JSON-RPC. Padanannya: att_upload (JSON/base64/lampiran chat) dan att_download_link (tautan bertanda tangan).',
  },
  {
    id: 'file-ticket-download',
    category: 'file-biner',
    pathPrefix: '/api/files',
    reason: 'Unduh biner via tiket bertanda tangan (tanpa sesi). Agen mendapat tautan dari tool att_download_link / doc_pdf_get lalu mengunduhnya sendiri; bukan panggilan tool JSON.',
  },
  {
    id: 'infra-meta',
    category: 'infra',
    exact: ['GET /health', 'GET /api/version'],
    reason: 'Probe infrastruktur (health & versi build) — dipantau di luar katalog; bukan fungsi bisnis.',
  },
  {
    id: 'file-upload-download-ga',
    category: 'file-biner',
    exact: [
      'POST /api/ga/assets/:id/photos',
      'POST /api/ga/documents/:id/versions',
      'GET /api/ga/documents/:id/versions/:vid/file',
      'POST /api/ga/inventory/items/:id/image',
      'GET /api/ga/inventory/items/:id/image',
      'POST /api/ga/maintenance/work-orders/:id/photos',
      'POST /api/ga/vehicle/assets/:id/inspections/:iid/photos',
      'GET /api/ga/vehicle/assets/:id/inspections/:iid/photos/:pid/file',
    ],
    reason:
      'Unggah/unduh berkas biner EAM (foto aset/WO/inspeksi, PDF dokumen legal, gambar item) via multipart atau stream. Tool JSON tidak dapat membawa berkas; metadata tersedia lewat tool daftar/detail masing-masing.',
  },
  {
    id: 'file-payment-request',
    category: 'file-biner',
    exact: ['POST /api/payment-requests/:id/attachments', 'GET /api/payment-requests/attachments/:attId'],
    reason: 'Unggah multipart dan unduh (sendFile) lampiran Pengajuan Pembayaran. Unggah lewat tool memakai rute JSON terpisah (payreq_attachment_add). Metadata lampiran tersedia di payreq_get.',
  },
  {
    id: 'report-export-binary',
    category: 'file-biner',
    exact: ['POST /api/reports/export'],
    reason: 'Membuat berkas .xlsx dari data yang dikirim klien (stream biner, bukan pembacaan data ERP). Agen memakai tool laporan JSON.',
  },
  {
    id: 'recurring-run-due',
    category: 'destruktif-sistem',
    exact: ['POST /api/recurring/run-due'],
    reason: 'Memicu massal eksekusi semua template berulang jatuh tempo (posting jurnal banyak sekaligus). Sudah dijalankan scheduler harian 02:00; gunakan rec_execute untuk satu template.',
  },
  {
    id: 'settings-infra',
    category: 'infra',
    exact: ['GET /api/settings/runtime', 'GET /api/settings/check-update', 'POST /api/settings/company/onboarding'],
    reason:
      'runtime membocorkan info infrastruktur (hostname, versi Node, memori); check-update menjalankan git fetch + request keluar di server; onboarding hanya penanda wizard UI. Bukan fungsi bisnis.',
  },
  {
    id: 'notification-job',
    category: 'infra',
    exact: ['POST /api/notifications/check'],
    reason: 'Memicu job pemeriksaan notifikasi manual (tugas penjadwal). Dijalankan scheduler, bukan agen.',
  },
];

/** Normalisasi param path (`:id`, `:kind`) → `:p`. */
function norm(p: string): string {
  return p.replace(/:[A-Za-z0-9_]+/g, ':p');
}

/** Rule denylist yang cocok untuk route, atau undefined bila boleh menjadi tool. */
export function matchDenylist(method: string, fullPath: string, rules: DenyRule[] = DENY_RULES): DenyRule | undefined {
  const m = method.toUpperCase();
  const p = norm(fullPath);
  return rules.find((r) => {
    if (r.methods && !r.methods.includes(m)) return false;
    if (r.exact && r.exact.some((e) => norm(e) === `${m} ${p}`)) return true;
    if (r.pathPrefix && (p === r.pathPrefix || p.startsWith(`${r.pathPrefix}/`))) return true;
    if (r.pathRegex && new RegExp(r.pathRegex).test(p)) return true;
    return false;
  });
}
