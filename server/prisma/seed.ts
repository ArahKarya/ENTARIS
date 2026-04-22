import { PrismaClient, AccountType, RootType, UserRole, PartyType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding Keuangan...');

  // 1. Seed Fiscal Year
  const fiscalYear = await prisma.fiscalYear.upsert({
    where: { name: '2026' },
    update: {},
    create: {
      name: '2026',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    },
  });
  console.log('- Created Fiscal Year: 2026');

  // 2. Seed Users
  const defaultPassword = await bcrypt.hash('Admin123!', 12);
  const adminPassword = await bcrypt.hash('Adminarahkarya123!dsw', 12);

  const users = [
    { username: 'admin',    fullName: 'Administrator',   email: 'admin@arahkarya.com',     role: UserRole.Admin,         password: adminPassword   },
    { username: 'staff',    fullName: 'Staff Keuangan',  email: 'staff@keuangan.local',    role: UserRole.Accountant,    password: defaultPassword },
    { username: 'produksi', fullName: 'Staff Produksi',  email: 'produksi@keuangan.local', role: UserRole.StaffProduksi, password: defaultPassword },
    { username: 'viewer',   fullName: 'Viewer',          email: 'viewer@keuangan.local',   role: UserRole.Viewer,        password: defaultPassword },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { username: u.username, fullName: u.fullName, role: u.role, passwordHash: u.password },
      create: {
        username: u.username,
        fullName: u.fullName,
        email: u.email,
        passwordHash: u.password,
        role: u.role,
      },
    });
    console.log(`- Upserted User: ${u.email} (${u.role})`);
  }

  // 3. Seed COA — Standard Chart of Accounts (Indonesian PSAK baseline)
  const A = AccountType.ASSET;
  const L = AccountType.LIABILITY;
  const E = AccountType.EQUITY;
  const R = AccountType.REVENUE;
  const X = AccountType.EXPENSE;

  const coa: {
    accountNumber: string;
    name: string;
    accountType: AccountType;
    rootType: RootType;
    isGroup: boolean;
    parentNumber?: string;
  }[] = [
    // ═══════════════════════════════════════════
    // 1. ASET
    // ═══════════════════════════════════════════
    { accountNumber: '1', name: 'Aset', accountType: A, rootType: RootType.ASSET, isGroup: true },

    // 1.1 Kas & Bank
    { accountNumber: '1.1', name: 'Kas & Bank', accountType: A, rootType: RootType.ASSET, isGroup: true, parentNumber: '1' },
    { accountNumber: '1.1.1', name: 'Petty Cash', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.1' },
    { accountNumber: '1.1.2', name: 'Bank BRI', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.1' },
    { accountNumber: '1.1.3', name: 'Bank Mandiri', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.1' },
    { accountNumber: '1.1.4', name: 'Bank BRI 2', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.1' },
    { accountNumber: '1.1.5', name: 'Bank BCA', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.1' },

    // 1.2 Piutang Usaha
    { accountNumber: '1.2', name: 'Piutang Usaha', accountType: A, rootType: RootType.ASSET, isGroup: true, parentNumber: '1' },
    { accountNumber: '1.2.1', name: 'Piutang Usaha (Dagang)', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.2' },
    { accountNumber: '1.2.2', name: 'Piutang Karyawan', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.2' },
    { accountNumber: '1.2.3', name: 'Piutang Owner', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.2' },
    { accountNumber: '1.2.4', name: 'Piutang Lain-lain', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.2' },
    { accountNumber: '1.2.5', name: 'Cadangan Kerugian Piutang', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.2' },

    // 1.3 Uang Muka Pembelian
    { accountNumber: '1.3', name: 'Uang Muka Pembelian', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1' },

    // 1.4 Persediaan
    { accountNumber: '1.4', name: 'Persediaan', accountType: A, rootType: RootType.ASSET, isGroup: true, parentNumber: '1' },
    { accountNumber: '1.4.0', name: 'Persediaan (Umum)', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.1', name: 'Persediaan Gabah PW Basah', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.2', name: 'Persediaan Gabah Muncul', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.3', name: 'Persediaan Gabah KB Basah', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.4', name: 'Persediaan Gabah KB Kering', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.5', name: 'Persediaan Gabah IR Basah', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.6', name: 'Persediaan Gabah IR Kering', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.7', name: 'Persediaan Beras Kkebo (Batak)', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.8', name: 'Persediaan Beras HGL Gapoktan', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.9', name: 'Persediaan Beras PK Muncul', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.10', name: 'Persediaan Beras IR (Basri)', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.11', name: 'Persediaan Beras PK Kebo', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.12', name: 'Persediaan Beras Glosor IR (Basri)', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.13', name: 'Persediaan Beras Reject', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.14', name: 'Persediaan Menir Jitay', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.15', name: 'Persediaan Menir Gula', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.16', name: 'Persediaan Broken', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.17', name: 'Persediaan Menir Glosor / Bebek', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.18', name: 'Persediaan Saponan', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.19', name: 'Persediaan Reject 2', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.20', name: 'Persediaan Cruise 25 KG', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.21', name: 'Persediaan Cruise 50 KG', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.22', name: 'Persediaan Broken 50 KG', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.23', name: 'Persediaan Menir Jitay 50 KG', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.24', name: 'Persediaan Walemu 50 KG', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.25', name: 'Persediaan Walemu 25 KG', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.26', name: 'Persediaan Pagi Jaya 5 KG', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.27', name: 'Persediaan Doa Kyai 50 KG', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.28', name: 'Persediaan Pagi Jaya 50 KG', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.29', name: 'Persediaan Beras Muncul Premium 50 KG', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.30', name: 'Persediaan PW Manis Cantik', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.31', name: 'Persediaan BPJ 50 KG', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },
    { accountNumber: '1.4.32', name: 'Persediaan Beras Reject IR', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.4' },

    // 1.5 Aset Lancar Lainnya
    { accountNumber: '1.5', name: 'Aset Lancar Lainnya', accountType: A, rootType: RootType.ASSET, isGroup: true, parentNumber: '1' },
    { accountNumber: '1.5.1', name: 'Sewa Gedung Dibayar Dimuka', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.5' },
    { accountNumber: '1.5.2', name: 'Asuransi Dibayar Dimuka', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.5' },
    { accountNumber: '1.5.3', name: 'PPN Masukan', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.5' },
    { accountNumber: '1.5.4', name: 'PPh 23 Penjualan', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.5' },
    { accountNumber: '1.5.5', name: 'PPh Ps.4(2) Penjualan', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.5' },

    // 1.6 Aset Tetap
    { accountNumber: '1.6', name: 'Aset Tetap', accountType: A, rootType: RootType.ASSET, isGroup: true, parentNumber: '1' },
    { accountNumber: '1.6.1', name: 'Tanah', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.6' },
    { accountNumber: '1.6.2', name: 'Gedung', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.6' },
    { accountNumber: '1.6.3', name: 'Kendaraan', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.6' },
    { accountNumber: '1.6.4', name: 'Mesin', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.6' },
    { accountNumber: '1.6.5', name: 'Inventaris Kantor', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.6' },

    // 1.7 Akumulasi Depresiasi Aset Tetap
    { accountNumber: '1.7', name: 'Akumulasi Depresiasi Aset Tetap', accountType: A, rootType: RootType.ASSET, isGroup: true, parentNumber: '1' },
    { accountNumber: '1.7.1', name: 'Akumulasi Penyusutan Gedung', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.7' },
    { accountNumber: '1.7.2', name: 'Akumulasi Penyusutan Kendaraan', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.7' },
    { accountNumber: '1.7.3', name: 'Akumulasi Penyusutan Mesin', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.7' },
    { accountNumber: '1.7.4', name: 'Akumulasi Penyusutan Inventaris Kantor', accountType: A, rootType: RootType.ASSET, isGroup: false, parentNumber: '1.7' },

    // ═══════════════════════════════════════════
    // 2. LIABILITAS
    // ═══════════════════════════════════════════
    { accountNumber: '2', name: 'Liabilitas', accountType: L, rootType: RootType.LIABILITY, isGroup: true },

    // 2.1 Hutang Usaha
    { accountNumber: '2.1', name: 'Hutang Usaha', accountType: L, rootType: RootType.LIABILITY, isGroup: true, parentNumber: '2' },
    { accountNumber: '2.1.1', name: 'Hutang Usaha (Dagang)', accountType: L, rootType: RootType.LIABILITY, isGroup: false, parentNumber: '2.1' },
    { accountNumber: '2.1.2', name: 'Uang Muka Penjualan', accountType: L, rootType: RootType.LIABILITY, isGroup: false, parentNumber: '2.1' },

    // 2.2 Kewajiban Jangka Pendek Lainnya
    { accountNumber: '2.2', name: 'Kewajiban Jangka Pendek Lainnya', accountType: L, rootType: RootType.LIABILITY, isGroup: true, parentNumber: '2' },
    { accountNumber: '2.2.1', name: 'PPN Keluaran', accountType: L, rootType: RootType.LIABILITY, isGroup: false, parentNumber: '2.2' },
    { accountNumber: '2.2.2', name: 'PPh 23 Pembelian', accountType: L, rootType: RootType.LIABILITY, isGroup: false, parentNumber: '2.2' },
    { accountNumber: '2.2.3', name: 'Hutang Pembelian Belum Ditagih', accountType: L, rootType: RootType.LIABILITY, isGroup: false, parentNumber: '2.2' },
    { accountNumber: '2.2.4', name: 'PPh Ps.4(2) Pembelian', accountType: L, rootType: RootType.LIABILITY, isGroup: false, parentNumber: '2.2' },
    { accountNumber: '2.2.5', name: 'Hutang PPh 21', accountType: L, rootType: RootType.LIABILITY, isGroup: false, parentNumber: '2.2' },
    { accountNumber: '2.2.6', name: 'Hutang Gaji Karyawan', accountType: L, rootType: RootType.LIABILITY, isGroup: false, parentNumber: '2.2' },

    // 2.3 Hutang Jangka Panjang
    { accountNumber: '2.3', name: 'Hutang Jangka Panjang', accountType: L, rootType: RootType.LIABILITY, isGroup: true, parentNumber: '2' },

    // ═══════════════════════════════════════════
    // 3. MODAL / EKUITAS
    // ═══════════════════════════════════════════
    { accountNumber: '3', name: 'Modal', accountType: E, rootType: RootType.EQUITY, isGroup: true },
    { accountNumber: '3.1', name: 'Equitas Saldo Awal', accountType: E, rootType: RootType.EQUITY, isGroup: false, parentNumber: '3' },
    { accountNumber: '3.2', name: 'Laba Ditahan', accountType: E, rootType: RootType.EQUITY, isGroup: false, parentNumber: '3' },
    { accountNumber: '3.3', name: 'Modal Saham', accountType: E, rootType: RootType.EQUITY, isGroup: false, parentNumber: '3' },
    { accountNumber: '3.4', name: 'Laba Tahun Berjalan', accountType: E, rootType: RootType.EQUITY, isGroup: false, parentNumber: '3' },
    { accountNumber: '3.5', name: 'Prive', accountType: E, rootType: RootType.EQUITY, isGroup: false, parentNumber: '3' },

    // ═══════════════════════════════════════════
    // 4. PENDAPATAN OPERASIONAL
    // ═══════════════════════════════════════════
    { accountNumber: '4', name: 'Pendapatan Operasional', accountType: R, rootType: RootType.REVENUE, isGroup: true },
    { accountNumber: '4.1', name: 'Penjualan', accountType: R, rootType: RootType.REVENUE, isGroup: false, parentNumber: '4' },
    { accountNumber: '4.2', name: 'Pendapatan Jasa', accountType: R, rootType: RootType.REVENUE, isGroup: false, parentNumber: '4' },
    { accountNumber: '4.3', name: 'Retur Penjualan', accountType: R, rootType: RootType.REVENUE, isGroup: false, parentNumber: '4' },
    { accountNumber: '4.4', name: 'Diskon Penjualan', accountType: R, rootType: RootType.REVENUE, isGroup: false, parentNumber: '4' },

    // ═══════════════════════════════════════════
    // 5. BEBAN POKOK PENJUALAN
    // ═══════════════════════════════════════════
    { accountNumber: '5', name: 'Beban Pokok Penjualan', accountType: X, rootType: RootType.EXPENSE, isGroup: true },

    // ═══════════════════════════════════════════
    // 6. BEBAN OPERASIONAL
    // ═══════════════════════════════════════════
    { accountNumber: '6', name: 'Beban Operasional', accountType: X, rootType: RootType.EXPENSE, isGroup: true },
    { accountNumber: '6.1', name: 'Beban Internet', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.2', name: 'Beban Komisi', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.3', name: 'Beban Bensin, Parkir, Tol Kendaraan', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.4', name: 'Beban Gaji, Upah & Honorer', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.5', name: 'Beban Bonus, Pesangon & Kompensasi', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.6', name: 'Beban Transportasi Karyawan', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.7', name: 'Beban Pemeliharaan Kendaraan', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.8', name: 'Beban Tunjangan Kesehatan', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.9', name: 'Beban Asuransi Karyawan', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.10', name: 'Beban THR', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.11', name: 'Beban Listrik', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.12', name: 'Beban PAM', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.13', name: 'Beban Telekomunikasi', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.14', name: 'Beban Ekspedisi, Pos & Materai', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.15', name: 'Beban Perjalanan Dinas', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.16', name: 'Beban Perlengkapan Kantor', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.17', name: 'Beban Pajak Penghasilan', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.18', name: 'Beban Sumbangan Sosial', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.19', name: 'Beban Sewa Gedung', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.20', name: 'Beban Pantry', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.21', name: 'Beban Penyusutan Gedung', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.22', name: 'Beban Penyusutan Kendaraan', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.23', name: 'Beban Penyusutan Mesin', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.24', name: 'Beban Penyusutan Inventaris Kantor', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.25', name: 'Beban Pemeliharaan Mesin', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.26', name: 'Beban Pemeliharaan Gedung', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },
    { accountNumber: '6.27', name: 'Beban Piutang Tak Tertagih', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '6' },

    // ═══════════════════════════════════════════
    // 7. PENDAPATAN DILUAR USAHA
    // ═══════════════════════════════════════════
    { accountNumber: '7', name: 'Pendapatan Diluar Usaha', accountType: R, rootType: RootType.REVENUE, isGroup: true },
    { accountNumber: '7.1', name: 'Pendapatan Bunga Deposito', accountType: R, rootType: RootType.REVENUE, isGroup: false, parentNumber: '7' },
    { accountNumber: '7.2', name: 'Penjualan Persediaan / Perlengkapan', accountType: R, rootType: RootType.REVENUE, isGroup: false, parentNumber: '7' },
    { accountNumber: '7.3', name: 'Laba/Rugi Revaluasi Aset', accountType: R, rootType: RootType.REVENUE, isGroup: false, parentNumber: '7' },
    { accountNumber: '7.4', name: 'Pendapatan Diluar Usaha Lainnya', accountType: R, rootType: RootType.REVENUE, isGroup: false, parentNumber: '7' },

    // ═══════════════════════════════════════════
    // 8. BEBAN DILUAR USAHA
    // ═══════════════════════════════════════════
    { accountNumber: '8', name: 'Beban Diluar Usaha', accountType: X, rootType: RootType.EXPENSE, isGroup: true },
    { accountNumber: '8.1', name: 'Beban Bunga Pinjaman', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '8' },
    { accountNumber: '8.2', name: 'Beban Adm. Bank & Buku Cek/Giro', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '8' },
    { accountNumber: '8.3', name: 'Pajak Jasa Giro', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '8' },
    { accountNumber: '8.4', name: 'Laba/Rugi Terealisasi', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '8' },
    { accountNumber: '8.5', name: 'Laba/Rugi Belum Terealisasi', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '8' },
    { accountNumber: '8.6', name: 'Laba/Rugi Disposisi Aset', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '8' },
    { accountNumber: '8.7', name: 'Beban Diluar Usaha Lainnya', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '8' },
    { accountNumber: '8.8', name: 'Pembulatan & Selisih', accountType: X, rootType: RootType.EXPENSE, isGroup: false, parentNumber: '8' },
  ];

  const numberToId: Record<string, string> = {};

  for (const item of coa) {
    const parentId = item.parentNumber ? numberToId[item.parentNumber] : null;

    const account = await prisma.account.upsert({
      where: { accountNumber: item.accountNumber },
      update: { name: item.name, isGroup: item.isGroup, accountType: item.accountType, rootType: item.rootType },
      create: {
        accountNumber: item.accountNumber,
        name: item.name,
        accountType: item.accountType,
        rootType: item.rootType,
        isGroup: item.isGroup,
        parentId: parentId,
      },
    });

    numberToId[item.accountNumber] = account.id;
    console.log(`- Account: ${account.accountNumber} ${account.name}`);
  }

  // 4. Seed Service Items
  const serviceItemsData = [
    { code: 'JSG-001', name: 'Jasa Giling Padi', unit: 'Ton', defaultRate: 500000, accountNumber: '4.2' },
    { code: 'JSK-001', name: 'Jasa Kirim', unit: 'Trip', defaultRate: 250000, accountNumber: '4.2' },
  ];

  for (const si of serviceItemsData) {
    const accountId = numberToId[si.accountNumber];
    if (!accountId) {
      console.log(`- Skipped service item ${si.code}: account ${si.accountNumber} not found`);
      continue;
    }
    await prisma.serviceItem.upsert({
      where: { code: si.code },
      update: { name: si.name, unit: si.unit, defaultRate: si.defaultRate, accountId },
      create: {
        code: si.code,
        name: si.name,
        unit: si.unit,
        defaultRate: si.defaultRate,
        accountId,
      },
    });
    console.log(`- Upserted Service Item: ${si.code} ${si.name}`);
  }

  // 5. Seed System Account Mappings
  const systemMappings: { role: string; accountNumber: string; sortOrder: number }[] = [
    { role: 'CASH', accountNumber: '1.1.1', sortOrder: 0 },
    { role: 'CASH', accountNumber: '1.1.2', sortOrder: 1 },
    { role: 'CASH', accountNumber: '1.1.3', sortOrder: 2 },
    { role: 'CASH', accountNumber: '1.1.4', sortOrder: 3 },
    { role: 'CASH', accountNumber: '1.1.5', sortOrder: 4 },
    { role: 'AR', accountNumber: '1.2.1', sortOrder: 0 },
    { role: 'INVENTORY', accountNumber: '1.4.0', sortOrder: 0 },
    { role: 'AP', accountNumber: '2.1.1', sortOrder: 0 },
    { role: 'SALES', accountNumber: '4.1', sortOrder: 0 },
    { role: 'SERVICE_REVENUE', accountNumber: '4.2', sortOrder: 0 },
    { role: 'VENDOR_DEPOSIT', accountNumber: '1.3', sortOrder: 0 },
    { role: 'CUSTOMER_DEPOSIT', accountNumber: '2.1.2', sortOrder: 0 },
    { role: 'COGS', accountNumber: '5', sortOrder: 0 },
    { role: 'OPENING_EQUITY', accountNumber: '3.1', sortOrder: 0 },
    { role: 'RETAINED_EARNINGS', accountNumber: '3.2', sortOrder: 0 },
    { role: 'CURRENT_PROFIT', accountNumber: '3.4', sortOrder: 0 },
    // Pajak
    { role: 'TAX_INPUT', accountNumber: '1.5.3', sortOrder: 0 },
    { role: 'TAX_OUTPUT', accountNumber: '2.2.1', sortOrder: 0 },
    { role: 'INCOME_TAX_EXPENSE', accountNumber: '6.17', sortOrder: 0 },
    // Diskon
    { role: 'SALES_DISCOUNT', accountNumber: '4.4', sortOrder: 0 },
    { role: 'SALES_RETURN', accountNumber: '4.3', sortOrder: 0 },
    // Pengiriman
    { role: 'SHIPPING_EXPENSE', accountNumber: '6.14', sortOrder: 0 },
    // Aset Tetap & Depresiasi
    { role: 'FIXED_ASSET', accountNumber: '1.6.1', sortOrder: 0 },
    { role: 'FIXED_ASSET', accountNumber: '1.6.2', sortOrder: 1 },
    { role: 'FIXED_ASSET', accountNumber: '1.6.3', sortOrder: 2 },
    { role: 'FIXED_ASSET', accountNumber: '1.6.4', sortOrder: 3 },
    { role: 'FIXED_ASSET', accountNumber: '1.6.5', sortOrder: 4 },
    { role: 'ACCUM_DEPRECIATION', accountNumber: '1.7.1', sortOrder: 0 },
    { role: 'ACCUM_DEPRECIATION', accountNumber: '1.7.2', sortOrder: 1 },
    { role: 'ACCUM_DEPRECIATION', accountNumber: '1.7.3', sortOrder: 2 },
    { role: 'ACCUM_DEPRECIATION', accountNumber: '1.7.4', sortOrder: 3 },
    { role: 'DEPRECIATION_EXPENSE', accountNumber: '6.21', sortOrder: 0 },
    { role: 'DEPRECIATION_EXPENSE', accountNumber: '6.22', sortOrder: 1 },
    { role: 'DEPRECIATION_EXPENSE', accountNumber: '6.23', sortOrder: 2 },
    { role: 'DEPRECIATION_EXPENSE', accountNumber: '6.24', sortOrder: 3 },
    // Biaya Bank & Bunga
    { role: 'BANK_CHARGE', accountNumber: '8.2', sortOrder: 0 },
    { role: 'INTEREST_EXPENSE', accountNumber: '8.1', sortOrder: 0 },
    { role: 'INTEREST_INCOME', accountNumber: '7.1', sortOrder: 0 },
    // Selisih Kurs
    { role: 'FX_GAIN_LOSS', accountNumber: '8.4', sortOrder: 0 },
    { role: 'FX_UNREALIZED', accountNumber: '8.5', sortOrder: 0 },
    // Piutang Tak Tertagih
    { role: 'BAD_DEBT_EXPENSE', accountNumber: '6.27', sortOrder: 0 },
    { role: 'ALLOWANCE_DOUBTFUL', accountNumber: '1.2.5', sortOrder: 0 },
    // Akrual & Dibayar Dimuka
    { role: 'PREPAID_EXPENSE', accountNumber: '1.5.1', sortOrder: 0 },
    { role: 'PREPAID_EXPENSE', accountNumber: '1.5.2', sortOrder: 1 },
    { role: 'ACCRUED_EXPENSE', accountNumber: '2.2.6', sortOrder: 0 },
    // Ekuitas tambahan
    { role: 'OWNER_DRAWING', accountNumber: '3.5', sortOrder: 0 },
    // Pendapatan & Beban Lain-lain
    { role: 'OTHER_INCOME', accountNumber: '7.4', sortOrder: 0 },
    { role: 'OTHER_EXPENSE', accountNumber: '8.7', sortOrder: 0 },
    // Biaya Konversi Produksi
    { role: 'PRODUCTION_CONVERSION', accountNumber: '6.39', sortOrder: 0 },
    // Selisih Persediaan
    { role: 'INVENTORY_VARIANCE', accountNumber: '6.38', sortOrder: 0 },
    // Pembulatan
    { role: 'ROUNDING_ACCOUNT', accountNumber: '8.8', sortOrder: 0 },
  ];

  for (const mapping of systemMappings) {
    const accountId = numberToId[mapping.accountNumber];
    if (!accountId) {
      console.log(`- Skipped system mapping ${mapping.role}: account ${mapping.accountNumber} not found`);
      continue;
    }
    await prisma.systemAccountMapping.upsert({
      where: {
        role_accountId: { role: mapping.role, accountId },
      },
      update: { sortOrder: mapping.sortOrder },
      create: {
        role: mapping.role,
        accountId,
        sortOrder: mapping.sortOrder,
      },
    });
  }
  console.log(`- Seeded ${systemMappings.length} system account mappings`);

  // 6. Seed Company Settings
  await prisma.companySettings.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      slug: 'default',
      companyName: 'Nama Perusahaan Anda',
      address: '',
      phone: '',
      email: '',
      taxId: '',
      defaultCurrency: 'IDR',
    },
  });
  console.log('- Created default Company Settings');

  // 6. Seed Vendors & Customers (only if no parties exist yet)
  const partyCount = await prisma.party.count();
  if (partyCount === 0) {
    const vendors = [
      { name: 'Abud', phone: '+62 822-9812-0854' },
      { name: 'Angga', phone: '+62 852-0022-1415' },
      { name: 'Bulog', phone: null },
      { name: 'Dion', phone: '+62 831-3492-2717' },
      { name: 'Gunawan', phone: null },
      { name: 'Hj. Ukat', phone: '+62 822-1502-0606' },
      { name: 'Ibu Sri', phone: null },
      { name: 'Kiwang', phone: '+62 823-1754-8267' },
      { name: 'Margini', phone: '+62 812-2850-5282' },
      { name: 'Nugroho', phone: '+62 822-8274-7444' },
      { name: 'Pamuji', phone: '+62 852-2677-0777' },
      { name: 'Pandu', phone: null },
      { name: 'PT SHS', phone: null },
      { name: 'PT. BPR', phone: null },
      { name: 'Sugimun', phone: '+62 852-1241-9383' },
      { name: 'Supari', phone: '+62 852-2059-4515' },
      { name: 'Susyati', phone: '+62 852-2671-3345' },
      { name: 'Wahyu Dhea', phone: '+62 853-2182-3323' },
    ];

    const customers = [
      { name: 'AB Chicken' },
      { name: 'ABS' },
      { name: 'Baehaqi' },
      { name: 'Bapak Bambang' },
      { name: 'Bulog Bogor' },
      { name: 'Bulog Indramayu' },
      { name: 'BGN' },
      { name: 'BGN Fianti' },
      { name: 'BGN Kemped' },
      { name: 'BGN Sentul' },
      { name: 'Bos Bewok' },
      { name: 'Dartum' },
      { name: 'Eka Babinsa' },
      { name: 'Gus Azka' },
      { name: 'Gus Azmi' },
      { name: 'Gus Azmi 2' },
      { name: 'Hermanto' },
      { name: 'HJ. Bisri' },
      { name: 'HJ. Urip' },
      { name: 'Ibu Yenny' },
      { name: 'Induk' },
      { name: 'Pak Dion' },
      { name: 'Pondok' },
      { name: 'Pondok CDP' },
      { name: 'Rahmat' },
      { name: 'Rianto' },
      { name: 'Rizki' },
      { name: 'Suparih' },
      { name: 'Tino' },
      { name: 'Toko Liga Beras' },
      { name: 'Toko SR' },
    ];

    for (const v of vendors) {
      await prisma.party.create({
        data: { name: v.name, partyType: PartyType.Supplier, phone: v.phone },
      });
    }
    console.log(`- Seeded ${vendors.length} vendors`);

    for (const c of customers) {
      await prisma.party.create({
        data: { name: c.name, partyType: PartyType.Customer },
      });
    }
    console.log(`- Seeded ${customers.length} customers`);
  } else {
    console.log(`- Skipped party seeding (${partyCount} parties already exist)`);
  }

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
