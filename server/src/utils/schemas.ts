import { z } from 'zod';

// ─── Chart of Accounts ────────────────────────────────────────────────────────
const AccountTypeEnum = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'], {
  message: "Tipe akun harus salah satu dari: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE",
});

export const CreateAccountSchema = z.object({
  accountNumber: z.string().min(1, 'Nomor akun wajib diisi.'),
  name: z.string().min(1, 'Nama akun wajib diisi.'),
  accountType: AccountTypeEnum,
  rootType: AccountTypeEnum,
  parentId: z.string().nullable().optional(),
  isGroup: z.boolean().optional(),
  currency: z.string().optional(),
});

export const UpdateAccountSchema = CreateAccountSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─── Journal Entry ────────────────────────────────────────────────────────────
const JournalItemSchema = z.object({
  accountId: z.string().min(1, 'Akun wajib dipilih.'),
  debit: z.coerce.number().min(0),
  credit: z.coerce.number().min(0),
  partyId: z.string().nullable().optional(),
  description: z.string().optional(),
});

export const CreateJournalSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  narration: z.string().min(1, 'Keterangan wajib diisi.'),
  items: z.array(JournalItemSchema).min(1, 'Minimal satu baris jurnal.'),
});

// ─── Sales Invoice ────────────────────────────────────────────────────────────
const InvoiceItemSchema = z.object({
  itemName: z.string().min(1, 'Nama item wajib diisi.'),
  itemType: z.enum(['product', 'service']).optional().default('product'),
  inventoryItemId: z.string().uuid().nullable().optional(),
  serviceItemId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  quantity: z.coerce.number().positive('Jumlah harus lebih dari 0.'),
  unit: z.string().nullable().optional(),
  rate: z.coerce.number().min(0, 'Harga tidak boleh negatif.'),
  discount: z.coerce.number().min(0).max(100).optional().default(0), // persen diskon per baris
  taxPct: z.coerce.number().min(0).max(100).optional().default(0),   // PPN % per baris
  pphPct: z.coerce.number().min(0).max(100).optional().default(0),   // PPh % per baris
  description: z.string().nullable().optional(),
});

export const CreateSalesInvoiceSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  partyId: z.string().min(1, 'Pelanggan wajib dipilih.'),
  items: z.array(InvoiceItemSchema).min(1, 'Minimal satu item.'),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  taxPct: z.coerce.number().min(0).max(100).optional().default(0),    // PPN %
  potongan: z.coerce.number().min(0).optional().default(0),           // potongan amount
  biayaLain: z.coerce.number().optional().default(0),          // biaya tambahan (boleh negatif = potongan)
  labelPotongan: z.string().nullable().optional(),
  labelBiaya: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  allowNegativeStock: z.boolean().optional().default(false),
});

// ─── Purchase Invoice ─────────────────────────────────────────────────────────
// Extends generic InvoiceItemSchema with raw-material weigh & quality fields.
// `quantity` remains the source of truth for stock movement, but the service
// layer will set quantity := timbanganDiterima when the latter is provided.
const PurchaseInvoiceItemSchema = InvoiceItemSchema.extend({
  // Override base: rate boleh negatif untuk baris jasa/biaya yang mengurangi tagihan
  // (mis. potongan jasa angkutan vendor pakai armada perusahaan).
  rate: z.coerce.number(),
  kualitas: z.string().nullable().optional(),
  refaksi: z.coerce.number().min(0).nullable().optional(),
  timbanganTruk: z.coerce.number().min(0).nullable().optional(),
  timbanganDiterima: z.coerce.number().positive().nullable().optional(),
  nomorMobil: z.string().nullable().optional(),
  potonganItem: z.coerce.number().min(0).optional().default(0),
});

export const CreatePurchaseInvoiceSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  partyId: z.string().min(1, 'Pemasok wajib dipilih.'),
  items: z.array(PurchaseInvoiceItemSchema).min(1, 'Minimal satu item.'),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  taxPct: z.coerce.number().min(0).max(100).optional().default(0),
  biayaLain: z.coerce.number().optional().default(0),  // boleh negatif (potongan tagihan)
  // `potongan` at header level is a derived cache (SUM items.potonganItem).
  // Accept it for backward compat but the service layer recomputes from items.
  potongan: z.coerce.number().min(0).optional().default(0),
});

// ─── Payment ──────────────────────────────────────────────────────────────────
const AllocationSchema = z.object({
  invoiceType: z.enum(['SalesInvoice', 'PurchaseInvoice']),
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive(),
});

export const PaymentSplitSchema = z.object({
  accountId: z.string().min(1, 'Akun split wajib dipilih.'),
  amount: z.coerce.number().positive('Jumlah split harus lebih dari 0.'),
  notes: z.string().nullable().optional(),
});

export const CreatePaymentSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  partyId: z.string().min(1, 'Pihak wajib dipilih.'),
  amount: z.coerce.number().positive('Jumlah harus lebih dari 0.'),
  paymentType: z.enum(['Receive', 'Pay', 'VendorDeposit', 'CustomerDeposit', 'VendorRefund', 'CustomerRefund']),
  accountId: z.string().min(1, 'Akun kas/bank wajib dipilih.'),
  allocations: z.array(AllocationSchema).optional(),
  splits: z.array(PaymentSplitSchema).optional(),
  referenceNo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isOpeningBalance: z.boolean().optional(),
  // Refund-only: reference to the original Pay/Receive payment being partially reversed.
  // When provided, server restores invoice outstanding proportionally.
  refundSourcePaymentId: z.string().min(1).nullable().optional(),
});

// ─── Vendor Deposit Application ───────────────────────────────────────────────
export const ApplyVendorDepositSchema = z.object({
  depositPaymentId: z.string().uuid('ID deposit harus UUID yang valid.'),
  purchaseInvoiceId: z.string().uuid('ID invoice harus UUID yang valid.'),
  amount: z.coerce.number().positive('Jumlah harus lebih dari 0.'),
});

// ─── Customer Deposit Application ─────────────────────────────────────────────
export const ApplyCustomerDepositSchema = z.object({
  depositPaymentId: z.string().uuid('ID deposit harus UUID yang valid.'),
  salesInvoiceId: z.string().uuid('ID invoice harus UUID yang valid.'),
  amount: z.coerce.number().positive('Jumlah harus lebih dari 0.'),
});

// ─── Customer Deposit Refund / Offset ─────────────────────────────────────────
// Menyelesaikan sisa uang muka pelanggan dengan kombinasi:
//   - offset terhadap piutang (otomatis FIFO ke invoice terlama), dan/atau
//   - pengembalian kas ke rekening bank/kas.
// Minimal salah satu dari offsetAmount / cashAmount > 0.
export const RefundCustomerDepositSchema = z
  .object({
    date: z.string().min(1, 'Tanggal wajib diisi.'),
    offsetAmount: z.coerce.number().min(0).default(0),
    cashAmount: z.coerce.number().min(0).default(0),
    cashAccountId: z.string().uuid().optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .refine((d) => d.offsetAmount + d.cashAmount > 0, {
    message: 'Masukkan jumlah offset piutang atau refund kas minimal salah satu.',
  })
  .refine((d) => d.cashAmount === 0 || !!d.cashAccountId, {
    message: 'Pilih akun kas/bank untuk refund kas.',
    path: ['cashAccountId'],
  });

// ─── Party ────────────────────────────────────────────────────────────────────
export const CreatePartySchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi.'),
  partyType: z.enum(['Customer', 'Supplier', 'Both']),
  phone: z.string().nullable().optional(),
  email: z.string().email('Format email tidak valid.').nullable().optional().or(z.literal('')),
  address: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
});

export const UpdatePartySchema = CreatePartySchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─── Opening Balance ─────────────────────────────────────────────────────────
export const SetBalanceSchema = z.object({
  balance: z.coerce.number({ error: 'Saldo harus berupa angka.' }),
});

// ─── Company Settings ─────────────────────────────────────────────────────────
export const UpdateCompanySettingsSchema = z.object({
  companyName: z.string().min(1, 'Nama perusahaan wajib diisi.').optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email('Format email tidak valid.').nullable().optional().or(z.literal('')),
  taxId: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  currency: z.string().optional(),
  dateFormat: z.string().optional(),
  fiscalYearStartMonth: z.coerce.number().int().min(1, 'Bulan harus antara 1-12.').max(12, 'Bulan harus antara 1-12.').optional(),
  invoiceSettings: z.object({
    sales: z.object({
      bankAccounts: z.string().optional(),
      footerNote: z.string().optional(),
      showSignature: z.boolean().optional(),
      signatureLabels: z.array(z.string()).optional(),
    }).optional(),
    purchase: z.object({
      footerNote: z.string().optional(),
      showSignature: z.boolean().optional(),
      signatureLabels: z.array(z.string()).optional(),
    }).optional(),
  }).nullable().optional(),
});

// ─── Fiscal Year ──────────────────────────────────────────────────────────────
export const CreateFiscalYearSchema = z.object({
  name: z.string().min(1, 'Nama tahun fiskal wajib diisi.'),
  startDate: z.string().min(1, 'Tanggal mulai wajib diisi.'),
  endDate: z.string().min(1, 'Tanggal selesai wajib diisi.'),
});

// ─── Inventory Item ───────────────────────────────────────────────────────────
export const CreateInventoryItemSchema = z.object({
  code: z.string().min(1, 'Kode item wajib diisi.'),
  name: z.string().min(1, 'Nama item wajib diisi.'),
  unit: z.string().min(1, 'Satuan wajib diisi.'),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  minimumStock: z.coerce.number().min(0).optional(),
  accountId: z.string().nullable().optional(),
});

export const UpdateInventoryItemSchema = CreateInventoryItemSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─── Stock Movement ───────────────────────────────────────────────────────────
export const CreateStockMovementSchema = z.object({
  itemId: z.string().min(1, 'Item wajib dipilih.'),
  movementType: z.enum(['In', 'Out', 'AdjustmentIn', 'AdjustmentOut']),
  quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0.'),
  unitCost: z.coerce.number().min(0).optional(),
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  offsetAccountId: z.string().nullable().optional(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const UpdateStockMovementSchema = z.object({
  movementType: z.enum(['In', 'Out', 'AdjustmentIn', 'AdjustmentOut']),
  quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0.'),
  unitCost: z.coerce.number().min(0).optional(),
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  offsetAccountId: z.string().nullable().optional(),
  referenceType: z.string().nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ─── User Management ─────────────────────────────────────────────────────────
const UserRoleEnum = z.enum(['Admin', 'Accountant', 'StaffProduksi', 'Viewer'], {
  message: "Role harus salah satu dari: Admin, Accountant, StaffProduksi, Viewer",
});

export const CreateUserSchema = z.object({
  username: z.string().min(3, 'Username minimal 3 karakter.'),
  email: z.string().email('Format email tidak valid.'),
  fullName: z.string().min(2, 'Nama lengkap minimal 2 karakter.'),
  password: z.string()
    .min(8, 'Password minimal 8 karakter.')
    .regex(/[A-Z]/, 'Password harus mengandung huruf besar.')
    .regex(/[0-9]/, 'Password harus mengandung angka.')
    .regex(/[^A-Za-z0-9]/, 'Password harus mengandung karakter spesial.'),
  role: UserRoleEnum,
});

export const UpdateUserSchema = z.object({
  username: z.string().min(3, 'Username minimal 3 karakter.').optional(),
  email: z.string().email('Format email tidak valid.').optional(),
  fullName: z.string().min(2, 'Nama lengkap minimal 2 karakter.').optional(),
  password: z.string()
    .min(8, 'Password minimal 8 karakter.')
    .regex(/[A-Z]/, 'Password harus mengandung huruf besar.')
    .regex(/[0-9]/, 'Password harus mengandung angka.')
    .regex(/[^A-Za-z0-9]/, 'Password harus mengandung karakter spesial.')
    .optional(),
  role: UserRoleEnum.optional(),
  isActive: z.boolean().optional(),
}).refine(data => Object.values(data).some(v => v !== undefined), {
  message: 'Minimal satu field harus diisi.',
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Password saat ini wajib diisi.'),
  newPassword: z.string()
    .min(8, 'Password baru minimal 8 karakter.')
    .regex(/[A-Z]/, 'Password harus mengandung huruf besar.')
    .regex(/[0-9]/, 'Password harus mengandung angka.')
    .regex(/[^A-Za-z0-9]/, 'Password harus mengandung karakter spesial.'),
});

// ─── Recurring Template ─────────────────────────────────────────────────────
const JournalTemplateItemSchema = z.object({
  accountId: z.string().uuid('Account ID harus UUID yang valid.'),
  partyId: z.string().uuid().nullable().optional(),
  debit: z.coerce.number().min(0, 'Debit tidak boleh negatif.'),
  credit: z.coerce.number().min(0, 'Credit tidak boleh negatif.'),
  description: z.string().optional(),
});

const JournalTemplateDataSchema = z.object({
  narration: z.string().min(1, 'Narasi wajib diisi.'),
  items: z.array(JournalTemplateItemSchema).min(1, 'Minimal 1 item jurnal.'),
});

const InvoiceTemplateItemSchema = z.object({
  itemName: z.string().min(1),
  description: z.string().optional(),
  quantity: z.coerce.number().positive(),
  unit: z.string().optional(),
  rate: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).max(100).optional(),
  taxPct: z.coerce.number().min(0).max(100).optional(),
  accountId: z.string().uuid().optional(),
});

const InvoiceTemplateDataSchema = z.object({
  partyId: z.string().uuid().optional(),
  taxPct: z.coerce.number().min(0).max(100).optional(),
  potongan: z.coerce.number().min(0).optional(),
  biayaLain: z.coerce.number().optional(),
  notes: z.string().optional(),
  items: z.array(InvoiceTemplateItemSchema).min(1, 'Minimal 1 item.'),
});

const TemplateDataSchema = z.union([
  JournalTemplateDataSchema,
  InvoiceTemplateDataSchema,
]);

export const CreateRecurringSchema = z.object({
  name: z.string().min(1, 'Nama template wajib diisi.'),
  templateType: z.enum(['journal', 'sales_invoice', 'purchase_invoice']),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
  dayOfMonth: z.coerce.number().min(1).max(31).nullable().optional(),
  nextRunDate: z.string().min(1, 'Tanggal berikutnya wajib diisi.'),
  templateData: TemplateDataSchema,
});

export const UpdateRecurringSchema = z.object({
  name: z.string().min(1, 'Nama template wajib diisi.').optional(),
  templateType: z.enum(['journal', 'sales_invoice', 'purchase_invoice']).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  dayOfMonth: z.coerce.number().min(1).max(31).nullable().optional(),
  nextRunDate: z.string().optional(),
  templateData: TemplateDataSchema.optional(),
  isActive: z.boolean().optional(),
});

// ─── Production Run ───────────────────────────────────────────────────────────
const ProductionInputLineSchema = z.object({
  itemId: z.string().min(1, 'Item wajib dipilih.'),
  quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0.'),
});

const ProductionOutputLineSchema = z.object({
  itemId: z.string().min(1, 'Item wajib dipilih.'),
  quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0.'),
  unitPrice: z.coerce.number().nonnegative('Harga tidak boleh negatif.').optional().nullable(),
  isByProduct: z.boolean().optional().default(false),
});

export const CreateProductionRunSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  notes: z.string().nullable().optional(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
  inputs: z.array(ProductionInputLineSchema).min(1, 'Minimal satu item input.'),
  outputs: z.array(ProductionOutputLineSchema).min(1, 'Minimal satu item output.'),
}).superRefine((data, ctx) => {
  // Enforce unit_price > 0 for main Output lines (non-by-product).
  // This prevents silent dumping of output value into HPP variance when cost is missing.
  data.outputs.forEach((o, idx) => {
    if (!o.isByProduct && (o.unitPrice == null || o.unitPrice <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Harga/HPP produk utama wajib diisi dan lebih dari 0.',
        path: ['outputs', idx, 'unitPrice'],
      });
    }
    if (o.isByProduct && (o.unitPrice == null || o.unitPrice < 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Harga produk sampingan wajib diisi (minimal 0).',
        path: ['outputs', idx, 'unitPrice'],
      });
    }
  });
});

export const UpdateProductionRunSchema = CreateProductionRunSchema;

// ─── Bank Reconciliation ────────────────────────────────────────────────────
export const CreateReconciliationSchema = z.object({
  accountId: z.string().min(1, 'Akun bank wajib dipilih.'),
  statementDate: z.string().min(1, 'Tanggal statement wajib diisi.'),
  statementBalance: z.coerce.number({ message: 'Saldo statement harus berupa angka.' }),
  notes: z.string().nullable().optional(),
});

const StatementItemSchema = z.object({
  statementAmount: z.coerce.number({ message: 'Jumlah harus berupa angka.' }),
  statementDesc: z.string().nullable().optional(),
  statementDate: z.string().nullable().optional(),
});

export const AddStatementItemsSchema = z.object({
  items: z.array(StatementItemSchema).min(1, 'Minimal satu item statement.'),
});

export const MatchItemSchema = z.object({
  itemId: z.string().min(1, 'ID item wajib diisi.'),
  ledgerEntryId: z.string().min(1, 'ID ledger entry wajib diisi.'),
});

export const UnmatchItemSchema = z.object({
  itemId: z.string().min(1, 'ID item wajib diisi.'),
});

// ─── Tax Config ──────────────────────────────────────────────────────────────
export const CreateTaxConfigSchema = z.object({
  name: z.string().min(1, 'Nama pajak wajib diisi.'),
  rate: z.coerce.number().min(0, 'Tarif tidak boleh negatif.').max(100, 'Tarif maksimal 100%.'),
  type: z.enum(['sales', 'purchase', 'withholding'], { message: 'Tipe harus: sales, purchase, atau withholding.' }),
  accountId: z.string().nullable().optional(),
});

export const UpdateTaxConfigSchema = CreateTaxConfigSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─── Service Item ──────────────────────────────────────────────────────────
export const CreateServiceItemSchema = z.object({
  code: z.string().min(1, 'Kode layanan wajib diisi.'),
  name: z.string().min(1, 'Nama layanan wajib diisi.'),
  unit: z.string().optional().default('Jasa'),
  defaultRate: z.coerce.number().min(0).optional(),
  accountId: z.string().uuid('Akun pendapatan wajib dipilih.'),
  description: z.string().nullable().optional(),
});

export const UpdateServiceItemSchema = CreateServiceItemSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ─── Stok Opname ──────────────────────────────────────────────────────────────
const StockOpnameItemSchema = z.object({
  itemId: z.string().uuid('Item ID harus UUID yang valid.'),
  actualStock: z.coerce.number().min(0, 'Stok aktual tidak boleh negatif.'),
  notes: z.string().nullable().optional(),
});

export const CreateStockOpnameSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  notes: z.string().nullable().optional(),
  items: z.array(StockOpnameItemSchema).min(1, 'Minimal satu item stok opname.'),
});

export const SubmitStockOpnameSchema = z.object({
  items: z.array(StockOpnameItemSchema).min(1, 'Minimal satu item stok opname.'),
});
