export type DocArticle = {
  id: string;
  title: string;
  summary: string;
  readTime: string;
  badge?: string;
  content: {
    lead: string;
    sections: {
      heading: string;
      text?: string;
      code?: {
        language: string;
        content: string;
        caption?: string;
      };
      steps?: {
        title: string;
        desc: string;
        cmd?: string;
      }[];
      table?: {
        headers: string[];
        rows: string[][];
      };
      callout?: {
        type: "tip" | "warning" | "info" | "success";
        title: string;
        message: string;
      };
      list?: string[];
    }[];
  };
};

export type DocCollection = {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  description: string;
  articles: DocArticle[];
};

export const DOC_COLLECTIONS: DocCollection[] = [
  {
    id: "setup",
    name: "Setup & Instalasi",
    icon: "rocket",
    tagline: "Memulai Entaris dari nol di server atau komputer lokal Anda",
    description: "Panduan instalasi mandiri via Docker Compose, konfigurasi environment, auto-migration database, dan login pertama.",
    articles: [
      {
        id: "quickstart-docker",
        title: "Quickstart Docker Compose (5 Menit)",
        summary: "Panduan satu perintah deploy: database PostgreSQL 16, auto-migrate Prisma, auto-seed data, dan Express/React di port 3001.",
        readTime: "4 mnt baca",
        badge: "Paling Populer",
        content: {
          lead: "Entaris dirancang untuk berjalan secara mandiri (self-hosted) di infrastruktur milik Anda sendiri—baik itu VPS cloud, server on-premise kantor, maupun mini-PC seperti Raspberry Pi 5. Seluruh layanan dipaketkan dalam Docker Compose sehingga Anda tidak perlu menginstal Node.js atau PostgreSQL secara manual di host server.",
          sections: [
            {
              heading: "Prasyarat Sistem",
              text: "Sebelum memulai, pastikan server atau laptop Anda telah memiliki perangkat lunak dasar berikut:",
              list: [
                "Docker Engine 24.0+ atau Docker Desktop (tersedia untuk Linux, macOS, dan Windows)",
                "Docker Compose v2.20+",
                "Git CLI untuk mengunduh kode sumber",
                "RAM minimal 2 GB dan ruang disk kosong minimal 10 GB"
              ]
            },
            {
              heading: "Langkah-Langkah Instalasi",
              steps: [
                {
                  title: "1. Unduh repositori Entaris",
                  desc: "Clone kode sumber resmi dari GitHub ke direktori kerja Anda:",
                  cmd: "git clone https://github.com/ArahKarya/entaris.git\ncd entaris"
                },
                {
                  title: "2. Siapkan file konfigurasi lingkungan (.env)",
                  desc: "Salin template konfigurasi Docker yang sudah disediakan:",
                  cmd: "cp .env.docker.example .env"
                },
                {
                  title: "3. Generate JWT Secret yang aman",
                  desc: "Buat kunci enkripsi 48-byte acak untuk mengamankan sesi otentikasi JWT:",
                  cmd: "openssl rand -hex 48"
                },
                {
                  title: "4. Jalankan sistem via Docker Compose",
                  desc: "Mulai build container aplikasi dan database PostgreSQL di latar belakang:",
                  cmd: "docker compose up -d --build"
                },
                {
                  title: "5. Periksa log startup aplikasi",
                  desc: "Pantau proses migrasi database dan seed awal hingga server siap melayani permintaan:",
                  cmd: "docker compose logs -f app"
                }
              ]
            },
            {
              heading: "Yang Terjadi di Balik Layar Saat Pertama Kali Dijalankan",
              text: "Entaris menjalankan orkestrasi otomatis tanpa perlu intervensi manual:",
              list: [
                "Container 'db' (PostgreSQL 16 Alpine) dimulai dan healthcheck memvalidasi koneksi.",
                "Container 'app' menunggu PostgreSQL siap, lalu mengeksekusi 79 migrasi database Prisma secara otomatis.",
                "Sistem memeriksa jumlah pengguna; jika database masih kosong (0 user), skrip seed otomatis menyusun Bagan Akun (COA standar), tahun fiskal aktif, dan 4 akun pengguna default.",
                "Server Express 5.2 mulai melayani API backend dan file bundle React 19 SPA pada port 3001."
              ]
            },
            {
              heading: "Akses Aplikasi",
              text: "Buka peramban web dan arahkan ke alamat berikut:",
              code: {
                language: "bash",
                content: "http://localhost:3001",
                caption: "Jika di server jarak jauh (VPS), ganti localhost dengan IP publik atau domain Anda."
              },
              callout: {
                type: "success",
                title: "Siap Digunakan",
                message: "Aplikasi langsung aktif dengan data master siap pakai. Anda dapat masuk menggunakan akun admin bawaan dan langsung mengeksplorasi modul."
              }
            }
          ]
        }
      },
      {
        id: "env-configuration",
        title: "Konfigurasi File Environment (.env)",
        summary: "Penjelasan lengkap seluruh parameter konfigurasi: database, port, JWT, CORS, integrasi Telegram bot, dan model AI.",
        readTime: "3 mnt baca",
        content: {
          lead: "File `.env` di root direktori mengatur seluruh parameter operasional Entaris, mulai dari kredensial database hingga kunci integrasi API eksternal.",
          sections: [
            {
              heading: "Contoh Konfigurasi Standar Produksi",
              code: {
                language: "env",
                content: `# --- Kredensial Database PostgreSQL ---
POSTGRES_USER=keuangan
POSTGRES_PASSWORD=ganti_dengan_password_db_yang_kuat
POSTGRES_DB=keuangan_db
PORT=3001

# --- Keamanan & Token JWT (WAJIB DIGANTI!) ---
# Generate via: openssl rand -hex 48
JWT_SECRET=c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9

# --- Akses Jaringan (CORS) ---
ALLOWED_ORIGINS=http://localhost:3001,https://erp.perusahaan-anda.com

# --- Integrasi Telegram Bot (Opsional) ---
# Dapatkan dari @BotFather di Telegram
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_BOT_USERNAME=entaris_notif_bot`,
                caption: "File .env pada root direktori project"
              }
            },
            {
              heading: "Daftar Variabel & Fungsinya",
              table: {
                headers: ["Variabel", "Wajib?", "Default", "Keterangan"],
                rows: [
                  ["POSTGRES_USER", "Ya", "keuangan", "Username pengguna database PostgreSQL."],
                  ["POSTGRES_PASSWORD", "Ya", "-", "Password pengguna database. Gunakan password kuat."],
                  ["POSTGRES_DB", "Ya", "keuangan_db", "Nama basis data utama Entaris."],
                  ["PORT", "Ya", "3001", "Port publik yang diexpose oleh container web."],
                  ["JWT_SECRET", "WAJIB", "-", "Kunci enkripsi rahasia token JWT sesi login pengguna."],
                  ["ALLOWED_ORIGINS", "Ya", "http://localhost:3001", "Daftar domain/URL yang diizinkan melakukan request CORS."],
                  ["SEED_ADMIN_PASSWORD", "Tidak", "Adminentaris123!dsw", "Password kustom untuk akun admin saat seed pertama kali dijalankan."],
                  ["TELEGRAM_BOT_TOKEN", "Tidak", "-", "Token bot Telegram untuk notifikasi approval dan jatuh tempo."]
                ]
              },
              callout: {
                type: "warning",
                title: "Perhatian Keamanan",
                message: "Jangan pernah menggunakan nilai default JWT_SECRET di server produksi publik. Jika kunci bocor, pihak luar dapat memalsukan token sesi pengguna."
              }
            }
          ]
        }
      },
      {
        id: "default-credentials-onboarding",
        title: "Kredensial Default & Onboarding Pertama",
        summary: "Daftar 4 akun peran bawaan hasil seed otomatis dan panduan langkah pertama setelah instalasi.",
        readTime: "3 mnt baca",
        content: {
          lead: "Saat database pertama kali diinisialisasi oleh Docker, Entaris membuat 4 akun pengguna berbasis peran untuk mempermudah pengujian alur bisnis tanpa konfigurasi manual dari nol.",
          sections: [
            {
              heading: "Akun Pengguna Bawaan (Demo / Seed)",
              table: {
                headers: ["Username / Email", "Password Default", "Peran (Role)", "Cakupan Hak Akses"],
                rows: [
                  ["admin@entaris.demo", "Adminentaris123!dsw", "Admin", "Super-Admin penuh: akses semua modul, pengaturan pengguna, dan hak akses."],
                  ["staff@entaris.demo", "Admin123!", "Accountant", "Modul akuntansi, faktur penjualan & pembelian, kas/bank, rekonsiliasi, dan laporan PSAK."],
                  ["produksi@entaris.demo", "Admin123!", "StaffProduksi", "Modul penerimaan barang (STT), gudang, formula BOM, dan perintah kerja produksi."],
                  ["viewer@entaris.demo", "Admin123!", "Viewer", "Hanya baca (read-only): dapat melihat dashboard dan laporan tanpa hak edit/posting."]
                ]
              },
              callout: {
                type: "tip",
                title: "Tips Input Form Login",
                message: "Kolom login menerima alamat email lengkap maupun nama pendek sebelum tanda @ (misalnya cukup ketik 'admin' dan password)."
              }
            },
            {
              heading: "Checklist 3 Langkah Setelah Login Pertama",
              list: [
                "1. Ganti Password Admin: Buka menu profil di pojok kanan atas → Pengaturan Pengguna → Ganti Password.",
                "2. Periksa Pengaturan Perusahaan: Masuk ke menu Pengaturan → Profil Perusahaan untuk memperbarui nama PT/CV, alamat, NPWP, dan logo resmi untuk kop surat faktur.",
                "3. Verifikasi Akun Kas & Bank: Masuk ke Kas & Bank untuk menambahkan rekening bank operasional perusahaan Anda (BCA, Mandiri, BRI, dll)."
              ]
            }
          ]
        }
      },
      {
        id: "backup-restore",
        title: "Backup, Restore & Pemeliharaan",
        summary: "Cara membuat cadangan data otomatis dan memulihkan basis data via antarmuka UI maupun baris perintah Docker.",
        readTime: "3 mnt baca",
        content: {
          lead: "Seluruh data transaksi, buku besar, dan audit trail disimpan di dalam volume Docker `pgdata`. Entaris menyediakan dua opsi backup: snapshot via UI dan dump SQL melalui baris perintah.",
          sections: [
            {
              heading: "1. Backup Cepat Melalui Tampilan UI",
              text: "Pengguna dengan peran Admin dapat mengunduh file snapshot database kapan saja melalui aplikasi:",
              list: [
                "Buka menu Pengaturan → Pemeliharaan Database.",
                "Klik tombol 'Unduh Backup Database (.sql)'.",
                "File snapshot lengkap akan langsung diunduh ke komputer Anda."
              ]
            },
            {
              heading: "2. Backup Manual Melalui Baris Perintah (Terminal)",
              text: "Eksekusi perintah pg_dump langsung ke container database:",
              code: {
                language: "bash",
                content: "# Backup database ke file lokal dengan format tanggal\ndocker compose exec -T db pg_dump -U keuangan keuangan_db > backup_$(date +%Y%m%d_%H%M%S).sql",
                caption: "Jalankan di server di dalam direktori proyek entaris"
              }
            },
            {
              heading: "3. Restore Database dari File Backup",
              text: "Untuk memulihkan data dari file SQL cadangan:",
              code: {
                language: "bash",
                content: "# Restore database dari file cadangan\ndocker compose exec -T db psql -U keuangan keuangan_db < nama_file_backup.sql",
                caption: "Pastikan container db sedang aktif saat menjalankan perintah ini."
              }
            },
            {
              heading: "Perintah Docker Harian",
              code: {
                language: "bash",
                content: "# Menyalakan sistem di background\ndocker compose up -d\n\n# Mematikan sistem tanpa menghapus data\ndocker compose stop\n\n# Merestart aplikasi (misal setelah edit .env)\ndocker compose restart app\n\n# Melihat log transaksi langsung\ndocker compose logs -f app",
                caption: "Cheatsheet perintah Docker compose"
              }
            }
          ]
        }
      }
    ]
  },
  {
    id: "akuntansi",
    name: "Akuntansi & Finansial",
    icon: "book",
    tagline: "Pembukuan double-entry murni standar PSAK yang selalu seimbang",
    description: "Bagan akun hierarkis, buku besar real-time, 26 akun sistem otomatis, jurnal voucher, dan tutup buku tahun fiskal.",
    articles: [
      {
        id: "bagan-akun-coa",
        title: "Bagan Akun (Chart of Accounts / COA)",
        summary: "Struktur akun hierarki tanpa batas level dengan pengelompokan rootType untuk menentukan saldo normal debit/kredit.",
        readTime: "4 mnt baca",
        content: {
          lead: "Bagan Akun adalah fondasi akuntansi Entaris. Setiap akun memiliki tipe akar (rootType) yang mengatur otomatisasi debit dan kredit pada setiap transaksi.",
          sections: [
            {
              heading: "Struktur Hierarki 5 Golongan Akun Utama",
              table: {
                headers: ["Kode Awalan", "Golongan (Root Type)", "Saldo Normal", "Contoh Akun"],
                rows: [
                  ["1.xxx", "Asset (Aset / Harta)", "Debit", "Kas, Rekening Bank BCA, Piutang Usaha, Persediaan Bahan Baku, Aset Kendaraan"],
                  ["2.xxx", "Liability (Kewajiban / Hutang)", "Kredit", "Hutang Usaha Vendor, Hutang Akrual GRNI, PPN Masukan Dipungut, Uang Muka Penjualan"],
                  ["3.xxx", "Equity (Modal / Ekuitas)", "Kredit", "Modal Disetor, Laba Ditahan, Laba Tahun Berjalan"],
                  ["4.xxx", "Revenue (Pendapatan)", "Kredit", "Pendapatan Penjualan Produk, Pendapatan Jasa Maklon, Diskon Penjualan"],
                  ["5.xxx / 6.xxx", "Expense (Beban Pokok & Operasional)", "Debit", "HPP Penjualan, Biaya Konversi Produksi, Beban Gaji, Beban Listrik, Beban Penyusutan"]
                ]
              }
            },
            {
              heading: "26 Akun Sistem (System Accounts)",
              text: "Entaris memetakan 26 akun sistem yang digunakan oleh mesin posting otomatis di balik layar. Anda dapat mengarahkan pemetaan nomor akun ke kode COA internal perusahaan Anda di menu Pengaturan → Akun Sistem tanpa perlu mengubah sebaris kode pun.",
              list: [
                "Akun Piutang Usaha & Uang Muka Pelanggan (otomatis saat faktur & deposit)",
                "Akun Hutang Usaha & Akrual GRNI Penerimaan Barang (STT)",
                "Akun Persediaan Bahan Baku, Produk Jadi, dan Barang Dagangan",
                "Akun HPP & Biaya Konversi Dibebankan ke Persediaan (5.12)",
                "Akun PPN Keluaran (2.1.2) dan PPN Masukan (1.1.8)",
                "Akun Kas Kecil, Bank Operasional, dan Kliring Transfer"
              ]
            }
          ]
        }
      },
      {
        id: "buku-besar-gl",
        title: "Buku Besar (General Ledger) & Jurnal Umum",
        summary: "Pencatatan berpasangan murni, penelusuran audit trail hingga dokumen sumber, dan voucher jurnal manual.",
        readTime: "4 mnt baca",
        content: {
          lead: "Setiap transaksi di Entaris—baik faktur penjualan, penerimaan kas, barang masuk, maupun proses konversi produksi—langsung memicu ayat jurnal berpasangan di Buku Besar umum.",
          sections: [
            {
              heading: "Prinsip Double-Entry 'Always Balanced'",
              text: "Sistem secara mutlak menolak transaksi yang memiliki selisih antara total debit dan total kredit. Saldo akun tidak pernah disimpan sebagai angka statis yang rentan desinkronisasi; saldo dihitung secara dinamis dari tabel ledger (`accounting_ledger_entries`), menjamin akurasi audit 100%.",
              callout: {
                type: "info",
                title: "Drill-down ke Dokumen Sumber",
                message: "Saat melihat mutasi di Buku Besar, Anda dapat mengklik nomor voucher untuk langsung membuka faktur penjualan, bukti kas, atau dokumen produksi asalnya."
              }
            },
            {
              heading: "Jurnal Umum (Journal Voucher / JV)",
              text: "Modul Jurnal Umum digunakan untuk pencatatan transaksi non-operasional atau koreksi penyesuaian:",
              list: [
                "Mendukung multi-baris debit dan kredit dalam satu voucher transaksi.",
                "Validasi otomatis sebelum posting: tombol submit dinonaktifkan jika debit ≠ kredit.",
                "Fasilitas Cancel & Reverse: membatalkan jurnal dengan membuat jurnal pembalik otomatis berpencatatan lengkap tanpa menghapus riwayat audit."
              ]
            }
          ]
        }
      },
      {
        id: "tutup-buku-fiskal",
        title: "Tahun Fiskal & Tutup Buku Tahunan",
        summary: "Proses penutupan periode tahun buku otomatis, pemindahan saldo laba ke laba ditahan, dan penguncian periode.",
        readTime: "3 mnt baca",
        content: {
          lead: "Entaris mendukung pengelolaan multi-periode tahun buku fiskal dengan proses Tutup Buku Tahunan (Year-End Closing) yang aman dan otomatis.",
          sections: [
            {
              heading: "Mekanisme Tutup Buku Otomatis",
              text: "Saat periode tahun buku selesai, akuntan dapat menjalankan proses tutup buku di menu Akuntansi → Tahun Fiskal:",
              list: [
                "Sistem menghitung total pendapatan (Akun 4.xxx) dikurangi total beban (Akun 5.xxx dan 6.xxx) untuk mendapatkan Laba Bersih Tahun Berjalan.",
                "Sistem membuat jurnal penutup otomatis yang mengkredit/mendebit akun nominal ke nol dan memindahkan saldo akhir ke akun 'Laba Ditahan' (3.20).",
                "Periode tahun buku yang ditutup otomatis berstatus terkunci (Locked), mencegah penambahan atau perubahan transaksi di tanggal lampau tanpa persetujuan khusus admin."
              ]
            }
          ]
        }
      }
    ]
  },
  {
    id: "penjualan",
    name: "Penjualan & Piutang",
    icon: "shopping-bag",
    tagline: "Siklus penjualan lengkap dari prospek hingga penerimaan kas",
    description: "Inquiry, formulir tanya publik ber-QR code, penawaran harga, sales order, surat jalan (DO/SJS), faktur PPN per baris, dan aging piutang.",
    articles: [
      {
        id: "alur-penjualan-pipa",
        title: "Alur Pipeline Penjualan Entaris",
        summary: "Siklus lengkap: Inquiry → Penawaran (Quotation) → Sales Order (SO) → Surat Jalan (DO) → Invoice → Pembayaran.",
        readTime: "5 mnt baca",
        content: {
          lead: "Modul Penjualan dirancang untuk mempercepat transaksi komersial bisnis Anda dengan meminimalkan entri ulang data di setiap tahap alur kerja.",
          sections: [
            {
              heading: "Tahapan Alur Penjualan",
              steps: [
                {
                  title: "1. Inquiry (Pertanyaan Calon Pelanggan)",
                  desc: "Mencatat kebutuhan prospek dari WhatsApp, telepon, email, atau formulir publik. Belum memotong stok dan belum ada pencatatan akuntansi."
                },
                {
                  title: "2. Penawaran Harga (Sales Quotation)",
                  desc: "Menerbitkan penawaran harga resmi dengan masa berlaku (auto-expiry). Dilengkapi format cetak PDF berkop perusahaan dan status draft/terkirim/disetujui."
                },
                {
                  title: "3. Pesanan Penjualan (Sales Order / SO)",
                  desc: "Setelah pelanggan menyetujui penawaran, penawaran dikonversi 1-klik menjadi SO. SO mengunci komitmen jumlah pesanan dan harga."
                },
                {
                  title: "4. Surat Jalan / Pengiriman (Delivery Order / DO)",
                  desc: "Gudang menerbitkan DO untuk pengiriman fisik barang. Pada tahap inilah stok barang terpotong dan HPP transaksi terkunci."
                },
                {
                  title: "5. Faktur Penjualan (Sales Invoice)",
                  desc: "Bagian keuangan menerbitkan faktur penagihan yang otomatis memposting jurnal Piutang Usaha (Debit) dan Pendapatan Penjualan + PPN Keluaran (Kredit)."
                },
                {
                  title: "6. Penerimaan Pembayaran (Customer Payment)",
                  desc: "Mencatat transfer atau kas masuk dari pelanggan dengan alokasi otomatis FIFO ke nomor faktur terkait."
                }
              ]
            }
          ]
        }
      },
      {
        id: "form-tanya-qr",
        title: "Formulir Publik (/tanya) & Generator QR Code",
        summary: "Terima pertanyaan pelanggan secara mandiri lewat link publik dan QR code brosur/kemasan tanpa perlu login.",
        readTime: "3 mnt baca",
        content: {
          lead: "Entaris menyediakan halaman publik mandiri di URL `/tanya` yang dapat dibuka oleh calon pembeli langsung dari smartphone mereka tanpa akun login.",
          sections: [
            {
              heading: "Fitur Formulir Publik & QR",
              list: [
                "Formulir Responsif: Ringan diakses di browser ponsel, bebas lag, dan dilengkapi logo serta identitas bisnis Anda.",
                "Perlindungan Anti-Spam: Dilengkapi honeypot dan rate-limiting otomatis untuk mencegah bot jahat.",
                "Generator QR Code: Buat kode QR sekali klik dari dashboard untuk dicetak pada kartu nama, kemasan produk, brosur pameran, atau tautan bio Instagram/TikTok.",
                "Tracking Saluran: Setiap inquiry mencatat sumber datangnya prospek (WA, Instagram, Pameran, Walk-in) untuk analisa efektivitas promosi."
              ]
            }
          ]
        }
      },
      {
        id: "surat-jalan-sjs",
        title: "Surat Jalan Sementara (SJS) vs DO Resmi",
        summary: "Solusi operasional untuk pengiriman barang yang mendesak sebelum pencatatan produksi selesai diinput di sistem.",
        readTime: "4 mnt baca",
        content: {
          lead: "Dalam operasional pabrik atau distributor pangan (seperti pabrik beras), sering kali truk pengiriman harus segera berangkat sementara laporan administrasi produksi baru selesai di sore hari. Entaris memecahkan masalah ini dengan fitur Surat Jalan Sementara (SJS).",
          sections: [
            {
              heading: "Perbedaan SJS dan DO Resmi",
              table: {
                headers: ["Fitur", "Surat Jalan Sementara (SJS)", "Surat Jalan Resmi (DO)"],
                rows: [
                  ["Tujuan", "Dokumen jalan pengantar barang di perjalanan.", "Dokumen pengiriman final untuk penagihan faktur."],
                  ["Efek Stok", "TIDAK memotong stok gudang.", "MEMOTONG stok fisik gudang seketika."],
                  ["Efek Jurnal", "Tidak ada jurnal akuntansi.", "Mengunci HPP dan membukukan mutasi stok."],
                  ["Penagihan Invoice", "Tidak bisa langsung dijadikan invoice.", "Dapat langsung dikonversi menjadi Faktur Penjualan."],
                  ["Penyelesaian", "Wajib ditautkan ke DO resmi setelah produksi diinput.", "Dokumen final yang siap ditagihkan."]
                ]
              },
              callout: {
                type: "tip",
                title: "Pengingat Otomatis SJS Terbuka",
                message: "Dashboard Entaris secara proaktif menampilkan notifikasi jika terdapat SJS yang belum ditautkan ke DO resmi selama lebih dari 7 hari."
              }
            }
          ]
        }
      }
    ]
  },
  {
    id: "pembelian",
    name: "Pembelian & Hutang",
    icon: "truck",
    tagline: "Pengadaan bahan baku, kontrol harga, dan jadwal hutang vendor",
    description: "Penerimaan barang (STT/BPB) dengan proteksi HPP WAC, faktur pembelian multi-STT, pengajuan invoice, dan alokasi pembayaran.",
    articles: [
      {
        id: "penerimaan-stt-bpb",
        title: "Penerimaan Barang Fisik (STT / BPB)",
        summary: "Pencatatan fisik barang masuk dengan penjagaan Moving Average Cost (WAC) dan pemisahan barang milik vs barang titipan.",
        readTime: "4 mnt baca",
        content: {
          lead: "Surat Tanda Terima (STT) atau Bukti Penerimaan Barang (BPB) membuktikan bahwa barang dari pemasok telah tiba dan diverifikasi secara fisik di gudang.",
          sections: [
            {
              heading: "Fitur Proteksi STT di Entaris",
              list: [
                "Guard WAC: Sistem menolak harga satuan 0 untuk barang milik sendiri guna mencegah rusaknya kalkulasi HPP rata-rata bergerak (WAC).",
                "Barang Titipan Pelanggan: Untuk maklon/titipan giling, sistem menyediakan opsi khusus barang titipan (hanya mencatat kuantitas stok tanpa jurnal nilai rupiah).",
                "Proteksi Pembatalan: Pembatalan STT dilakukan terpusat dari dokumen STT agar jurnal akrual GRNI (Goods Receipt Not Invoiced) selalu terbalik secara presisi."
              ]
            }
          ]
        }
      },
      {
        id: "faktur-pembelian-multi-stt",
        title: "Faktur Pembelian Multi-STT & Pengajuan Hutang",
        summary: "Menagih beberapa surat jalan penerimaan barang dalam satu tagihan faktur vendor dengan perhitungan harga per kg otomatis.",
        readTime: "3 mnt baca",
        content: {
          lead: "Pemasok sering kali mengirim barang berkali-kali dalam sepekan, namun menagihnya dalam satu lembar faktur gabungan di akhir periode.",
          sections: [
            {
              heading: "Faktur Pembelian Multi-STT",
              text: "Entaris memungkinkan bagian keuangan memilih banyak nomor STT/BPB sekaligus ke dalam satu lembar Faktur Pembelian:",
              list: [
                "Sistem otomatis mengalkulasi total kuantitas dan harga satuan efektif per kilogram.",
                "Pencatatan PPN Masukan terinci per baris item untuk kebutuhan rekonsiliasi e-Faktur pajak.",
                "Pemeriksaan refaksi dan timbangan otomatis dicantumkan pada lampiran rincian tagihan."
              ]
            }
          ]
        }
      }
    ]
  },
  {
    id: "kas-bank",
    name: "Kas, Bank & Rekonsiliasi",
    icon: "credit-card",
    tagline: "Kelola kas kecil, saldo multi-rekening, dan rekonsiliasi mutasi koran",
    description: "Multi-akun kas & bank real-time, transfer antar rekening, dan upload mutasi bank CSV/Excel untuk rekonsiliasi otomatis.",
    articles: [
      {
        id: "rekonsiliasi-bank-otomatis",
        title: "Rekonsiliasi Bank Otomatis via CSV/Excel",
        summary: "Cocokkan mutasi rekening koran BCA, Mandiri, BRI dengan pembukuan internal dalam hitungan detik.",
        readTime: "4 mnt baca",
        content: {
          lead: "Menyinkronkan transaksi kas bank dengan rekening koran sering memakan waktu berjam-jam bila dilakukan manual. Entaris menghadirkan modul rekonsiliasi cerdas berbasis unggah file mutasi.",
          sections: [
            {
              heading: "Cara Kerja Rekonsiliasi",
              steps: [
                {
                  title: "1. Unduh mutasi dari Internet Banking",
                  desc: "Unduh file mutasi rekening koran dari KlikBCA Bisnis, Mandiri Cash Management, atau BRImo dalam format CSV atau Excel."
                },
                {
                  title: "2. Unggah file ke menu Rekonsiliasi Bank",
                  desc: "Pilih akun bank terkait di Entaris, lalu seret file mutasi ke area unggahan rekonsiliasi."
                },
                {
                  title: "3. Pencocokan Otomatis",
                  desc: "Sistem otomatis memetakan transaksi yang cocok (Matched), transaksi yang belum ada di buku (Bank-Only), dan transaksi buku yang belum muncul di bank (Outstanding)."
                },
                {
                  title: "4. Eksekusi Pembukuan Instan",
                  desc: "Biaya administrasi bank atau bunga yang belum dicatat dapat dibuatkan jurnalnya dalam satu klik langsung dari layar rekonsiliasi."
                }
              ]
            }
          ]
        }
      }
    ]
  },
  {
    id: "produksi",
    name: "Produksi & Manufaktur",
    icon: "cog",
    tagline: "BOM, konversi rendemen, by-product, dan HPP riil bahan baku",
    description: "Modul khusus industri manufaktur & pengolahan (seperti rice mill, pakan, pangan): formula konversi bahan, rendemen %, biaya konversi 5.12, dan backfill HPP.",
    articles: [
      {
        id: "bom-konversi-produksi",
        title: "Formula BOM & Konversi Bahan Baku",
        summary: "Mengubah bahan baku menjadi produk jadi + produk sampingan (by-product) dengan perhitungan rendemen otomatis.",
        readTime: "5 mnt baca",
        content: {
          lead: "Berbeda dengan software akuntansi dagang biasa yang hanya bisa rakit barang (assembly 1+1=2), Entaris dirancang untuk manufaktur riil yang menghasilkan produk utama beserta produk sampingan (by-product).",
          sections: [
            {
              heading: "Studi Kasus Manufaktur: Penggilingan Padi / Beras",
              text: "Dalam proses giling gabah:",
              list: [
                "Bahan Baku: Gabah Kering Panen (GKP) 10.000 kg seharga Rp 70.000.000.",
                "Produk Utama: Beras Premium 6.200 kg (Rendemen 62%).",
                "Produk Sampingan (By-product): Dedak Halus 1.000 kg (10%) & Sekam 1.800 kg (18%).",
                "Susut / Limbah: 1.000 kg (10%)."
              ]
            },
            {
              heading: "Perhitungan HPP Riil (WAC2) & Akun 5.12",
              text: "Entaris memisahkan kredit biaya konversi produksi ke akun **5.12 Biaya Konversi Dibebankan ke Persediaan**, terpisah dari akun **5.1 HPP Penjualan**. Dengan cara ini, laporan laba rugi hanya memuat HPP dari barang yang benar-benar telah terjual ke pelanggan.",
              callout: {
                type: "success",
                title: "Fitur Unggulan: COGS Backfill Queue",
                message: "Jika barang terpaksa dikirim ke pelanggan saat staf belum sempat menginput hasil produksi di sistem (stok sementara minus), Entaris secara otomatis menyelesaikan selisih HPP begitu dokumen produksi diinput."
              }
            }
          ]
        }
      }
    ]
  },
  {
    id: "eam-aset",
    name: "Aset Tetap & EAM (Armada)",
    icon: "database",
    tagline: "Penyusutan aset otomatis, manajemen armada truk, dan inspeksi fisik",
    description: "Register aset tetap, depresiasi garis lurus bulanan, EAM armada kendaraan (pajak STNK/KIR, log BBM, ban, oli, inspeksi 33-item, work order).",
    articles: [
      {
        id: "depresiasi-aset-tetap",
        title: "Register Aset & Penyusutan Otomatis",
        summary: "Pencatatan aset tetap dengan kalkulasi penyusutan garis lurus bulanan otomatis ke buku besar.",
        readTime: "3 mnt baca",
        content: {
          lead: "Modul Aset Tetap mengotomatisasi perhitungan depresiasi periodik tanpa memerlukan jurnal manual setiap akhir bulan.",
          sections: [
            {
              heading: "Siklus Aset Tetap",
              list: [
                "Pencatatan Perolehan: Catat tanggal beli, nilai perolehan, masa manfaat (tahun), dan nilai residu.",
                "Penyusutan Otomatis: Sistem menghitung beban depresiasi bulanan dan menjurnal otomatis ke Debet Beban Penyusutan / Kredit Akumulasi Penyusutan.",
                "Pelepasan / Disposisi: Catat penjualan atau penghapusan aset dengan kalkulasi keuntungan/kerugian pelepasan otomatis."
              ]
            }
          ]
        }
      },
      {
        id: "manajemen-armada-fleet",
        title: "Manajemen Armada Kendaraan & Inspeksi 33-Item",
        summary: "Pengawasan menyeluruh kendaraan logistik: pengingat pajak STNK/KIR, log BBM, nomor seri ban, dan checklist inspeksi foto.",
        readTime: "4 mnt baca",
        content: {
          lead: "Entaris menyertakan modul Enterprise Asset Management (EAM) terintegrasi langsung dalam aplikasi utama tanpa memerlukan instalasi sistem terpisah.",
          sections: [
            {
              heading: "Fitur Pemeliharaan Armada",
              list: [
                "Data Kendaraan: Plat nomor, tipe mesin, kapasitas tangki BBM, PIC driver, dan odometer berjalan.",
                "Pengingat Pajak STNK & Uji KIR: Notifikasi proaktif sebelum masa berlaku habis untuk mencegah denda tilang operasional.",
                "Monitoring Ban per Posisi: Lacak nomor seri ban pada tiap roda truk untuk mencegah penukaran ban ilegal.",
                "Inspeksi Berkala 33-Item: Checklist digital mencakup mesin, kelistrikan, rem, ban, dan keselamatan dilengkapi foto bukti fisik langsung dari kamera smartphone mekanik.",
                "Work Order Servis: Pengajuan perbaikan bengkel yang terhubung ke modul pengajuan pembayaran keuangan."
              ]
            }
          ]
        }
      }
    ]
  },
  {
    id: "laporan-pajak",
    name: "Laporan Finansial & Pajak",
    icon: "file-text",
    tagline: "10 laporan PSAK audit-ready dan rekap PPN bulanan untuk SPT Masa",
    description: "Neraca, laba rugi komparatif, arus kas langsung, buku besar pembantu, rekap PPN masukan/keluaran, dan ekspor PDF/Excel.",
    articles: [
      {
        id: "sepuluh-laporan-psak",
        title: "10 Laporan Finansial Standar PSAK",
        summary: "Laporan komparatif audit-ready dengan kemampuan drill-down ke voucher transaksi asal.",
        readTime: "4 mnt baca",
        content: {
          lead: "Setiap angka pada laporan keuangan Entaris bersumber dari ayat jurnal buku besar yang seimbang, siap disajikan kepada auditor eksternal, bank, maupun pemegang saham.",
          sections: [
            {
              heading: "Daftar 10 Laporan Keuangan",
              list: [
                "1. Neraca (Balance Sheet): Posisi aset, kewajiban, dan ekuitas per tanggal cut-off.",
                "2. Laba Rugi (Profit & Loss): Pendapatan, HPP, laba kotor, beban operasional, dan laba bersih komparatif.",
                "3. Arus Kas (Cash Flow): Metode langsung pergerakan uang masuk dan keluar per kategori operasional.",
                "4. Neraca Saldo (Trial Balance): Rekapitulasi saldo debit dan kredit seluruh akun.",
                "5. Buku Besar Pembantu (Ledger Book): Riwayat mutasi mendalam per akun dengan saldo berjalan.",
                "6. Aging Piutang (AR Aging): Klasifikasi umur tagihan pelanggan 0–30, 31–60, 61–90, >90 hari.",
                "7. Aging Hutang (AP Aging): Jadwal kewajiban jatuh tempo pembayaran ke vendor.",
                "8. Laporan Rekap Pajak PPN: Ringkasan PPN Masukan dan PPN Keluaran bulanan untuk SPT Masa.",
                "9. Laporan HPP & Modal Produksi: Rincian biaya bahan baku, konversi, dan rendemen per periode.",
                "10. Laporan Ringkasan Harian: Rangkuman aktivitas penjualan, pengeluaran kas, dan barang masuk harian."
              ]
            }
          ]
        }
      }
    ]
  },
  {
    id: "aira-mcp",
    name: "Agen AIRA & Headless MCP",
    icon: "bot",
    tagline: "Arsitektur agen nalar AI dengan 386 tools bisnis dan gerbang otorisasi",
    description: "Server MCP /mcp terstandarisasi, token profiling HMAC-SHA256, klasifikasi tier risiko (read/write/critical), dan human-in-the-loop approval.",
    articles: [
      {
        id: "arsitektur-mcp-aira",
        title: "Arsitektur Model Context Protocol (/mcp)",
        summary: "Menghubungkan klien AI modern ke database ERP dengan standar keamanan token HMAC-SHA256 dan RBAC.",
        readTime: "5 mnt baca",
        content: {
          lead: "AIRA bekerja menggunakan standar terbuka Model Context Protocol (MCP) yang diekspos melalui endpoint HTTP `/mcp`. Klien AI mana pun (Claude Desktop, Cursor, ChatGPT, atau bot internal) dapat terhubung ke Entaris melalui jalur aman ini.",
          sections: [
            {
              heading: "Protokol Keamanan & Actor Assertion",
              text: "Setiap panggilan tool dari klien AI wajib menyertakan token profil beserta actor assertion yang ditandatangani dengan algoritma HMAC-SHA256:",
              list: [
                "Time-To-Live (TTL) 120 Detik: Setiap token berlaku singkat untuk mencegah serangan replay.",
                "Nonce Sekali Pakai: Memastikan instruksi tidak dapat diduplikasi oleh pihak ketiga.",
                "Penegakan RBAC di Sisi Server: Entaris sendiri yang memverifikasi apakah pengguna yang dilayani agen memiliki izin akses ke modul terkait."
              ]
            },
            {
              heading: "3 Klasifikasi Tier Risiko Tool",
              table: {
                headers: ["Tier Risiko", "Eksekusi", "Definisi & Contoh Aksi"],
                rows: [
                  ["read", "Otomatis (Instant)", "Hanya membaca data: cek umur piutang, cek sisa stok gudang, lihat neraca keuangan."],
                  ["write", "Draf / Pending", "Membuat status draf yang dapat dibatalkan: membuat draf invoice, draf penawaran, draf pesanan pembelian."],
                  ["critical", "Wajib Approval Manusia", "Aksi finansial permanen: posting buku besar, otorisasi pembayaran kas, hapus dokumen, penyetujuan pengajuan."]
                ]
              },
              callout: {
                type: "warning",
                title: "Human in the Loop",
                message: "AIRA tidak pernah memiliki wewenang untuk memposting jurnal atau mentransfer uang secara sepihak. Setiap aksi kritikal wajib melewati persetujuan pengguna berwenang."
              }
            }
          ]
        }
      }
    ]
  },
  {
    id: "governance",
    name: "Tata Kelola & Keamanan",
    icon: "shield",
    tagline: "RBAC dinamis, audit trail diff before/after, dan bot Telegram",
    description: "Role custom tanpa ubah kode, jejak audit riil, notifikasi Telegram bot untuk persetujuan transaksi, dan penguncian akun.",
    articles: [
      {
        id: "rbac-custom-roles",
        title: "Role-Based Access Control (RBAC) Dinamis",
        summary: "Buat peran kustom (Kasir, Auditor, Mandor Gudang) dengan matriks izin modul tanpa menyentuh kode program.",
        readTime: "3 mnt baca",
        content: {
          lead: "Entaris membebaskan Anda dari batasan peran kaku. Selain 4 peran bawaan (Admin, Accountant, StaffProduksi, Viewer), Anda dapat menciptakan peran baru sesuai struktur organisasi bisnis Anda.",
          sections: [
            {
              heading: "Matriks Perizinan Granular",
              text: "Pada menu Pengaturan → Hak Akses, Admin dapat mencentang izin spesifik per modul:",
              list: [
                "Hak Baca (View): Mengizinkan pengguna membuka menu dan melihat data.",
                "Hak Ubah (Create & Edit): Mengizinkan input transaksi dan penyimpanan draf.",
                "Hak Approval: Mengizinkan menyetujui pengajuan pembelian atau pembayaran.",
                "Hak Bypass: Mengizinkan bypass stok minus atau batas plafon transaksi."
              ]
            }
          ]
        }
      },
      {
        id: "audit-trail-telegram",
        title: "Audit Trail Diff & Bot Telegram",
        summary: "Lacak riwayat perubahan data sebelum vs sesudah dan setujui transaksi langsung dari tombol chat Telegram.",
        readTime: "4 mnt baca",
        content: {
          lead: "Entaris mencatat setiap operasi manipulasi data (insert, update, delete) beserta perbandingan nilai sebelum dan sesudah (diff) untuk kepatuhan tata kelola.",
          sections: [
            {
              heading: "Notifikasi & Approval Telegram Bot",
              text: "Staf dan manajer dapat menautkan akun Entaris dengan akun Telegram pribadi:",
              list: [
                "Notifikasi Instan: Peringatan faktur jatuh tempo, stok menipis, atau pengajuan belanja baru langsung dikirim ke ponsel.",
                "Persetujuan Cepat: Pesan Telegram memuat rincian nominal dan tombol interaktif 'Setujui', 'Tolak', atau 'Minta Revisi'.",
                "Tanpa Buka Laptop: Manajer dapat memutuskan pengajuan dana saat sedang berada di perjalanan dinas hanya dengan menekan tombol di chat Telegram."
              ]
            }
          ]
        }
      }
    ]
  }
];
