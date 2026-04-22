#!/usr/bin/env python3
"""Generate PDF Manual for Keuangan ERP Application v1.8.0."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, ListFlowable, ListItem, HRFlowable
)
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os
from datetime import datetime

VERSION = '1.8.0'
COMPANY = 'Simple ERP'

# ── Colors ──────────────────────────────────────────────────
C_PRIMARY = HexColor('#1e40af')
C_PRIMARY_LT = HexColor('#dbeafe')
C_ACCENT = HexColor('#2563eb')
C_DARK = HexColor('#1e293b')
C_MID = HexColor('#475569')
C_LIGHT = HexColor('#94a3b8')
C_BG = HexColor('#f8fafc')
C_BORDER = HexColor('#e2e8f0')
C_GREEN = HexColor('#16a34a')
C_GREEN_LT = HexColor('#dcfce7')
C_RED = HexColor('#dc2626')
C_RED_LT = HexColor('#fef2f2')
C_AMBER = HexColor('#d97706')
C_AMBER_LT = HexColor('#fef3c7')
C_TEAL = HexColor('#0d9488')

W, H = A4  # 595 x 842 points


# ── Page Template ───────────────────────────────────────────
def header_footer(canvas_obj: canvas.Canvas, doc: SimpleDocTemplate) -> None:
    """Draw header and footer on each page."""
    canvas_obj.saveState()
    page_num = doc.page

    if page_num > 1:
        canvas_obj.setStrokeColor(C_PRIMARY)
        canvas_obj.setLineWidth(0.5)
        canvas_obj.line(2*cm, H - 1.5*cm, W - 2*cm, H - 1.5*cm)
        canvas_obj.setFont('Helvetica', 7)
        canvas_obj.setFillColor(C_LIGHT)
        canvas_obj.drawString(2*cm, H - 1.3*cm, f'Keuangan v{VERSION} — Panduan Pengguna')
        canvas_obj.drawRightString(W - 2*cm, H - 1.3*cm, f'Halaman {page_num}')

        canvas_obj.setStrokeColor(C_BORDER)
        canvas_obj.line(2*cm, 1.5*cm, W - 2*cm, 1.5*cm)
        canvas_obj.setFont('Helvetica', 6.5)
        canvas_obj.setFillColor(C_LIGHT)
        canvas_obj.drawString(2*cm, 1.1*cm, f'{COMPANY} — Dokumen Internal')
        canvas_obj.drawRightString(W - 2*cm, 1.1*cm, f'Dibuat: {datetime.now().strftime("%B %Y")}')

    canvas_obj.restoreState()


# ── Reusable helpers ────────────────────────────────────────
def heading1(text: str) -> Paragraph:
    return Paragraph(text, ParagraphStyle('H1Custom', fontName='Helvetica-Bold',
        fontSize=18, leading=24, textColor=C_PRIMARY, spaceBefore=16, spaceAfter=10))

def heading2(text: str) -> Paragraph:
    return Paragraph(text, ParagraphStyle('H2Custom', fontName='Helvetica-Bold',
        fontSize=13, leading=18, textColor=C_DARK, spaceBefore=14, spaceAfter=6))

def heading3(text: str) -> Paragraph:
    return Paragraph(text, ParagraphStyle('H3Custom', fontName='Helvetica-Bold',
        fontSize=10.5, leading=15, textColor=C_ACCENT, spaceBefore=10, spaceAfter=4))

def body(text: str) -> Paragraph:
    return Paragraph(text, ParagraphStyle('BodyCustom', fontName='Helvetica',
        fontSize=9, leading=14, textColor=C_DARK, spaceAfter=6, alignment=TA_JUSTIFY))

def note_box(text: str, color: HexColor = C_PRIMARY_LT, border: HexColor = C_ACCENT) -> Table:
    style = ParagraphStyle('NoteBox', fontName='Helvetica', fontSize=8.5,
        leading=13, textColor=C_DARK)
    p = Paragraph(text, style)
    t = Table([[p]], colWidths=[13.6*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), color),
        ('BOX', (0, 0), (-1, -1), 0.5, border),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    return t

def warn_box(text: str) -> Table:
    return note_box(text, C_RED_LT, C_RED)

def tip_box(text: str) -> Table:
    return note_box(text, C_GREEN_LT, C_GREEN)

def bullet_list(items: list[str]) -> ListFlowable:
    style = ParagraphStyle('BulletItem', fontName='Helvetica', fontSize=9,
        leading=13, textColor=C_DARK)
    return ListFlowable(
        [ListItem(Paragraph(item, style), bulletColor=C_ACCENT) for item in items],
        bulletType='bullet', bulletFontSize=6, leftIndent=14,
        spaceBefore=2, spaceAfter=6
    )

def numbered_list(items: list[str]) -> ListFlowable:
    style = ParagraphStyle('NumItem', fontName='Helvetica', fontSize=9,
        leading=13, textColor=C_DARK)
    return ListFlowable(
        [ListItem(Paragraph(item, style)) for item in items],
        bulletType='1', leftIndent=14, spaceBefore=2, spaceAfter=6
    )

def field_table(fields: list[tuple[str, str]], col1_title: str = 'Field', col2_title: str = 'Keterangan') -> Table:
    header_style = ParagraphStyle('FTHead', fontName='Helvetica-Bold',
        fontSize=8, textColor=white)
    cell_style = ParagraphStyle('FTCell', fontName='Helvetica', fontSize=8,
        leading=12, textColor=C_DARK)
    bold_cell = ParagraphStyle('FTBold', fontName='Helvetica-Bold', fontSize=8,
        leading=12, textColor=C_DARK)

    data = [[Paragraph(col1_title, header_style), Paragraph(col2_title, header_style)]]
    for name, desc in fields:
        data.append([Paragraph(name, bold_cell), Paragraph(desc, cell_style)])

    t = Table(data, colWidths=[4*cm, 9.6*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
    ]))
    return t

def divider() -> HRFlowable:
    return HRFlowable(width='100%', thickness=0.5, color=C_BORDER,
                      spaceAfter=8, spaceBefore=8)

def journal_example(rows: list[list[str]]) -> Table:
    """Journal entry example table."""
    t = Table(rows, colWidths=[7*cm, 3*cm, 3*cm])
    t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
    ]))
    return t


# ── Cover & TOC ─────────────────────────────────────────────

def build_cover(story: list, styles: dict) -> None:
    story.append(Spacer(1, 6*cm))

    cover_title = ParagraphStyle('CoverTitle', parent=styles['Title'],
        fontSize=32, leading=38, textColor=C_PRIMARY, alignment=TA_CENTER, spaceAfter=8)
    cover_sub = ParagraphStyle('CoverSub', parent=styles['Normal'],
        fontSize=14, leading=20, textColor=C_MID, alignment=TA_CENTER, spaceAfter=4)
    cover_ver = ParagraphStyle('CoverVer', parent=styles['Normal'],
        fontSize=11, leading=16, textColor=C_ACCENT, alignment=TA_CENTER)

    story.append(Paragraph('Keuangan', cover_title))
    story.append(Paragraph('Panduan Pengguna Aplikasi', cover_sub))
    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width='40%', thickness=2, color=C_PRIMARY,
                            spaceAfter=12, spaceBefore=4, hAlign='CENTER'))
    story.append(Paragraph('Sistem ERP Keuangan', cover_ver))
    story.append(Paragraph(COMPANY, cover_ver))
    story.append(Spacer(1, 1.5*cm))

    info_style = ParagraphStyle('CoverInfo', parent=styles['Normal'],
        fontSize=9, leading=14, textColor=C_LIGHT, alignment=TA_CENTER)
    story.append(Paragraph(f'Versi {VERSION} &bull; {datetime.now().strftime("%B %Y")}', info_style))
    story.append(Paragraph('Platform: Docker / Raspberry Pi 5 &bull; PostgreSQL 16', info_style))
    story.append(Spacer(1, 4*cm))

    box_data = [
        ['Disiapkan oleh', 'Tim IT'],
        ['Klasifikasi', 'Dokumen Internal'],
        ['Tanggal', datetime.now().strftime('%d %B %Y')],
    ]
    box_table = Table(box_data, colWidths=[4*cm, 8*cm])
    box_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('TEXTCOLOR', (0, 0), (0, -1), C_LIGHT),
        ('TEXTCOLOR', (1, 0), (1, -1), C_MID),
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(box_table)
    story.append(PageBreak())


def build_toc(story: list, styles: dict) -> None:
    toc_title = ParagraphStyle('TOCTitle', parent=styles['Heading1'],
        fontSize=20, textColor=C_PRIMARY, spaceAfter=20)
    story.append(Paragraph('Daftar Isi', toc_title))
    story.append(Spacer(1, 0.5*cm))

    toc_items = [
        ('1', 'Pendahuluan', ''),
        ('2', 'Memulai Aplikasi', ''),
        ('3', 'Dashboard', ''),
        ('4', 'Bagan Akun (Chart of Accounts)', ''),
        ('5', 'Buku Besar (General Ledger)', ''),
        ('6', 'Invoice Penjualan', ''),
        ('7', 'Invoice Pembelian', ''),
        ('8', 'Bank & Kas (Pembayaran)', ''),
        ('9', 'Uang Muka Vendor', ''),
        ('10', 'Pelanggan & Vendor', ''),
        ('11', 'Stok & Gudang (Inventori)', ''),
        ('12', 'Transaksi Berulang', ''),
        ('13', 'Rekonsiliasi Bank', ''),
        ('14', 'Laporan Keuangan', ''),
        ('15', 'Notifikasi', ''),
        ('16', 'Manajemen Pengguna', ''),
        ('17', 'Pengaturan', ''),
        ('18', 'Jejak Audit', ''),
        ('19', 'Tips & Trik', ''),
        ('A', 'Lampiran: Daftar Akun Default', ''),
        ('B', 'Lampiran: Alur Bisnis', ''),
        ('C', 'Lampiran: Diagram Korelasi COA & Modul', ''),
    ]

    toc_num = ParagraphStyle('TOCNum', fontSize=10, textColor=C_PRIMARY, fontName='Helvetica-Bold')
    toc_text = ParagraphStyle('TOCText', fontSize=10, textColor=C_DARK)

    data = []
    for num, title, _ in toc_items:
        data.append([Paragraph(num, toc_num), Paragraph(title, toc_text)])

    tbl = Table(data, colWidths=[1.2*cm, 12.5*cm])
    tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, C_BORDER),
        ('LINEBELOW', (0, -1), (-1, -1), 0.3, C_BORDER),
    ]))
    story.append(tbl)
    story.append(PageBreak())


# ── Chapter 1: Pendahuluan ──────────────────────────────────

def ch1_pendahuluan(story: list) -> None:
    story.append(heading1('1. Pendahuluan'))
    story.append(body(
        f'<b>Keuangan</b> adalah aplikasi ERP (Enterprise Resource Planning) berbasis web '
        f'yang dirancang untuk mengelola keuangan {COMPANY}. '
        f'Aplikasi ini mencakup seluruh siklus akuntansi mulai dari pencatatan '
        f'transaksi hingga pelaporan keuangan, dengan sistem <b>double-entry bookkeeping</b> '
        f'yang menjamin setiap transaksi tercatat secara seimbang (debit = kredit).'
    ))
    story.append(heading2('1.1 Fitur Utama'))
    story.append(bullet_list([
        '<b>Dashboard</b> — Ringkasan KPI keuangan real-time dengan grafik dan widget',
        '<b>Bagan Akun</b> — Struktur Chart of Accounts hierarkis (112 akun)',
        '<b>Buku Besar</b> — Pencatatan jurnal umum (double-entry)',
        '<b>Penjualan</b> — Invoice penjualan, piutang usaha, PPN',
        '<b>Pembelian</b> — Invoice pembelian, hutang usaha, PPN',
        '<b>Bank & Kas</b> — Penerimaan, pembayaran hutang, pengeluaran, pinbuk',
        '<b>Uang Muka Vendor</b> — Deposit ke supplier sebelum invoice',
        '<b>Pelanggan & Vendor</b> — Manajemen mitra bisnis',
        '<b>Stok & Gudang</b> — Master item, gerakan stok, proses produksi',
        '<b>Transaksi Berulang</b> — Template jurnal bulanan/mingguan otomatis',
        '<b>Rekonsiliasi Bank</b> — Pencocokan mutasi bank dengan buku besar',
        '<b>Laporan Keuangan</b> — 7 jenis laporan (Neraca Saldo, L/R, Neraca, Arus Kas, Aging AR/AP, Pajak)',
        '<b>Notifikasi</b> — Peringatan stok rendah dan invoice jatuh tempo',
        '<b>Manajemen User</b> — Buat, edit, nonaktifkan pengguna',
        '<b>Jejak Audit</b> — Log lengkap semua aktivitas pengguna',
        '<b>Pengaturan</b> — Tahun buku, profil perusahaan, dark mode',
    ]))
    story.append(heading2('1.2 Spesifikasi Teknis'))
    story.append(field_table([
        ('Frontend', 'React 19 + TypeScript + Vite + TailwindCSS 4'),
        ('Backend', 'Node.js 20 + Express 5 + Prisma 7'),
        ('Database', 'PostgreSQL 16'),
        ('Autentikasi', 'JWT + bcrypt (rate-limited 10 percobaan / 15 menit)'),
        ('Browser', 'Chrome 90+, Firefox 88+, Safari 14+, Edge 90+'),
        ('Akses', 'Web browser — tidak perlu install aplikasi'),
        ('Deploy', 'Docker Compose / Raspberry Pi 5'),
    ], 'Komponen', 'Detail'))
    story.append(heading2('1.3 Hak Akses Pengguna'))
    story.append(body('Terdapat 4 level akses dalam aplikasi:'))
    story.append(field_table([
        ('Admin', 'Akses penuh: semua fitur, hapus data, tutup buku, kelola pengguna, audit trail'),
        ('Accountant', 'Entri data: buat invoice, jurnal, pembayaran, laporan. Tidak bisa kelola user.'),
        ('StaffProduksi', 'Akses terbatas: pembelian, inventori, pelanggan/vendor. Tidak bisa akses keuangan.'),
        ('Viewer', 'Hanya baca: lihat laporan, dashboard, buku besar tanpa bisa mengubah'),
    ], 'Role', 'Hak Akses'))
    story.append(PageBreak())


# ── Chapter 2: Memulai Aplikasi ─────────────────────────────

def ch2_memulai(story: list) -> None:
    story.append(heading1('2. Memulai Aplikasi'))
    story.append(heading2('2.1 Cara Login'))
    story.append(body(
        'Buka browser dan akses alamat aplikasi yang telah diberikan oleh administrator. '
        'Anda akan melihat halaman login dengan logo <b>Rp</b> dan animasi mesh network.'
    ))
    story.append(body('<b>Langkah-langkah:</b>'))
    story.append(numbered_list([
        'Masukkan <b>Email</b> yang telah didaftarkan oleh administrator',
        'Masukkan <b>Password</b> Anda (gunakan tombol mata untuk show/hide)',
        'Klik tombol <b>"Masuk"</b>',
        'Jika berhasil, Anda akan diarahkan ke Dashboard',
        'Jika lupa password, hubungi Administrator perusahaan',
    ]))
    story.append(note_box(
        '<b>Keamanan:</b> Sistem membatasi percobaan login hingga 10 kali dalam 15 menit. '
        'Jika melebihi batas, akun akan terkunci sementara. Hubungi admin untuk membuka.'
    ))
    story.append(heading2('2.2 Navigasi Utama'))
    story.append(body(
        'Setelah login, di sisi kiri terdapat <b>Sidebar</b> navigasi. '
        'Sidebar dapat dilipat dengan klik tombol panah. Pada layar mobile, sidebar otomatis tersembunyi.'
    ))
    story.append(field_table([
        ('Dashboard', 'Ringkasan KPI, grafik, dan widget keuangan'),
        ('Bagan Akun', 'Struktur akun (Chart of Accounts)'),
        ('Buku Besar', 'Jurnal umum dan entri manual'),
        ('Penjualan', 'Invoice penjualan (piutang)'),
        ('Pembelian', 'Invoice pembelian (hutang)'),
        ('Stok & Gudang', 'Inventori, stok movement, produksi'),
        ('Bank & Kas', 'Pembayaran, penerimaan kas, pinbuk'),
        ('Uang Muka Vendor', 'Deposit dan alokasi ke invoice'),
        ('Rekonsiliasi Bank', 'Pencocokan mutasi bank'),
        ('Pelanggan & Vendor', 'Data mitra bisnis'),
        ('Transaksi Berulang', 'Template jurnal berulang'),
        ('Laporan Keuangan', '7 jenis laporan keuangan'),
        ('Pengaturan', 'Tahun buku, profil perusahaan'),
        ('Manajemen User', 'Kelola pengguna (Admin only)'),
        ('Jejak Audit', 'Log aktivitas (Admin only)'),
    ], 'Menu', 'Fungsi'))
    story.append(heading2('2.3 Header Bar'))
    story.append(body('Di bagian atas halaman terdapat toolbar:'))
    story.append(bullet_list([
        '<b>Pencarian (Ctrl+K)</b> — Cari cepat di seluruh aplikasi',
        '<b>Pintasan Keyboard (?)</b> — Daftar shortcut keyboard',
        '<b>Notifikasi</b> — Peringatan stok rendah & invoice jatuh tempo',
        '<b>Ganti Password</b> — Ubah password akun sendiri',
        '<b>Logout</b> — Keluar dari aplikasi',
    ]))
    story.append(heading2('2.4 Tema Gelap (Dark Mode)'))
    story.append(body(
        'Klik ikon matahari/bulan di bagian bawah sidebar untuk mengganti tema. '
        'Tersedia 3 pilihan: <b>Terang</b>, <b>Gelap</b>, dan <b>Sistem</b> (mengikuti pengaturan OS).'
    ))
    story.append(PageBreak())


# ── Chapter 3: Dashboard ────────────────────────────────────

def ch3_dashboard(story: list) -> None:
    story.append(heading1('3. Dashboard'))
    story.append(body(
        'Dashboard menampilkan ringkasan posisi keuangan perusahaan secara real-time. '
        'Halaman ini terdiri dari beberapa seksi yang bisa dikonfigurasi.'
    ))
    story.append(heading2('3.1 Kartu KPI'))
    story.append(body('Terdapat 5 kartu indikator utama di bagian atas:'))
    story.append(field_table([
        ('Total Kas & Bank', 'Saldo gabungan seluruh akun kas dan bank (1.1.x)'),
        ('Piutang Usaha', 'Total tagihan belum dibayar oleh pelanggan (1.2.1)'),
        ('Hutang Usaha', 'Total kewajiban belum dibayar ke supplier (2.1.1)'),
        ('Nilai Persediaan', 'Total nilai persediaan barang (1.4.0)'),
        ('Laba Bersih (Bulan Ini)', 'Selisih pendapatan dikurangi beban bulan berjalan'),
    ], 'Kartu', 'Penjelasan'))
    story.append(heading2('3.2 Grafik & Widget'))
    story.append(bullet_list([
        '<b>Pendapatan vs Beban</b> — Grafik area 6 bulan terakhir',
        '<b>Aktivitas Terakhir</b> — 6 transaksi pembayaran terakhir (hijau = masuk, merah = keluar)',
        '<b>Pelanggan Teratas</b> — Ranking pelanggan berdasarkan total revenue',
        '<b>Invoice Jatuh Tempo</b> — Daftar invoice yang melewati due date',
        '<b>Beban Bulan Ini</b> — Pie chart distribusi beban operasional',
        '<b>Stok Alert</b> — Item persediaan yang stoknya di bawah minimum',
    ]))
    story.append(heading2('3.3 Seksi Gudang & Inventori'))
    story.append(body('Dashboard juga menampilkan ringkasan inventori:'))
    story.append(bullet_list([
        '4 kartu KPI: Total Item, Item Aktif, Stok Menipis, Gerakan Bulan Ini',
        'Grafik <b>Tren Pergerakan Stok</b> (6 bulan): Masuk vs Keluar vs Net',
        '<b>Distribusi Kategori</b>: Bahan Baku, Produk Jadi, Produk Sampingan',
        'Tabel <b>Item Stok Terbanyak</b> dan <b>Gerakan Stok Terkini</b>',
        '<b>Statistik Produksi</b>: jumlah produksi dan rata-rata rendemen',
    ]))
    story.append(heading2('3.4 Konfigurasi Dashboard'))
    story.append(body(
        'Klik ikon gear di kanan atas untuk menyembunyikan/menampilkan widget tertentu. '
        'Konfigurasi tersimpan di browser (localStorage).'
    ))
    story.append(PageBreak())


# ── Chapter 4: Bagan Akun ───────────────────────────────────

def ch4_coa(story: list) -> None:
    story.append(heading1('4. Bagan Akun (Chart of Accounts)'))
    story.append(body(
        'Bagan Akun adalah fondasi sistem akuntansi. Seluruh transaksi dicatat ke akun-akun '
        'yang tersusun secara hierarkis. Sistem default menyediakan <b>112 akun</b> yang sudah '
        'dikategorikan sesuai standar akuntansi Indonesia.'
    ))
    story.append(heading2('4.1 Tipe Akun'))
    story.append(field_table([
        ('ASSET (Aset)', 'Harta: kas, bank, piutang, persediaan, aset tetap. Nomor 1.x.x'),
        ('LIABILITY (Liabilitas)', 'Kewajiban: hutang usaha, hutang pajak, hutang gaji. Nomor 2.x.x'),
        ('EQUITY (Ekuitas)', 'Modal: modal disetor, laba ditahan. Nomor 3.x'),
        ('REVENUE (Pendapatan)', 'Penghasilan: penjualan, pendapatan jasa. Nomor 4.x'),
        ('EXPENSE (Beban)', 'Pengeluaran: HPP, gaji, listrik, transport. Nomor 5-6.x'),
    ], 'Tipe', 'Penjelasan'))
    story.append(heading2('4.2 Navigasi Pohon Akun'))
    story.append(bullet_list([
        'Klik tanda <b>panah</b> di samping akun grup untuk expand/collapse',
        'Gunakan <b>kotak pencarian</b> untuk mencari berdasarkan nama atau nomor',
        'Akun <b>grup</b> (ikon folder biru) hanya pengelompokan — tidak bisa diisi transaksi',
        'Akun <b>detail</b> (ikon abu-abu) adalah akun yang menerima transaksi',
        'Sorting otomatis numerik: 1.4.2 muncul sebelum 1.4.10',
    ]))
    story.append(heading2('4.3 Menambah Akun'))
    story.append(body('<b>Akun Root (level tertinggi):</b>'))
    story.append(numbered_list([
        'Klik tombol <b>"+ Tambah Akun Root"</b> di kanan atas',
        'Isi nomor akun (contoh: 8), pilih tipe, dan nama akun',
        'Centang "Jadikan Akun Grup" jika akun ini akan menjadi parent',
        'Klik <b>"Simpan Akun"</b>',
    ]))
    story.append(body('<b>Sub-akun:</b>'))
    story.append(numbered_list([
        'Hover pada akun grup yang diinginkan',
        'Klik ikon <b>"+ Tambah Sub-akun"</b>',
        'Tipe root otomatis mengikuti parent',
        'Isi nomor dan nama, lalu simpan',
    ]))
    story.append(heading2('4.4 Set Saldo Awal'))
    story.append(body('Untuk mengisi saldo awal akun (saat pertama kali menggunakan sistem):'))
    story.append(numbered_list([
        'Hover pada akun detail, klik ikon <b>dompet</b> (Set Saldo Awal)',
        'Masukkan nominal saldo baru',
        'Sistem otomatis membuat jurnal saldo awal terhadap akun <b>Laba Ditahan (3.2)</b>',
    ]))
    story.append(note_box(
        '<b>Penting:</b> Saldo awal sebaiknya diisi sebelum memulai transaksi harian. '
        'Pastikan total saldo awal seimbang (Aset = Liabilitas + Ekuitas).'
    ))
    story.append(heading2('4.5 Menghapus Akun'))
    story.append(body('Akun hanya bisa dihapus jika:'))
    story.append(bullet_list([
        'Tidak memiliki sub-akun (children)',
        'Tidak memiliki transaksi terkait',
        'Saldo nol',
        'Bukan akun sistem (1.1.1, 1.2.1, 2.1.1, dll.)',
    ]))
    story.append(PageBreak())


# ── Chapter 5: Buku Besar ───────────────────────────────────

def ch5_buku_besar(story: list) -> None:
    story.append(heading1('5. Buku Besar (General Ledger)'))
    story.append(body(
        'Buku Besar menampilkan seluruh entri jurnal. Jurnal dibuat <b>otomatis</b> saat invoice '
        'atau pembayaran dicatat, atau dibuat <b>manual</b> untuk transaksi khusus.'
    ))
    story.append(heading2('5.1 Melihat Daftar Jurnal'))
    story.append(bullet_list([
        'Gunakan <b>kotak pencarian</b> untuk mencari berdasarkan nomor atau keterangan',
        'Filter <b>"Bulan Ini"</b> untuk jurnal bulan berjalan',
        'Setiap baris: tanggal, referensi, keterangan, akun, debit, kredit, status',
    ]))
    story.append(heading2('5.2 Membuat Jurnal Manual'))
    story.append(body('Klik <b>"+ Buat Jurnal Baru"</b>, lalu isi:'))
    story.append(field_table([
        ('Tanggal', 'Harus dalam tahun buku yang terbuka'),
        ('Keterangan / Narasi', 'Deskripsi transaksi, contoh: "Bayar listrik Maret 2026"'),
        ('Baris Jurnal', 'Minimal 2 baris: satu debit dan satu kredit'),
        ('Akun', 'Pilih akun detail dari dropdown (bukan grup)'),
        ('Debit', 'Tidak boleh isi debit DAN kredit di satu baris'),
        ('Kredit', 'Jumlah yang dikredit'),
    ]))
    story.append(note_box(
        '<b>Prinsip Double-Entry:</b> Total debit HARUS sama dengan total kredit. '
        'Indikator warna: hijau = seimbang, merah = ada selisih. '
        'Jurnal tidak bisa disimpan jika tidak seimbang.'
    ))
    story.append(heading2('5.3 Contoh Jurnal'))
    story.append(journal_example([
        ['Transaksi', 'Debit', 'Kredit'],
        ['Bayar Listrik Rp 3.5 juta', '', ''],
        ['    6.11 Beban Listrik', 'Rp 3.500.000', '—'],
        ['    1.1.1 Petty Cash', '—', 'Rp 3.500.000'],
        ['Bayar Gaji Rp 15 juta', '', ''],
        ['    6.4 Beban Gaji, Upah & Honorer', 'Rp 15.000.000', '—'],
        ['    1.1.2 Bank BRI', '—', 'Rp 15.000.000'],
    ]))
    story.append(heading2('5.4 Jurnal Otomatis'))
    story.append(body('Jurnal berikut dibuat otomatis oleh sistem (jangan dibuat manual):'))
    story.append(bullet_list([
        '<b>Invoice Penjualan</b>: DR Piutang (1.2.1) / CR Penjualan (4.1)',
        '<b>Invoice Pembelian</b>: DR Persediaan (1.4.0) / CR Hutang (2.1.1)',
        '<b>Pembayaran</b>: DR/CR Kas-Bank (1.1.x) terhadap Piutang/Hutang',
        '<b>Saldo Awal COA</b>: DR/CR Akun terkait terhadap Laba Ditahan (3.2)',
        '<b>Tutup Buku</b>: Transfer laba ke Laba Ditahan (3.2)',
    ]))
    story.append(PageBreak())


# ── Chapter 6: Penjualan ────────────────────────────────────

def ch6_penjualan(story: list) -> None:
    story.append(heading1('6. Invoice Penjualan'))
    story.append(body(
        'Modul ini mencatat penjualan kepada pelanggan. Setiap invoice otomatis membuat jurnal: '
        '<b>DR Piutang Usaha (1.2.1) / CR Penjualan (4.1)</b>. '
        'Jika ada item inventaris, sistem juga mencatat <b>DR HPP (5) / CR Persediaan (1.4.0)</b>.'
    ))
    story.append(heading2('6.1 Ringkasan Halaman'))
    story.append(bullet_list([
        '<b>Total Invoice</b> — jumlah invoice yang tercatat',
        '<b>Total Piutang</b> — tagihan belum dibayar (merah)',
        '<b>Sudah Lunas</b> — invoice yang sudah lunas (hijau)',
        '<b>Jatuh Tempo</b> — invoice melewati tanggal jatuh tempo (oranye)',
    ]))
    story.append(heading2('6.2 Membuat Invoice Baru'))
    story.append(body('Klik <b>"+ Buat Invoice Baru"</b>, lalu isi:'))
    story.append(field_table([
        ('Tagihkan Kepada *', 'Pilih pelanggan dari dropdown'),
        ('Tanggal Invoice', 'Tanggal penerbitan'),
        ('Jatuh Tempo', 'Batas waktu pembayaran'),
        ('Termin', 'Net 7 / Net 14 / Net 30 / Net 60 / COD'),
        ('Item Lines', 'Nama item, deskripsi, qty, satuan, harga, diskon %'),
        ('Pajak %', 'PPN (contoh: 11 untuk 11%)'),
        ('Potongan', 'Potongan harga tambahan'),
        ('Biaya Lain', 'Biaya tambahan (ongkir, dll.)'),
        ('Catatan', 'Keterangan internal'),
    ]))
    story.append(body('<b>Grand Total = Subtotal + Pajak - Potongan + Biaya Lain</b>'))
    story.append(heading2('6.3 Tipe Item'))
    story.append(field_table([
        ('Item Inventaris', 'Barang yang ada stoknya (beras, gabah). Otomatis mengurangi stok dan mencatat HPP.'),
        ('Item Service', 'Jasa tanpa stok (jasa giling). Hanya mencatat pendapatan jasa (4.2).'),
    ], 'Tipe', 'Penjelasan'))
    story.append(heading2('6.4 Status Invoice'))
    story.append(field_table([
        ('Submitted', 'Baru dibuat, belum ada pembayaran'),
        ('PartiallyPaid', 'Sudah menerima sebagian pembayaran'),
        ('Paid', 'Seluruh tagihan sudah dilunasi'),
        ('Cancelled', 'Invoice dibatalkan (jurnal otomatis di-reverse)'),
    ], 'Status', 'Penjelasan'))
    story.append(heading2('6.5 Membatalkan Invoice'))
    story.append(body('Untuk membatalkan invoice:'))
    story.append(bullet_list([
        'Invoice yang sudah ada pembayaran <b>tidak bisa dibatalkan</b> — batalkan pembayaran dulu',
        'Saat dibatalkan: jurnal GL di-reverse, stok dikembalikan, piutang berkurang',
    ]))
    story.append(PageBreak())


# ── Chapter 7: Pembelian ────────────────────────────────────

def ch7_pembelian(story: list) -> None:
    story.append(heading1('7. Invoice Pembelian'))
    story.append(body(
        'Modul ini mencatat pembelian dari supplier. Setiap invoice pembelian otomatis membuat jurnal: '
        '<b>DR Persediaan (1.4.0) / CR Hutang Usaha (2.1.1)</b>. '
        'Stok item inventaris otomatis bertambah.'
    ))
    story.append(heading2('7.1 Perbedaan dengan Penjualan'))
    story.append(field_table([
        ('Mitra', 'Supplier/Vendor (bukan Customer)'),
        ('Akun Debit', 'Persediaan (1.4.0) — Aset'),
        ('Akun Kredit', 'Hutang Usaha (2.1.1) — Liabilitas'),
        ('Efek Stok', 'Stok bertambah (bukan berkurang)'),
        ('PPN', 'Masuk ke PPN Masukan (1.5.3)'),
    ], 'Aspek', 'Invoice Pembelian'))
    story.append(heading2('7.2 Alur Kerja Pembelian'))
    story.append(numbered_list([
        'Terima gabah/barang dari supplier',
        'Buat <b>Invoice Pembelian</b> dengan detail item dan harga per kg',
        'Sistem otomatis <b>posting jurnal</b>: Dr Persediaan / Cr Hutang Usaha',
        'Stok item otomatis bertambah sesuai qty',
        '<b>Bayar supplier</b> melalui modul Bank & Kas saat jatuh tempo',
        'Status invoice otomatis berubah menjadi Lunas atau Sebagian',
    ]))
    story.append(note_box(
        '<b>Contoh:</b> Beli 5.000 kg gabah @ Rp 5.500/kg dari CV Padi Emas + PPN 11%.<br/>'
        'Subtotal = 5.000 × 5.500 = Rp 27.500.000<br/>'
        'PPN 11% = Rp 3.025.000<br/>'
        'Grand Total = Rp 30.525.000<br/>'
        'Jurnal: Dr Persediaan Rp 27.5 jt + Dr PPN Masukan Rp 3.025 jt / Cr Hutang Rp 30.525 jt'
    ))
    story.append(heading2('7.3 Tombol Bayar Hutang'))
    story.append(body(
        'Di halaman pembelian juga tersedia tombol <b>"Bayar Hutang"</b> '
        'yang membuka modal pembayaran langsung untuk melunasi invoice yang dipilih. '
        'Fungsinya sama dengan tombol Bayar Hutang di modul Bank & Kas.'
    ))
    story.append(PageBreak())


# ── Chapter 8: Bank & Kas ───────────────────────────────────

def ch8_bank_kas(story: list) -> None:
    story.append(heading1('8. Bank & Kas (Pembayaran)'))
    story.append(body(
        'Modul ini mencatat seluruh mutasi kas dan bank. Terdapat <b>5 jenis transaksi</b> '
        'yang bisa dilakukan dari halaman ini. Semua transaksi otomatis membuat jurnal GL.'
    ))
    story.append(heading2('8.1 Jenis Transaksi'))
    story.append(field_table([
        ('Terima Pembayaran', 'Uang masuk dari pelanggan. DR Kas/Bank (1.1.x) / CR Piutang (1.2.1). '
         'Otomatis dialokasi ke invoice pelanggan (FIFO).'),
        ('Bayar Hutang', 'Bayar invoice supplier. DR Hutang (2.1.1) / CR Kas/Bank (1.1.x). '
         'Otomatis dialokasi ke invoice supplier.'),
        ('Catat Pengeluaran', 'Pengeluaran langsung tanpa invoice (listrik, ATK, bensin). '
         'DR Beban (6.x) / CR Kas/Bank (1.1.x). Dibuat sebagai jurnal.'),
        ('Pinbuk (Transfer)', 'Transfer antar rekening kas/bank. '
         'DR Kas/Bank tujuan / CR Kas/Bank asal.'),
        ('Uang Muka', 'Deposit ke supplier sebelum ada invoice. '
         'Membuka halaman Uang Muka Vendor.'),
    ], 'Tombol', 'Fungsi & Jurnal'))

    story.append(heading2('8.2 Terima Pembayaran'))
    story.append(body('Klik <b>"Terima Pembayaran"</b>, lalu isi:'))
    story.append(field_table([
        ('Tanggal', 'Tanggal pembayaran diterima'),
        ('Pelanggan *', 'Pilih pelanggan yang membayar'),
        ('Jumlah *', 'Nominal pembayaran'),
        ('Akun Kas/Bank *', 'Rekening tujuan (Bank BRI, Petty Cash, dll.)'),
        ('No. Referensi', 'Nomor bukti transfer/kwitansi (opsional)'),
        ('Catatan', 'Keterangan tambahan (opsional)'),
    ]))
    story.append(tip_box(
        '<b>Auto-Alokasi:</b> Sistem otomatis mengalokasikan pembayaran ke invoice tertua (FIFO). '
        'Jika pembayaran Rp 100 juta dan ada 2 invoice (Rp 60 jt + Rp 40 jt), '
        'keduanya otomatis berubah status menjadi Lunas.'
    ))

    story.append(heading2('8.3 Bayar Hutang'))
    story.append(body(
        'Klik <b>"Bayar Hutang"</b>. Pilih supplier, jumlah, dan akun kas/bank sumber dana. '
        'Sistem menampilkan daftar invoice terbuka milik supplier tersebut. '
        'Klik "Isi jumlah lunaskan semua" untuk mengisi otomatis total outstanding.'
    ))

    story.append(heading2('8.4 Catat Pengeluaran'))
    story.append(body(
        'Untuk pengeluaran yang <b>tidak melalui invoice pembelian</b> (contoh: bayar listrik, beli ATK). '
        'Klik <b>"Catat Pengeluaran"</b>, lalu isi:'
    ))
    story.append(field_table([
        ('Akun Pengeluaran (Debit)', 'Pilih akun tujuan: Beban Listrik, Beban Gaji, dll.'),
        ('Dibayar Dari (Kredit)', 'Pilih akun kas/bank sumber dana'),
        ('Pihak Terkait', 'Opsional — pilih supplier/vendor terkait'),
        ('Jumlah', 'Nominal pengeluaran'),
        ('Keterangan', 'Deskripsi pengeluaran'),
    ]))

    story.append(heading2('8.5 Pinbuk (Transfer Antar Rekening)'))
    story.append(body(
        'Klik <b>"Pinbuk"</b> untuk transfer antar kas/bank. '
        'Contoh: transfer Rp 25 juta dari Bank BRI ke Petty Cash. '
        'Jurnal: DR Petty Cash Rp 25 jt / CR Bank BRI Rp 25 jt.'
    ))

    story.append(heading2('8.6 Tabel Transaksi'))
    story.append(body(
        'Tabel menampilkan gabungan semua transaksi kas/bank dari pembayaran dan jurnal. '
        'Indikator warna:'
    ))
    story.append(bullet_list([
        '<font color="#16a34a"><b>Masuk</b></font> (hijau) — uang masuk dari pelanggan',
        '<font color="#dc2626"><b>Keluar</b></font> (merah) — uang keluar ke supplier',
        '<font color="#d97706"><b>Beban</b></font> (kuning) — pengeluaran langsung',
        '<font color="#2563eb"><b>Pinbuk</b></font> (biru) — transfer antar rekening',
        '<font color="#d97706"><b>Uang Muka</b></font> (kuning) — deposit vendor',
    ]))
    story.append(PageBreak())


# ── Chapter 9: Uang Muka Vendor ─────────────────────────────

def ch9_uang_muka(story: list) -> None:
    story.append(heading1('9. Uang Muka Vendor'))
    story.append(body(
        'Modul ini mengelola <b>deposit (uang muka)</b> yang dibayarkan ke supplier '
        'sebelum invoice pembelian dibuat. Deposit bisa dialokasikan ke invoice di kemudian hari.'
    ))
    story.append(heading2('9.1 Membuat Deposit'))
    story.append(numbered_list([
        'Buka halaman <b>Uang Muka Vendor</b> di sidebar',
        'Klik <b>"+ Buat Deposit Baru"</b>',
        'Pilih supplier, jumlah, akun kas/bank sumber, dan tanggal',
        'Klik <b>Simpan</b>',
    ]))
    story.append(body('Jurnal otomatis: <b>DR Uang Muka Pembelian (1.3) / CR Kas/Bank (1.1.x)</b>'))

    story.append(heading2('9.2 Mengalokasikan Deposit ke Invoice'))
    story.append(numbered_list([
        'Di halaman Uang Muka Vendor, cari deposit yang ingin dialokasikan',
        'Klik <b>"Apply"</b>',
        'Pilih invoice pembelian dari supplier yang sama',
        'Masukkan jumlah yang ingin dialokasikan (maks = sisa deposit ATAU outstanding invoice)',
        'Klik <b>Simpan</b>',
    ]))
    story.append(body('Jurnal otomatis: <b>DR Hutang Usaha (2.1.1) / CR Uang Muka (1.3)</b>'))

    story.append(heading2('9.3 Aturan Penting'))
    story.append(bullet_list([
        'Deposit hanya bisa dialokasikan ke invoice supplier yang <b>sama</b>',
        'Tidak bisa melebihi <b>sisa deposit</b> atau <b>outstanding invoice</b>',
        'Invoice yang sudah <b>Paid</b> tidak bisa menerima alokasi',
        'Deposit yang sudah dialokasikan <b>tidak bisa dibatalkan</b> — batalkan alokasi dulu',
        'Satu deposit bisa dialokasikan ke <b>beberapa invoice</b> secara bertahap',
    ]))
    story.append(heading2('9.4 Membatalkan'))
    story.append(bullet_list([
        '<b>Batalkan Alokasi</b>: Klik "Cancel Apply" — saldo deposit restored, invoice outstanding restored',
        '<b>Batalkan Deposit</b>: Hanya bisa jika tidak ada alokasi aktif. Saldo kas/bank dikembalikan.',
    ]))
    story.append(PageBreak())


# ── Chapter 10: Pelanggan & Vendor ──────────────────────────

def ch10_parties(story: list) -> None:
    story.append(heading1('10. Pelanggan & Vendor'))
    story.append(body(
        'Halaman ini mengelola data mitra bisnis. Setiap mitra dapat memiliki '
        'saldo piutang (pelanggan) atau hutang (supplier).'
    ))
    story.append(heading2('10.1 Menambah Mitra Baru'))
    story.append(body('Klik <b>"+ Tambah Mitra Baru"</b>, lalu isi:'))
    story.append(field_table([
        ('Tipe *', 'Pelanggan (Customer), Vendor (Supplier), atau Keduanya (Both)'),
        ('Nama *', 'Nama lengkap mitra atau perusahaan'),
        ('Telepon', 'Nomor HP atau telepon kantor'),
        ('Email', 'Alamat email'),
        ('Alamat', 'Alamat lengkap'),
        ('NPWP', 'Nomor Pokok Wajib Pajak (opsional)'),
    ]))
    story.append(heading2('10.2 Filter & Pencarian'))
    story.append(bullet_list([
        'Cari berdasarkan <b>nama</b> di kotak pencarian',
        'Filter berdasarkan tipe: <b>Semua / Pelanggan / Vendor</b>',
    ]))
    story.append(heading2('10.3 Kartu Mitra'))
    story.append(body('Setiap mitra ditampilkan dalam format kartu:'))
    story.append(bullet_list([
        '<b>Avatar</b> dengan inisial dan badge tipe (PELANGGAN / VENDOR)',
        '<b>Kontak</b>: email, telepon, alamat',
        '<b>Saldo Terutang</b>: jumlah tagihan/hutang outstanding',
        '<b>Saldo Deposit</b>: uang muka yang belum digunakan',
        'Menu aksi: <b>Edit</b> dan <b>Hapus/Nonaktifkan</b>',
    ]))
    story.append(heading2('10.4 Hapus vs Nonaktifkan'))
    story.append(field_table([
        ('Hapus permanen', 'Jika mitra BELUM punya transaksi. Data dihapus sepenuhnya.'),
        ('Nonaktifkan', 'Jika mitra SUDAH punya transaksi. Ditandai "Nonaktif", tidak bisa dipakai untuk transaksi baru.'),
    ], 'Aksi', 'Kondisi'))
    story.append(PageBreak())


# ── Chapter 11: Stok & Gudang ───────────────────────────────

def ch11_inventory(story: list) -> None:
    story.append(heading1('11. Stok & Gudang (Inventori)'))
    story.append(body(
        'Modul inventori terdiri dari 3 tab: <b>Master Item</b>, <b>Riwayat Gerakan Stok</b>, '
        'dan <b>Proses Produksi</b>.'
    ))
    story.append(heading2('11.1 Master Item'))
    story.append(field_table([
        ('Kode Item *', 'Kode unik, contoh: GKP, BP, BKT'),
        ('Nama Item *', 'Nama lengkap, contoh: Gabah Kering Panen'),
        ('Satuan *', 'Unit: Kg, Ton, Sak, Liter, Pcs'),
        ('Kategori', 'Bahan Baku, Produk Jadi, Produk Sampingan'),
        ('Stok Minimum', 'Batas minimum. Jika di bawah, tampil peringatan di Dashboard & Notifikasi.'),
        ('Akun Persediaan', 'Akun COA untuk pencatatan nilai stok (misal 1.4.1)'),
    ]))
    story.append(heading2('11.2 Gerakan Stok'))
    story.append(body('Catat setiap pergerakan fisik barang:'))
    story.append(field_table([
        ('Masuk (In)', 'Barang masuk gudang (terima dari supplier)'),
        ('Keluar (Out)', 'Barang keluar gudang (kirim ke pelanggan)'),
        ('Adjustment + (Adj+)', 'Koreksi penambahan (stock opname lebih)'),
        ('Adjustment - (Adj-)', 'Koreksi pengurangan (barang rusak/hilang)'),
    ], 'Tipe', 'Keterangan'))
    story.append(note_box(
        '<b>Catatan:</b> Gerakan stok dari invoice penjualan/pembelian dicatat otomatis. '
        'Gunakan gerakan manual hanya untuk adjustment dan koreksi.'
    ))
    story.append(heading2('11.3 Proses Produksi'))
    story.append(body(
        'Catat proses penggilingan: gabah (input) menjadi beras, bekatul, dan produk sampingan (output). '
        'Sistem menghitung rendemen otomatis.'
    ))
    story.append(body('<b>Contoh:</b>'))
    rows = [
        ['Komponen', 'Item', 'Kuantitas'],
        ['INPUT', 'Gabah Kering Panen', '5.000 kg'],
        ['OUTPUT', 'Beras Premium', '3.000 kg (60%)'],
        ['OUTPUT', 'Bekatul', '500 kg (10%)'],
        ['SUSUT', '(Loss)', '1.500 kg (30%)'],
    ]
    t = Table(rows, colWidths=[2.5*cm, 5*cm, 4*cm])
    t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('BACKGROUND', (0, 1), (-1, 1), C_AMBER_LT),
    ]))
    story.append(t)
    story.append(PageBreak())


# ── Chapter 12: Transaksi Berulang ──────────────────────────

def ch12_recurring(story: list) -> None:
    story.append(heading1('12. Transaksi Berulang'))
    story.append(body(
        'Modul ini memungkinkan Anda membuat <b>template jurnal</b> yang bisa dieksekusi '
        'berulang kali (bulanan, mingguan, dll). Cocok untuk beban rutin seperti sewa, gaji tetap, '
        'atau biaya bulanan lainnya.'
    ))
    story.append(heading2('12.1 Membuat Template'))
    story.append(numbered_list([
        'Buka halaman <b>Transaksi Berulang</b> di sidebar',
        'Klik <b>"+ Buat Template"</b>',
        'Isi nama template, frekuensi (Harian/Mingguan/Bulanan/Tahunan)',
        'Isi baris jurnal: akun debit, akun kredit, dan jumlah',
        'Klik <b>Simpan</b>',
    ]))
    story.append(heading2('12.2 Mengeksekusi Template'))
    story.append(body(
        'Klik tombol <b>"Execute"</b> pada template yang diinginkan. '
        'Sistem akan membuat jurnal baru sesuai data template dengan tanggal hari ini. '
        'Template bisa dieksekusi berkali-kali — setiap eksekusi menghasilkan jurnal terpisah.'
    ))
    story.append(heading2('12.3 Contoh Penggunaan'))
    story.append(field_table([
        ('Sewa Gedung Bulanan', 'DR Beban Sewa (6.19) Rp 5.000.000 / CR Bank BRI (1.1.2) Rp 5.000.000'),
        ('Internet Bulanan', 'DR Beban Internet (6.1) Rp 500.000 / CR Petty Cash (1.1.1) Rp 500.000'),
        ('Gaji Tetap', 'DR Beban Gaji (6.4) Rp 15.000.000 / CR Bank BRI (1.1.2) Rp 15.000.000'),
    ], 'Template', 'Detail Jurnal'))
    story.append(heading2('12.4 Edit & Hapus'))
    story.append(bullet_list([
        '<b>Edit template</b>: ubah nominal atau akun, eksekusi berikutnya menggunakan data terbaru',
        '<b>Hapus template</b>: template dihapus, jurnal yang sudah dibuat sebelumnya TIDAK terpengaruh',
    ]))
    story.append(PageBreak())


# ── Chapter 13: Rekonsiliasi Bank ───────────────────────────

def ch13_reconciliation(story: list) -> None:
    story.append(heading1('13. Rekonsiliasi Bank'))
    story.append(body(
        'Modul ini untuk mencocokkan mutasi rekening bank (dari rekening koran) '
        'dengan catatan di buku besar. Proses ini memastikan tidak ada transaksi yang terlewat.'
    ))
    story.append(heading2('13.1 Membuat Rekonsiliasi'))
    story.append(numbered_list([
        'Buka halaman <b>Rekonsiliasi Bank</b> di sidebar',
        'Klik <b>"+ Rekonsiliasi Baru"</b>',
        'Pilih <b>akun bank</b> (hanya akun kas/bank 1.1.x yang bisa dipilih)',
        'Isi <b>Statement Balance</b> (saldo di rekening koran bank)',
        'Pilih periode (tanggal mulai - selesai)',
        'Klik <b>Simpan</b>',
    ]))
    story.append(heading2('13.2 Menambah Statement Items'))
    story.append(body('Setelah rekonsiliasi dibuat, tambahkan baris mutasi dari rekening koran:'))
    story.append(field_table([
        ('Tanggal', 'Tanggal mutasi di rekening koran'),
        ('Deskripsi', 'Keterangan transaksi dari bank'),
        ('Debit', 'Uang masuk ke rekening'),
        ('Kredit', 'Uang keluar dari rekening'),
    ]))
    story.append(heading2('13.3 Matching'))
    story.append(body('Cocokkan setiap statement item dengan entri ledger:'))
    story.append(bullet_list([
        'Klik <b>"Match"</b> pada statement item untuk menandai sudah cocok dengan buku besar',
        'Klik <b>"Unmatch"</b> untuk membatalkan pencocokan',
        'Selisih antara statement balance dan book balance ditampilkan di atas',
    ]))
    story.append(heading2('13.4 Complete Reconciliation'))
    story.append(body(
        'Setelah semua item dicocokkan, klik <b>"Complete"</b> untuk menyelesaikan rekonsiliasi. '
        'Status berubah dari Draft menjadi Completed.'
    ))
    story.append(PageBreak())


# ── Chapter 14: Laporan Keuangan ────────────────────────────

def ch14_laporan(story: list) -> None:
    story.append(heading1('14. Laporan Keuangan'))
    story.append(body(
        f'Keuangan menyediakan <b>7 jenis laporan</b>. Setiap laporan dapat dicetak, '
        f'diekspor ke PDF (dengan header {COMPANY}), atau diekspor ke Excel.'
    ))

    story.append(heading2('14.1 Neraca Saldo (Trial Balance)'))
    story.append(body(
        'Menampilkan saldo debit dan kredit setiap akun. '
        '<b>Total debit harus sama dengan total kredit.</b> Jika tidak seimbang, tampil peringatan.'
    ))
    story.append(bullet_list([
        'Filter: rentang tanggal (Dari — s/d)',
        'Pencarian: berdasarkan nama atau nomor akun',
        'Kolom: No. Akun, Nama Akun, Debit, Kredit',
    ]))
    story.append(divider())

    story.append(heading2('14.2 Laporan Laba Rugi (Profit & Loss)'))
    story.append(body('Menampilkan performa keuangan dalam periode tertentu:'))
    story.append(bullet_list([
        '<b>Seksi I</b>: Pendapatan Operasional (akun 4.x)',
        '<b>Seksi II</b>: Beban Pokok Penjualan (akun 5)',
        '<b>Seksi III</b>: Beban Operasional (akun 6.x)',
        '<b>Seksi IV</b>: Pendapatan & Beban Diluar Usaha (akun 7.x)',
        '<b>Footer</b>: Laba (Rugi) Bersih = Total Pendapatan - Total Beban',
    ]))
    story.append(divider())

    story.append(heading2('14.3 Neraca (Balance Sheet)'))
    story.append(body('Posisi keuangan pada tanggal tertentu. <b>Aset = Liabilitas + Ekuitas</b>.'))
    story.append(bullet_list([
        'Layout 2 kolom: Kiri (Aset), Kanan (Liabilitas + Ekuitas)',
        '<b>Laba Tahun Berjalan</b> otomatis dihitung dan ditampilkan di seksi Ekuitas',
        'Peringatan jika A ≠ L + E',
    ]))
    story.append(divider())

    story.append(heading2('14.4 Laporan Arus Kas (Cash Flow)'))
    story.append(field_table([
        ('Aktivitas Operasi', 'Kas dari bisnis: penjualan, pembelian, gaji, listrik'),
        ('Aktivitas Investasi', 'Kas dari jual/beli aset tetap'),
        ('Aktivitas Pendanaan', 'Kas dari modal, pinjaman, dividen'),
    ], 'Aktivitas', 'Penjelasan'))
    story.append(body('Footer: <b>Perubahan Kas Bersih</b> = Operasi + Investasi + Pendanaan'))
    story.append(divider())

    story.append(heading2('14.5 Aging Piutang (Aging AR)'))
    story.append(body('Analisis umur piutang berdasarkan jatuh tempo invoice:'))
    story.append(field_table([
        ('Belum Jatuh Tempo', 'Invoice belum melewati due date (hijau)'),
        ('1-30 Hari', 'Terlambat 1 s/d 30 hari'),
        ('31-60 Hari', 'Terlambat 31 s/d 60 hari (kuning)'),
        ('61-90 Hari', 'Terlambat 61 s/d 90 hari (oranye)'),
        ('>90 Hari', 'KRITIS — terlambat lebih dari 90 hari (merah)'),
    ], 'Bucket', 'Keterangan'))
    story.append(divider())

    story.append(heading2('14.6 Aging Hutang (Aging AP)'))
    story.append(body(
        'Sama seperti Aging Piutang, tetapi untuk hutang ke supplier. '
        'Membantu memastikan pembayaran tepat waktu.'
    ))
    story.append(divider())

    story.append(heading2('14.7 Laporan Pajak (Tax Report)'))
    story.append(body('Menampilkan rekap PPN dalam periode tertentu:'))
    story.append(field_table([
        ('PPN Keluaran', 'Pajak yang dipungut dari penjualan (2.2.1)'),
        ('PPN Masukan', 'Pajak yang dibayar dari pembelian (1.5.3)'),
        ('Kurang/Lebih Bayar', 'Selisih PPN Keluaran - PPN Masukan'),
    ], 'Komponen', 'Penjelasan'))
    story.append(divider())

    story.append(heading2('14.8 Ekspor & Cetak'))
    story.append(bullet_list([
        f'<b>Cetak</b> — Dialog cetak browser (Ctrl+P). Layout A4, header {COMPANY} otomatis.',
        '<b>Export PDF</b> — Download laporan format PDF.',
        '<b>Export Excel</b> — Download data format .xlsx untuk analisis lanjutan.',
    ]))
    story.append(PageBreak())


# ── Chapter 15: Notifikasi ──────────────────────────────────

def ch15_notifikasi(story: list) -> None:
    story.append(heading1('15. Notifikasi'))
    story.append(body(
        'Sistem notifikasi otomatis memperingatkan Anda tentang kondisi yang perlu perhatian. '
        'Ikon lonceng di header bar menampilkan jumlah notifikasi yang belum dibaca.'
    ))
    story.append(heading2('15.1 Tipe Notifikasi'))
    story.append(field_table([
        ('Stok Rendah (Low Stock)', 'Item persediaan yang stoknya di bawah minimum. '
         'Contoh: "Gabah Kering Giling — Stok: 500 / Min: 500 Kg"'),
        ('Invoice Jatuh Tempo (Overdue)', 'Invoice yang sudah melewati tanggal jatuh tempo. '
         'Berlaku untuk invoice penjualan maupun pembelian.'),
    ], 'Tipe', 'Penjelasan'))
    story.append(heading2('15.2 Mengelola Notifikasi'))
    story.append(bullet_list([
        'Klik ikon <b>lonceng</b> di header untuk melihat daftar notifikasi',
        'Klik notifikasi untuk menandai <b>sudah dibaca (Mark as Read)</b>',
        'Klik <b>"Tandai Semua Dibaca"</b> untuk membersihkan semua',
        'Notifikasi tidak duplikat — satu entitas hanya menghasilkan satu notifikasi',
    ]))
    story.append(heading2('15.3 Trigger Manual'))
    story.append(body(
        'Admin dapat memicu pengecekan notifikasi secara manual dari halaman Notifikasi. '
        'Sistem akan memeriksa seluruh stok dan invoice, lalu membuat notifikasi baru jika diperlukan.'
    ))
    story.append(PageBreak())


# ── Chapter 16: Manajemen User ──────────────────────────────

def ch16_users(story: list) -> None:
    story.append(heading1('16. Manajemen Pengguna'))
    story.append(body(
        'Halaman ini hanya bisa diakses oleh <b>Admin</b>. Digunakan untuk membuat, '
        'mengedit, dan menonaktifkan akun pengguna.'
    ))
    story.append(heading2('16.1 Membuat User Baru'))
    story.append(numbered_list([
        'Klik <b>"+ Tambah User"</b>',
        'Isi nama, email, password, dan pilih role',
        'Klik <b>Simpan</b>',
    ]))
    story.append(heading2('16.2 Validasi Password'))
    story.append(body('Password harus memenuhi kriteria:'))
    story.append(bullet_list([
        'Minimal <b>8 karakter</b>',
        'Mengandung <b>huruf besar</b> (A-Z)',
        'Mengandung <b>angka</b> (0-9)',
        'Mengandung <b>karakter spesial</b> (!@#$%^&*)',
    ]))
    story.append(heading2('16.3 Role & Hak Akses'))
    story.append(field_table([
        ('Admin', 'Akses penuh. Bisa kelola user, settings, audit trail, tutup buku.'),
        ('Accountant', 'Buat invoice, jurnal, pembayaran. Lihat laporan. Tidak bisa kelola user.'),
        ('StaffProduksi', 'Akses pembelian, inventori, pelanggan/vendor. Tidak bisa akses keuangan.'),
        ('Viewer', 'Read-only. Lihat dashboard, laporan, buku besar. Tidak bisa membuat/mengubah data.'),
    ], 'Role', 'Hak Akses'))
    story.append(heading2('16.4 Menonaktifkan User'))
    story.append(body(
        'Klik menu aksi pada user, pilih <b>Nonaktifkan</b>. User yang dinonaktifkan '
        'tidak bisa login. Data dan riwayat aktivitasnya tetap tersimpan di sistem.'
    ))
    story.append(heading2('16.5 Ganti Password'))
    story.append(body(
        'Setiap user bisa mengganti password sendiri dari ikon kunci di header bar. '
        'Admin juga bisa mereset password user lain dari halaman Manajemen User.'
    ))
    story.append(PageBreak())


# ── Chapter 17: Pengaturan ──────────────────────────────────

def ch17_pengaturan(story: list) -> None:
    story.append(heading1('17. Pengaturan'))
    story.append(body(
        'Halaman pengaturan terdiri dari 3 tab: <b>Tahun Buku</b>, <b>Profil Perusahaan</b>, '
        'dan <b>Tentang Aplikasi</b>. Hanya Admin yang bisa mengakses.'
    ))
    story.append(heading2('17.1 Tahun Buku (Fiscal Year)'))
    story.append(body(
        'Tahun buku mendefinisikan periode akuntansi. Semua transaksi harus masuk dalam '
        'tahun buku yang sedang terbuka (Open).'
    ))
    story.append(body('<b>Membuat Tahun Buku Baru:</b>'))
    story.append(numbered_list([
        'Klik <b>"+ Tahun Buku Baru"</b>',
        'Isi nama (contoh: "2027"), tanggal mulai, dan tanggal selesai',
        'Sistem validasi agar tidak tumpang tindih dengan tahun buku lain',
    ]))
    story.append(body('<b>Menutup Tahun Buku (Tutup Buku):</b>'))
    story.append(numbered_list([
        'Klik tombol <b>"Tutup Buku"</b> pada kartu tahun buku',
        'Sistem menghitung laba/rugi bersih dari akun revenue (4.x) dan expense (5-7.x)',
        'Transfer laba ke <b>Laba Ditahan (3.2)</b>',
        'Reset saldo akun pendapatan & beban untuk tahun tersebut',
        'Status berubah menjadi <b>Closed</b> — tidak ada transaksi baru yang bisa diposting',
    ]))
    story.append(warn_box(
        '<b>PERINGATAN:</b> Tutup buku adalah proses PERMANEN. Pastikan semua transaksi '
        'sudah dicatat dengan benar. Tidak bisa dibatalkan setelah ditutup.'
    ))
    story.append(heading2('17.2 Profil Perusahaan'))
    story.append(field_table([
        ('Logo', 'Upload PNG/JPG/SVG (maks 2MB). Tampil di sidebar dan laporan PDF.'),
        ('Nama Perusahaan', 'Tampil di header, sidebar, dan laporan'),
        ('Alamat', 'Alamat kantor/pabrik'),
        ('Telepon', 'Nomor telepon utama'),
        ('Email', 'Email resmi perusahaan'),
        ('NPWP', 'Nomor Pokok Wajib Pajak'),
        ('Mata Uang', 'Default: IDR (Rupiah Indonesia)'),
    ]))
    story.append(heading2('17.3 Tentang Aplikasi'))
    story.append(body('Menampilkan versi, changelog, dan tombol <b>Periksa Pembaruan</b>.'))
    story.append(PageBreak())


# ── Chapter 18: Jejak Audit ─────────────────────────────────

def ch18_audit(story: list) -> None:
    story.append(heading1('18. Jejak Audit'))
    story.append(body(
        'Halaman ini mencatat <b>seluruh aktivitas</b> yang dilakukan pengguna di sistem. '
        'Hanya Admin yang bisa mengakses. Audit trail tidak bisa dihapus atau dimodifikasi.'
    ))
    story.append(heading2('18.1 Informasi yang Dicatat'))
    story.append(field_table([
        ('Timestamp', 'Waktu aktivitas dilakukan'),
        ('User', 'Pengguna yang melakukan aksi'),
        ('Action', 'Jenis aksi: CREATE, UPDATE, DELETE, CANCEL, CLOSE'),
        ('Entity', 'Objek yang dikenai aksi: Invoice, Payment, Journal, COA, dll.'),
        ('Entity ID', 'ID unik objek'),
        ('Detail', 'Informasi tambahan (sebelum & sesudah perubahan)'),
    ], 'Kolom', 'Penjelasan'))
    story.append(heading2('18.2 Contoh Aktivitas yang Tercatat'))
    story.append(bullet_list([
        'CREATE_INVOICE — Membuat invoice penjualan/pembelian baru',
        'CREATE_PAYMENT — Mencatat pembayaran',
        'CREATE_JOURNAL — Membuat jurnal manual',
        'CREATE_PARTY — Menambah pelanggan/vendor',
        'UPDATE_SETTINGS — Mengubah pengaturan perusahaan',
        'CANCEL_INVOICE — Membatalkan invoice',
        'CLOSE_FISCAL_YEAR — Menutup tahun buku',
        'CREATE_USER — Membuat pengguna baru',
    ]))
    story.append(heading2('18.3 Filter'))
    story.append(body('Gunakan filter untuk mempersempit tampilan:'))
    story.append(bullet_list([
        'Filter berdasarkan <b>jenis aksi</b> (CREATE, UPDATE, DELETE, dll.)',
        'Filter berdasarkan <b>pengguna</b>',
        'Filter berdasarkan <b>rentang tanggal</b>',
        'Pencarian teks pada kolom detail',
    ]))
    story.append(PageBreak())


# ── Chapter 19: Tips & Trik ─────────────────────────────────

def ch19_tips(story: list) -> None:
    story.append(heading1('19. Tips & Trik'))

    story.append(heading2('19.1 Alur Kerja Harian'))
    story.append(numbered_list([
        'Cek <b>Dashboard</b> setiap pagi untuk melihat posisi keuangan',
        'Periksa <b>Notifikasi</b> — adakah stok rendah atau invoice jatuh tempo?',
        'Catat <b>invoice pembelian</b> saat gabah diterima dari supplier',
        'Catat <b>proses produksi</b> setelah penggilingan selesai',
        'Buat <b>invoice penjualan</b> saat beras dikirim ke pelanggan',
        'Catat <b>pembayaran</b> saat menerima atau mengirim uang',
        'Catat <b>pengeluaran harian</b> (bensin, ATK, dll.) di Bank & Kas',
        'Di akhir bulan, eksekusi <b>transaksi berulang</b> (sewa, gaji tetap)',
        'Lakukan <b>rekonsiliasi bank</b> saat menerima rekening koran',
        'Cetak <b>Laporan Keuangan</b> bulanan',
    ]))

    story.append(heading2('19.2 Siklus Pembelian'))
    story.append(body(
        'Supplier → Invoice Pembelian → (Opsional: Uang Muka) → Bayar Hutang → Lunas'
    ))
    story.append(numbered_list([
        'Daftarkan supplier di <b>Pelanggan & Vendor</b>',
        '(Opsional) Buat <b>Uang Muka Vendor</b> jika diminta deposit',
        'Buat <b>Invoice Pembelian</b> saat barang diterima',
        'Bayar melalui <b>Bank & Kas → Bayar Hutang</b>',
        'Atau alokasikan <b>Uang Muka</b> ke invoice',
    ]))

    story.append(heading2('19.3 Siklus Penjualan'))
    story.append(body(
        'Customer → Invoice Penjualan → Terima Pembayaran → Lunas'
    ))
    story.append(numbered_list([
        'Daftarkan pelanggan di <b>Pelanggan & Vendor</b>',
        'Buat <b>Invoice Penjualan</b> saat barang dikirim',
        'Terima pembayaran di <b>Bank & Kas → Terima Pembayaran</b>',
        'Status otomatis berubah dari Submitted → PartiallyPaid → Paid',
    ]))

    story.append(heading2('19.4 Shortcut Keyboard'))
    story.append(field_table([
        ('Ctrl + K', 'Buka pencarian cepat'),
        ('?', 'Tampilkan daftar shortcut'),
        ('Escape', 'Tutup modal/panel'),
        ('Tab', 'Berpindah antar field'),
        ('Ctrl + P', 'Cetak halaman/laporan'),
    ], 'Tombol', 'Fungsi'))

    story.append(heading2('19.5 Troubleshooting'))
    story.append(field_table([
        ('Tidak bisa login', 'Periksa email & password. Setelah 10x gagal, tunggu 15 menit.'),
        ('Invoice gagal disimpan', 'Pastikan pelanggan/supplier dipilih, minimal 1 item, qty & harga > 0.'),
        ('Jurnal tidak seimbang', 'Total debit = total kredit. Satu baris hanya boleh debit ATAU kredit.'),
        ('Akun tidak bisa dihapus', 'Akun masih punya sub-akun, transaksi, atau saldo tidak nol.'),
        ('Mitra tidak bisa dihapus', 'Mitra punya transaksi — akan dinonaktifkan, bukan dihapus.'),
        ('Laporan kosong', 'Pastikan rentang tanggal sesuai dan tahun buku terbuka.'),
        ('Transaksi ditolak', 'Periksa apakah tahun buku periode tersebut masih Open.'),
        ('Stok negatif', 'Sistem mengizinkan stok negatif. Periksa gerakan stok dan koreksi dengan Adj+.'),
    ], 'Masalah', 'Solusi'))
    story.append(PageBreak())


# ── Appendix A: COA ─────────────────────────────────────────

def appendix_coa(story: list) -> None:
    story.append(heading1('Lampiran A: Daftar Akun Default'))
    story.append(body(f'Berikut adalah akun-akun default sistem ({COMPANY}):'))
    story.append(Spacer(1, 4))

    groups = [
        ('1 — ASET', [
            ('1.1', 'Kas & Bank', 'Grup'),
            ('1.1.1', 'Petty Cash', 'Detail'),
            ('1.1.2', 'Bank BRI', 'Detail'),
            ('1.1.3', 'Bank Mandiri', 'Detail'),
            ('1.1.4', 'Bank BRI 2', 'Detail'),
            ('1.1.5', 'Bank BCA', 'Detail'),
            ('1.2', 'Piutang Usaha', 'Grup'),
            ('1.2.1', 'Piutang Usaha (Dagang)', 'Detail'),
            ('1.2.2', 'Piutang Karyawan', 'Detail'),
            ('1.2.3', 'Piutang Owner', 'Detail'),
            ('1.2.4', 'Piutang Lain-lain', 'Detail'),
            ('1.3', 'Uang Muka Pembelian', 'Detail'),
            ('1.4', 'Persediaan', 'Grup — 32 sub-akun'),
            ('1.5', 'Aset Lancar Lainnya', 'Grup'),
            ('1.5.1', 'Sewa Gedung Dibayar Dimuka', 'Detail'),
            ('1.5.3', 'PPN Masukan', 'Detail'),
            ('1.6', 'Aset Tetap', 'Grup'),
            ('1.6.1-5', 'Tanah, Gedung, Kendaraan, Mesin, Inventaris', 'Detail'),
            ('1.7', 'Akum. Depresiasi', 'Grup'),
            ('1.7.1-4', 'Akum. Penyusutan (Gedung/Kendaraan/Mesin/Inventaris)', 'Detail'),
        ]),
        ('2 — LIABILITAS', [
            ('2.1.1', 'Hutang Usaha (Dagang)', 'Detail'),
            ('2.1.2', 'Uang Muka Penjualan', 'Detail'),
            ('2.2', 'Kewajiban Jangka Pendek', 'Grup'),
            ('2.2.1', 'PPN Keluaran', 'Detail'),
            ('2.2.2-6', 'PPh, Hutang Gaji, dll.', 'Detail'),
            ('2.3', 'Hutang Jangka Panjang', 'Grup'),
        ]),
        ('3 — EKUITAS', [
            ('3.1', 'Equitas Saldo Awal', 'Detail'),
            ('3.2', 'Laba Ditahan', 'Detail — target tutup buku'),
            ('3.3', 'Modal Saham', 'Detail'),
            ('3.4', 'Laba Tahun Berjalan', 'Detail — computed'),
        ]),
        ('4 — PENDAPATAN', [
            ('4.1', 'Penjualan', 'Detail — auto dari SI'),
            ('4.2', 'Pendapatan Jasa', 'Detail'),
            ('4.3', 'Retur Penjualan', 'Detail'),
            ('4.4', 'Diskon Penjualan', 'Detail'),
        ]),
        ('5 — HPP', [
            ('5', 'Beban Pokok Penjualan', 'Detail — auto dari SI'),
        ]),
        ('6 — BEBAN OPERASIONAL', [
            ('6.1', 'Beban Internet', 'Detail'),
            ('6.4', 'Beban Gaji, Upah & Honorer', 'Detail'),
            ('6.5', 'Beban Bonus, Pesangon', 'Detail'),
            ('6.11', 'Beban Listrik', 'Detail'),
            ('6.19', 'Beban Sewa Gedung', 'Detail'),
            ('6.25', 'Beban Pemeliharaan Mesin', 'Detail'),
            ('...', '(26 akun beban total)', ''),
        ]),
        ('7 — PENDAPATAN & BEBAN DILUAR USAHA', [
            ('7.1.1', 'Pendapatan Bunga Deposito', 'Detail'),
            ('7.2.1', 'Beban Bunga Pinjaman', 'Detail'),
            ('7.2.2', 'Beban Adm. Bank & Cek/Giro', 'Detail'),
            ('...', '(14 sub-akun total)', ''),
        ]),
    ]

    for group_title, accounts in groups:
        story.append(heading3(group_title))
        header = ['No. Akun', 'Nama Akun', 'Jenis']
        data = [header] + [[a[0], a[1], a[2]] for a in accounts]
        t = Table(data, colWidths=[2.5*cm, 7.5*cm, 3.5*cm])
        t.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7.5),
            ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
            ('FONTNAME', (0, 1), (0, -1), 'Courier'),
        ]))
        story.append(t)
        story.append(Spacer(1, 4))

    story.append(PageBreak())


# ── Appendix B: Alur Bisnis ─────────────────────────────────

def appendix_alur(story: list) -> None:
    story.append(heading1('Lampiran B: Alur Bisnis'))

    story.append(heading2('B.1 Siklus Pembelian Gabah'))
    story.append(body('<b>Petani/Supplier → Perusahaan</b>'))
    flow_data = [
        ['No', 'Langkah', 'Modul', 'Jurnal Otomatis'],
        ['1', 'Daftarkan supplier', 'Pelanggan & Vendor', '—'],
        ['2', 'Buat uang muka (opsional)', 'Uang Muka Vendor', 'Dr 1.3 / Cr 1.1.x'],
        ['3', 'Terima gabah, buat invoice', 'Pembelian', 'Dr 1.4.0 / Cr 2.1.1'],
        ['4', 'Bayar supplier', 'Bank & Kas', 'Dr 2.1.1 / Cr 1.1.x'],
        ['5', 'Atau apply uang muka', 'Uang Muka Vendor', 'Dr 2.1.1 / Cr 1.3'],
    ]
    t = Table(flow_data, colWidths=[0.8*cm, 3.5*cm, 3.5*cm, 5.5*cm])
    t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
    ]))
    story.append(t)
    story.append(Spacer(1, 8))

    story.append(heading2('B.2 Siklus Produksi'))
    flow2 = [
        ['No', 'Langkah', 'Modul', 'Efek'],
        ['1', 'Pastikan stok gabah cukup', 'Stok & Gudang', 'Cek currentStock'],
        ['2', 'Buat Production Run', 'Stok & Gudang → Produksi', 'Input: GKP keluar, Output: Beras masuk'],
        ['3', 'Verifikasi rendemen', 'Dashboard', 'Rata-rata rendemen tercatat'],
    ]
    t2 = Table(flow2, colWidths=[0.8*cm, 3.5*cm, 3.8*cm, 5.2*cm])
    t2.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, 0), C_TEAL),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
    ]))
    story.append(t2)
    story.append(Spacer(1, 8))

    story.append(heading2('B.3 Siklus Penjualan Beras'))
    flow3 = [
        ['No', 'Langkah', 'Modul', 'Jurnal Otomatis'],
        ['1', 'Daftarkan pelanggan', 'Pelanggan & Vendor', '—'],
        ['2', 'Buat invoice penjualan', 'Penjualan', 'Dr 1.2.1 / Cr 4.1 + Dr 5 / Cr 1.4.0'],
        ['3', 'Kirim beras ke pelanggan', 'Fisik (di luar sistem)', 'Stok sudah otomatis berkurang'],
        ['4', 'Terima pembayaran', 'Bank & Kas', 'Dr 1.1.x / Cr 1.2.1'],
    ]
    t3 = Table(flow3, colWidths=[0.8*cm, 3.5*cm, 3.5*cm, 5.5*cm])
    t3.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, 0), C_GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
    ]))
    story.append(t3)
    story.append(Spacer(1, 8))

    story.append(heading2('B.4 Tutup Buku Akhir Tahun'))
    story.append(numbered_list([
        'Pastikan <b>semua transaksi</b> periode tersebut sudah dicatat',
        'Lakukan <b>rekonsiliasi bank</b> untuk semua rekening',
        'Cetak semua <b>laporan keuangan</b> sebagai arsip',
        'Verifikasi <b>Trial Balance</b>: total debit = total kredit',
        'Buka halaman <b>Pengaturan → Tahun Buku</b>',
        'Klik <b>"Tutup Buku"</b> pada tahun yang akan ditutup',
        'Sistem otomatis: transfer laba → Laba Ditahan (3.2), reset revenue/expense',
        '<b>Buat Tahun Buku baru</b> untuk periode berikutnya',
    ]))
    story.append(warn_box(
        '<b>PERHATIAN:</b> Setelah tutup buku, tidak ada transaksi yang bisa diposting '
        'ke tahun buku tersebut. Pastikan semua data sudah benar sebelum menutup!'
    ))


# ── Appendix C: Diagram Korelasi COA ───────────────────────

def _flow_table(rows: list[list[str]], header_color: HexColor = C_PRIMARY,
                col_widths=None) -> Table:
    """Helper: styled flow/journal table for appendix C."""
    widths = col_widths or [0.8*cm, 3.5*cm, 3.5*cm, 5.5*cm]
    t = Table(rows, colWidths=widths)
    t.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, 0), header_color),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    return t


def appendix_coa_diagram(story: list) -> None:
    story.append(PageBreak())
    story.append(heading1('Lampiran C: Diagram Korelasi COA & Modul'))
    story.append(body(
        'Lampiran ini menunjukkan hubungan antara setiap modul di aplikasi Keuangan '
        'dengan akun-akun COA yang terlibat. Setiap transaksi menghasilkan jurnal '
        'otomatis (double-entry) yang mempengaruhi akun-akun tertentu.'
    ))
    story.append(Spacer(1, 6))

    # ── C.1 Peta Overview ──
    story.append(heading2('C.1 Peta Hubungan Modul & Akun COA'))
    story.append(body(
        'Berikut adalah peta besar yang menunjukkan modul utama dan akun COA '
        'yang terpengaruh di setiap modul:'
    ))
    overview_data = [
        ['Modul', 'Akun Debit (DR)', 'Akun Kredit (CR)'],
        ['Pembelian', '1.4.0 Persediaan, 1.5.3 PPN Masukan', '2.1.1 Hutang Usaha'],
        ['Penjualan', '1.2.1 Piutang, 5 HPP', '4.1 Penjualan, 2.2.1 PPN Keluaran, 1.4.0 Persediaan'],
        ['Bank & Kas\n(Terima Bayar)', '1.1.x Kas/Bank', '1.2.1 Piutang Usaha'],
        ['Bank & Kas\n(Bayar Hutang)', '2.1.1 Hutang Usaha', '1.1.x Kas/Bank'],
        ['Bank & Kas\n(Pengeluaran)', '6.x Beban Operasional', '1.1.x Kas/Bank'],
        ['Bank & Kas\n(Pinbuk)', '1.1.x Bank Tujuan', '1.1.x Bank Asal'],
        ['Uang Muka Vendor\n(Buat Deposit)', '1.3 Uang Muka Pembelian', '1.1.x Kas/Bank'],
        ['Uang Muka Vendor\n(Apply)', '2.1.1 Hutang Usaha', '1.3 Uang Muka Pembelian'],
        ['Stok & Gudang\n(Adj. Masuk)', '1.4.x Persediaan Item', 'Akun offset (beban/ekuitas)'],
        ['Stok & Gudang\n(Adj. Keluar)', 'Akun offset (beban)', '1.4.x Persediaan Item'],
        ['Tutup Buku', '4.x Pendapatan, 7.1 Pend. Luar Usaha', '5-7.x Beban, 3.2 Laba Ditahan'],
    ]
    t_ov = Table(overview_data, colWidths=[3.5*cm, 4.8*cm, 5*cm])
    t_ov.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(t_ov)
    story.append(Spacer(1, 10))

    # ── C.2 Siklus Pembelian ──
    story.append(heading2('C.2 Siklus Pembelian (Purchase Cycle)'))
    story.append(body(
        '<b>Alur:</b> Supplier mengirim barang → Buat Invoice Pembelian → '
        'Stok bertambah → Bayar Hutang via Bank & Kas → Invoice lunas.'
    ))
    purchase_journal = [
        ['Langkah', 'Akun', 'Debit', 'Kredit', 'Efek'],
        ['Invoice Pembelian\nGKP 5.000 Kg @ Rp 5.500\n+ PPN 11%',
         '1.4.0 Persediaan', 'Rp 27.500.000', '', 'Aset naik (stok)'],
        ['', '1.5.3 PPN Masukan', 'Rp 3.025.000', '', 'Pajak dibayar dimuka'],
        ['', '2.1.1 Hutang Usaha', '', 'Rp 30.525.000', 'Liabilitas naik'],
        ['Bayar Hutang\nFull payment via Bank BRI',
         '2.1.1 Hutang Usaha', 'Rp 30.525.000', '', 'Liabilitas turun'],
        ['', '1.1.2 Bank BRI', '', 'Rp 30.525.000', 'Kas/Bank turun'],
    ]
    t_p = Table(purchase_journal, colWidths=[3*cm, 2.8*cm, 2.5*cm, 2.5*cm, 2.5*cm])
    t_p.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('SPAN', (0, 1), (0, 3)),  # merge Invoice rows
        ('SPAN', (0, 4), (0, 5)),  # merge Bayar rows
    ]))
    story.append(t_p)
    story.append(Spacer(1, 6))
    story.append(note_box(
        '<b>Catatan:</b> Jika menggunakan Uang Muka Vendor, pembayaran '
        'dilakukan via apply deposit (DR 2.1.1 / CR 1.3) bukan dari Bank langsung.'
    ))
    story.append(Spacer(1, 10))

    # ── C.3 Siklus Penjualan ──
    story.append(heading2('C.3 Siklus Penjualan (Sales Cycle)'))
    story.append(body(
        '<b>Alur:</b> Customer pesan barang → Buat Invoice Penjualan → '
        'HPP & stok otomatis tercatat → Terima Bayar via Bank & Kas → Invoice lunas.'
    ))
    sales_journal = [
        ['Langkah', 'Akun', 'Debit', 'Kredit', 'Efek'],
        ['Invoice Penjualan\nBeras 1.000 Kg @ Rp 14.000\n+ PPN 11%',
         '1.2.1 Piutang Usaha', 'Rp 15.540.000', '', 'Aset naik (tagihan)'],
        ['', '4.1 Penjualan', '', 'Rp 14.000.000', 'Revenue naik'],
        ['', '2.2.1 PPN Keluaran', '', 'Rp 1.540.000', 'Hutang pajak naik'],
        ['HPP Otomatis\n(harga perolehan beras)',
         '5 Beban Pokok Penjualan', 'Rp 8.000.000', '', 'Beban HPP naik'],
        ['', '1.4.0 Persediaan', '', 'Rp 8.000.000', 'Persediaan turun'],
        ['Terima Pembayaran\nFull payment ke Bank BCA',
         '1.1.5 Bank BCA', 'Rp 15.540.000', '', 'Kas/Bank naik'],
        ['', '1.2.1 Piutang Usaha', '', 'Rp 15.540.000', 'Piutang turun'],
    ]
    t_s = Table(sales_journal, colWidths=[3*cm, 2.8*cm, 2.5*cm, 2.5*cm, 2.5*cm])
    t_s.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('BACKGROUND', (0, 0), (-1, 0), C_GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('SPAN', (0, 1), (0, 3)),  # merge Invoice rows
        ('SPAN', (0, 4), (0, 5)),  # merge HPP rows
        ('SPAN', (0, 6), (0, 7)),  # merge Terima rows
    ]))
    story.append(t_s)
    story.append(Spacer(1, 6))
    story.append(tip_box(
        '<b>Penting:</b> HPP (Harga Pokok Penjualan) diposting otomatis saat invoice '
        'penjualan dibuat. Nilai HPP dihitung dari harga perolehan rata-rata persediaan.'
    ))
    story.append(Spacer(1, 10))

    # ── C.4 Siklus Stok & Produksi ──
    story.append(heading2('C.4 Siklus Stok & Produksi'))
    story.append(body(
        'Stok berubah melalui 4 cara: pembelian (stok masuk), produksi (transformasi), '
        'adjustment (koreksi), dan penjualan (stok keluar). Setiap perubahan stok '
        'mempengaruhi akun persediaan (1.4.x) di COA.'
    ))
    stock_data = [
        ['Aksi', 'Efek Stok', 'Efek Akun COA'],
        ['Invoice Pembelian\n(GKP 5.000 Kg)', 'GKP: 0 → 5.000 Kg',
         'DR 1.4.0 Persediaan naik'],
        ['Adjustment In\n(GKG 500 Kg @ Rp 6.000)', 'GKG: 0 → 500 Kg',
         'DR 1.4.0 Persediaan naik'],
        ['Produksi\n(GKP → Beras + Bekatul)',
         'GKP: 5.000 → 0\nBeras: 0 → 3.000\nBekatul: 0 → 500',
         'Stok pindah antar item\n(nilai persediaan total tetap)'],
        ['Adjustment Out\n(Bekatul 50 Kg rusak)', 'Bekatul: 500 → 450 Kg',
         'CR 1.4.0 Persediaan turun'],
        ['Invoice Penjualan\n(Beras 1.000 Kg)', 'Beras: 3.000 → 2.000 Kg',
         'DR 5 HPP naik\nCR 1.4.0 Persediaan turun'],
    ]
    t_st = Table(stock_data, colWidths=[3.5*cm, 4*cm, 5.8*cm])
    t_st.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('BACKGROUND', (0, 0), (-1, 0), C_TEAL),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(t_st)
    story.append(Spacer(1, 10))

    # ── C.5 Siklus Uang Muka Vendor ──
    story.append(heading2('C.5 Siklus Uang Muka Vendor'))
    story.append(body(
        '<b>Alur:</b> Buat deposit ke supplier → Invoice pembelian masuk → '
        'Apply deposit ke invoice → Invoice lunas (tanpa bayar dari bank).'
    ))
    deposit_journal = [
        ['Langkah', 'Akun', 'Debit', 'Kredit'],
        ['Buat Deposit Rp 20 jt', '1.3 Uang Muka', 'Rp 20.000.000', ''],
        ['', '1.1.2 Bank BRI', '', 'Rp 20.000.000'],
        ['Invoice Pembelian Rp 11 jt', '1.4.0 Persediaan', 'Rp 11.000.000', ''],
        ['', '2.1.1 Hutang Usaha', '', 'Rp 11.000.000'],
        ['Apply Deposit Rp 11 jt', '2.1.1 Hutang Usaha', 'Rp 11.000.000', ''],
        ['', '1.3 Uang Muka', '', 'Rp 11.000.000'],
    ]
    t_d = Table(deposit_journal, colWidths=[3.5*cm, 3.3*cm, 3.2*cm, 3.3*cm])
    t_d.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('BACKGROUND', (0, 0), (-1, 0), C_AMBER),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('SPAN', (0, 1), (0, 2)),
        ('SPAN', (0, 3), (0, 4)),
        ('SPAN', (0, 5), (0, 6)),
    ]))
    story.append(t_d)
    story.append(Spacer(1, 6))
    story.append(body(
        '<b>Hasil:</b> Invoice lunas, sisa deposit = Rp 9.000.000 '
        '(masih tercatat di akun 1.3 Uang Muka Pembelian).'
    ))
    story.append(Spacer(1, 10))

    # ── C.6 Pengeluaran Operasional ──
    story.append(heading2('C.6 Pengeluaran Operasional'))
    story.append(body(
        'Beban operasional dicatat via menu <b>Bank & Kas → Catat Pengeluaran</b>. '
        'Jurnal: DR akun Beban (6.x atau 7.x) / CR akun Kas/Bank (1.1.x).'
    ))
    expense_data = [
        ['Contoh Pengeluaran', 'Akun Debit', 'Akun Kredit', 'Jumlah'],
        ['Bayar listrik', '6.11 Beban Listrik', '1.1.1 Petty Cash', 'Rp 3.500.000'],
        ['Bayar gaji', '6.4 Beban Gaji', '1.1.2 Bank BRI', 'Rp 15.000.000'],
        ['Bayar sewa gedung', '6.19 Beban Sewa', '1.1.2 Bank BRI', 'Rp 5.000.000'],
        ['Bayar bensin', '6.3 Beban BBM', '1.1.1 Petty Cash', 'Rp 500.000'],
        ['Biaya admin bank', '7.2.2 Beban Adm. Bank', '1.1.2 Bank BRI', 'Rp 25.000'],
    ]
    t_e = Table(expense_data, colWidths=[3*cm, 3.3*cm, 3.3*cm, 3.7*cm])
    t_e.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('BACKGROUND', (0, 0), (-1, 0), C_RED),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(t_e)
    story.append(Spacer(1, 10))

    # ── C.7 Ringkasan Akun per Modul ──
    story.append(heading2('C.7 Ringkasan Akun COA per Modul'))
    story.append(body(
        'Tabel berikut merangkum seluruh akun COA yang disentuh oleh setiap modul:'
    ))

    summary_data = [
        ['Modul', 'Kode Akun', 'Nama Akun', 'Posisi'],
        # Pembelian
        ['Pembelian', '1.4.0', 'Persediaan (Umum)', 'DR'],
        ['', '1.5.3', 'PPN Masukan', 'DR'],
        ['', '2.1.1', 'Hutang Usaha', 'CR'],
        # Penjualan
        ['Penjualan', '1.2.1', 'Piutang Usaha', 'DR'],
        ['', '4.1', 'Penjualan', 'CR'],
        ['', '4.2', 'Pendapatan Jasa', 'CR'],
        ['', '2.2.1', 'PPN Keluaran', 'CR'],
        ['', '5', 'HPP', 'DR'],
        ['', '1.4.0', 'Persediaan', 'CR'],
        # Bank & Kas
        ['Bank & Kas', '1.1.1', 'Petty Cash', 'DR/CR'],
        ['', '1.1.2', 'Bank BRI', 'DR/CR'],
        ['', '1.1.3', 'Bank Mandiri', 'DR/CR'],
        ['', '1.1.5', 'Bank BCA', 'DR/CR'],
        ['', '1.2.1', 'Piutang Usaha', 'CR'],
        ['', '2.1.1', 'Hutang Usaha', 'DR'],
        ['', '6.x', 'Beban Operasional', 'DR'],
        # Stok
        ['Stok & Gudang', '1.4.0', 'Persediaan (Umum)', 'DR/CR'],
        ['', '1.4.1-32', 'Persediaan per item', 'DR/CR'],
        # Uang Muka
        ['Uang Muka', '1.3', 'Uang Muka Pembelian', 'DR'],
        ['', '1.1.x', 'Kas/Bank', 'CR'],
        ['', '2.1.1', 'Hutang Usaha', 'DR'],
        # Tutup Buku
        ['Tutup Buku', '4.x', 'Pendapatan', 'Reset → 0'],
        ['', '5-7.x', 'Beban', 'Reset → 0'],
        ['', '3.2', 'Laba Ditahan', 'CR'],
        ['', '3.4', 'Laba Tahun Berjalan', 'Computed'],
    ]
    t_sum = Table(summary_data, colWidths=[2.2*cm, 1.5*cm, 4.8*cm, 4.8*cm])
    t_sum.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('BACKGROUND', (0, 0), (-1, 0), C_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.3, C_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, C_BG]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        # Merge modul cells
        ('SPAN', (0, 1), (0, 3)),    # Pembelian
        ('SPAN', (0, 4), (0, 9)),    # Penjualan
        ('SPAN', (0, 10), (0, 16)),  # Bank & Kas
        ('SPAN', (0, 17), (0, 18)),  # Stok
        ('SPAN', (0, 19), (0, 21)),  # Uang Muka
        ('SPAN', (0, 22), (0, 25)),  # Tutup Buku
        ('FONTNAME', (0, 1), (0, -1), 'Helvetica-Bold'),
    ]))
    story.append(t_sum)
    story.append(Spacer(1, 8))
    story.append(tip_box(
        '<b>Prinsip Dasar:</b> Setiap transaksi SELALU menghasilkan jurnal seimbang '
        '(total Debit = total Kredit). Ini adalah jaminan integritas data keuangan di seluruh sistem.'
    ))


# ── Main Build ──────────────────────────────────────────────

def main() -> None:
    output_path = f'/Users/yay/Project/finance-pmd/docs/Keuangan-Panduan-Pengguna-v{VERSION}.pdf'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        topMargin=2*cm,
        bottomMargin=2*cm,
        leftMargin=2*cm,
        rightMargin=2*cm,
        title=f'Keuangan v{VERSION} — Panduan Pengguna',
        author=COMPANY,
        subject='Panduan Penggunaan Aplikasi ERP Keuangan',
    )

    styles = getSampleStyleSheet()
    story: list = []

    build_cover(story, styles)
    build_toc(story, styles)
    ch1_pendahuluan(story)
    ch2_memulai(story)
    ch3_dashboard(story)
    ch4_coa(story)
    ch5_buku_besar(story)
    ch6_penjualan(story)
    ch7_pembelian(story)
    ch8_bank_kas(story)
    ch9_uang_muka(story)
    ch10_parties(story)
    ch11_inventory(story)
    ch12_recurring(story)
    ch13_reconciliation(story)
    ch14_laporan(story)
    ch15_notifikasi(story)
    ch16_users(story)
    ch17_pengaturan(story)
    ch18_audit(story)
    ch19_tips(story)
    appendix_coa(story)
    appendix_alur(story)
    appendix_coa_diagram(story)

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f'PDF generated: {output_path}')
    print(f'Size: {os.path.getsize(output_path) / 1024:.0f} KB')


if __name__ == '__main__':
    main()
