import { z } from 'zod';

// Chart of Accounts
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

// Journal Entry
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

// Sales Invoice
const InvoiceItemSchema = z.object({
  itemName: z.string().min(1, 'Nama item wajib diisi.'),
  itemType: z.enum(['product', 'service']).optional().default('product'),
  inventoryItemId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),  // multi-warehouse: source for SI, destination for PI
  serviceItemId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  quantity: z.coerce.number().positive('Jumlah harus lebih dari 0.'),
  unit: z.string().nullable().optional(),
  rate: z.coerce.number().min(0, 'Harga tidak boleh negatif.'),
  discount: z.coerce.number().min(0).max(100).optional().default(0), // persen diskon per baris
  taxPct: z.coerce.number().min(0).max(100).optional().default(0),   // PPN % per baris
  pphPct: z.coerce.number().min(0).max(100).optional().default(0),   // PPh % per baris
  description: z.string().nullable().optional(),
  // From-DO line: skip stock-out (DO already did) + use locked unitCost for COGS.
  deliveryOrderItemId: z.string().uuid().nullable().optional(),
  // Batch picker: the stock-out links to this inbound batch and copies its
  // unit_cost_loaded onto the sales line for loaded-margin reports.
  sourceMovementId: z.string().uuid().nullable().optional(),
});

export const CreateSalesInvoiceSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  partyId: z.string().min(1, 'Pelanggan wajib dipilih.'),
  items: z.array(InvoiceItemSchema).min(1, 'Minimal satu item.'),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customerRefNo: z.string().max(100).nullable().optional(),    // No. PO / Penawaran pelanggan
  taxPct: z.coerce.number().min(0).max(100).optional().default(0),    // PPN %
  potongan: z.coerce.number().min(0).optional().default(0),           // potongan amount
  biayaLain: z.coerce.number().optional().default(0),          // biaya tambahan (boleh negatif = potongan)
  labelPotongan: z.string().nullable().optional(),
  labelBiaya: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  allowNegativeStock: z.boolean().optional().default(false),
});

// Retur Penjualan (Sales Return)
// Klien hanya mengirim baris invoice yang diretur + qty + flag restock. Harga,
// cost HPP, dan akun diturunkan server dari baris invoice asal (tidak dipercaya
// dari klien) untuk mencegah manipulasi nilai.
export const SalesReturnItemSchema = z.object({
  salesInvoiceItemId: z.string().min(1, 'Baris invoice wajib dipilih.'),
  quantity: z.coerce.number().positive('Qty retur harus > 0.'),
  restock: z.boolean().optional().default(true),
  // Opsional override gudang tujuan masuk-stok; default = gudang baris invoice.
  warehouseId: z.string().nullable().optional(),
});

export const CreateSalesReturnSchema = z.object({
  salesInvoiceId: z.string().min(1, 'Invoice penjualan wajib dipilih.'),
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  items: z.array(SalesReturnItemSchema).min(1, 'Minimal satu baris retur.'),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Quotation
// Non-binding offer document. No GL impact until converted to a Sales Invoice.
// Items mirror InvoiceItemSchema (product/service, qty, rate, discount, tax/pph).
export const CreateQuotationSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  validUntil: z.string().min(1, 'Tanggal berlaku-sampai wajib diisi.'),
  partyId: z.string().min(1, 'Pelanggan wajib dipilih.'),
  items: z.array(InvoiceItemSchema).min(1, 'Minimal satu item.'),
  notes: z.string().nullable().optional(),
  potongan: z.coerce.number().min(0).optional().default(0),
  biayaLain: z.coerce.number().optional().default(0),
  labelPotongan: z.string().nullable().optional(),
  labelBiaya: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
}).refine(
  (data) => new Date(data.validUntil) >= new Date(data.date),
  { message: 'Tanggal berlaku-sampai harus sama dengan atau setelah tanggal penawaran.', path: ['validUntil'] },
);

export const UpdateQuotationSchema = CreateQuotationSchema;

// Sales Order — komitmen jual sebelum DO+Invoice. Schema mirror Quotation
// tapi tanpa validUntil/terms (yang specific ke penawaran). Inventory/service
// line dibedakan via inventoryItemId (null = non-inventory misc charge).
const SOItemSchema = z.object({
  inventoryItemId: z.string().nullable().optional(),
  itemName: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  rate: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).max(100).default(0),
  amount: z.coerce.number().min(0),
  description: z.string().nullable().optional(),
});

export const CreateSalesOrderSchema = z.object({
  date: z.string().min(1),
  expectedDelivery: z.string().nullable().optional(),
  partyId: z.string().min(1),
  customerRefNo: z.string().nullable().optional(),
  quotationId: z.string().nullable().optional(),
  items: z.array(SOItemSchema).min(1),
  notes: z.string().nullable().optional(),
  potongan: z.coerce.number().min(0).optional().default(0),
  biayaLain: z.coerce.number().optional().default(0),
  taxPct: z.coerce.number().min(0).max(100).optional().default(0),
});

export const UpdateSalesOrderSchema = CreateSalesOrderSchema;

export const GenerateDOFromSOSchema = z.object({
  date: z.string().min(1),
  nomorMobil: z.string().nullable().optional(),
  driverName: z.string().nullable().optional(),
  recipientName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  allowNegativeStock: z.boolean().optional().default(false),
  negativeStockReason: z.string().max(500).nullable().optional(),
  temporaryNoteIds: z.array(z.string()).optional(),
  items: z.array(z.object({
    salesOrderItemId: z.string().min(1),
    quantity: z.coerce.number().positive(),
    warehouseId: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })).min(1),
});

export const RejectQuotationSchema = z.object({
  reason: z.string().min(5, 'Alasan minimal 5 karakter.').max(500),
});

export const ConvertQuotationSchema = z.object({
  dueDate: z.string().nullable().optional(),
  allowNegativeStock: z.boolean().optional().default(false),
}).optional();

// Inquiry
// Customer/prospect lead. Captured before a Quotation is issued.
const InquiryItemInputSchema = z.object({
  itemName: z.string().min(1, 'Nama item wajib diisi.'),
  quantity: z.coerce.number().nonnegative().nullable().optional(),
  unit: z.string().nullable().optional(),
  estimatedPrice: z.coerce.number().nonnegative().nullable().optional(),
  description: z.string().nullable().optional(),
});

const InquiryChannelEnum = z.enum(['WhatsApp', 'Telepon', 'Email', 'WalkIn', 'Referral', 'Lainnya']);
const InquiryStatusEnum = z.enum(['Baru', 'Diproses', 'Dikonversi', 'Hilang', 'Ditutup']);

export const CreateInquirySchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  channel: InquiryChannelEnum.optional().default('Lainnya'),
  partyId: z.string().min(1).nullable().optional(),
  prospectName: z.string().min(1, 'Nama prospek/customer wajib diisi.').max(200),
  prospectPhone: z.string().max(50).nullable().optional(),
  prospectEmail: z.string().email().or(z.literal('')).nullable().optional(),
  itemsMode: z.enum(['freetext', 'structured']).optional().default('freetext'),
  itemsText: z.string().nullable().optional(),
  items: z.array(InquiryItemInputSchema).optional().default([]),
  notes: z.string().nullable().optional(),
  followUpDate: z.string().nullable().optional(),
}).refine(
  (data) =>
    data.itemsMode !== 'structured' || (data.items && data.items.length > 0) || !!data.itemsText,
  { message: 'Inquiry harus berisi item (structured) atau permintaan (free-text).', path: ['items'] },
);

export const UpdateInquirySchema = CreateInquirySchema;

export const InquiryStatusUpdateSchema = z.object({
  status: InquiryStatusEnum,
  lossReason: z.string().max(500).nullable().optional(),
});

// Purchase Invoice
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
  // Link ke baris STT/BPB. Kalau di-set: stok TIDAK dibuat ulang oleh PI
  // (STT yang sudah create). PI hanya post AP + variance harga.
  goodsReceiptItemId: z.string().uuid().nullable().optional(),
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

// Payment
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
  // CustomerDeposit-only: tag uang muka ini ke Sales Order tertentu, supaya
  // dari layar SO kelihatan DP yang sudah diterima untuk pesanan itu.
  salesOrderId: z.string().uuid().nullable().optional(),
});

// Vendor Deposit Application
export const ApplyVendorDepositSchema = z.object({
  depositPaymentId: z.string().uuid('ID deposit harus UUID yang valid.'),
  purchaseInvoiceId: z.string().uuid('ID invoice harus UUID yang valid.'),
  amount: z.coerce.number().positive('Jumlah harus lebih dari 0.'),
});

// Customer Deposit Application
export const ApplyCustomerDepositSchema = z.object({
  depositPaymentId: z.string().uuid('ID deposit harus UUID yang valid.'),
  salesInvoiceId: z.string().uuid('ID invoice harus UUID yang valid.'),
  amount: z.coerce.number().positive('Jumlah harus lebih dari 0.'),
});

// Customer Deposit Refund / Offset
// Settles the remaining deposit by offsetting receivables (FIFO, oldest invoice
// first) and/or a cash refund; at least one of offsetAmount / cashAmount > 0.
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

// Vendor Deposit Refund / Offset
// Settles the remaining deposit by offsetting payables (FIFO, oldest purchase
// invoice first) and/or a cash refund.
export const RefundVendorDepositSchema = z
  .object({
    date: z.string().min(1, 'Tanggal wajib diisi.'),
    offsetAmount: z.coerce.number().min(0).default(0),
    cashAmount: z.coerce.number().min(0).default(0),
    cashAccountId: z.string().uuid().optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .refine((d) => d.offsetAmount + d.cashAmount > 0, {
    message: 'Masukkan jumlah offset hutang atau refund kas minimal salah satu.',
  })
  .refine((d) => d.cashAmount === 0 || !!d.cashAccountId, {
    message: 'Pilih akun kas/bank untuk refund kas.',
    path: ['cashAccountId'],
  });

// Uang Jaminan Proyek
export const GUARANTEE_TYPES = ['Penawaran', 'Pelaksanaan', 'Pemeliharaan', 'Lainnya'] as const;

export const CreateProjectGuaranteeSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  partyId: z.string().uuid('Pihak pemberi proyek wajib dipilih.'),
  guaranteeType: z.enum(GUARANTEE_TYPES),
  projectName: z.string().min(1, 'Nama proyek wajib diisi.'),
  referenceNo: z.string().optional().nullable(),
  amount: z.coerce.number().positive('Jumlah jaminan harus lebih dari 0.'),
  accountId: z.string().uuid('Akun sumber dana wajib dipilih.'),
  expectedReturnDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Settlement: pengembalian (kas masuk) dan/atau hangus (beban), bisa parsial
// dan berulang sampai sisa jaminan habis.
export const SettleProjectGuaranteeSchema = z
  .object({
    date: z.string().min(1, 'Tanggal wajib diisi.'),
    returnAmount: z.coerce.number().min(0).default(0),
    forfeitAmount: z.coerce.number().min(0).default(0),
    returnAccountId: z.string().uuid().optional().nullable(),
    expenseAccountId: z.string().uuid().optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .refine((d) => d.returnAmount + d.forfeitAmount > 0, {
    message: 'Masukkan jumlah dikembalikan atau hangus minimal salah satu.',
  })
  .refine((d) => d.returnAmount === 0 || !!d.returnAccountId, {
    message: 'Pilih akun kas/bank tujuan pengembalian.',
    path: ['returnAccountId'],
  });

// Party
export const CreatePartySchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi.'),
  partyType: z.enum(['Customer', 'Supplier', 'Both']),
  phone: z.string().nullable().optional(),
  email: z.string().email('Format email tidak valid.').nullable().optional().or(z.literal('')),
  address: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
  isWapu: z.boolean().optional().default(false),
});

export const UpdatePartySchema = CreatePartySchema.partial().extend({
  isActive: z.boolean().optional(),
});

// Opening Balance
export const SetBalanceSchema = z.object({
  balance: z.coerce.number({ error: 'Saldo harus berupa angka.' }),
});

// Company Settings
export const UpdateCompanySettingsSchema = z.object({
  companyName: z.string().min(1, 'Nama perusahaan wajib diisi.').optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email('Format email tidak valid.').nullable().optional().or(z.literal('')),
  taxId: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  logoUrlDark: z.string().nullable().optional(),
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

// Fiscal Year
export const CreateFiscalYearSchema = z.object({
  name: z.string().min(1, 'Nama tahun fiskal wajib diisi.'),
  startDate: z.string().min(1, 'Tanggal mulai wajib diisi.'),
  endDate: z.string().min(1, 'Tanggal selesai wajib diisi.'),
});

// Inventory Item
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

// Stock Movement
export const CreateStockMovementSchema = z.object({
  itemId: z.string().min(1, 'Item wajib dipilih.'),
  warehouseId: z.string().uuid().nullable().optional(),
  movementType: z.enum(['In', 'Out', 'AdjustmentIn', 'AdjustmentOut']),
  quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0.'),
  unitCost: z.coerce.number().min(0).optional(),
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  offsetAccountId: z.string().nullable().optional(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Batch picker for adjustment Out
  sourceMovementId: z.string().uuid().nullable().optional(),
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

// Production Cost Standards (master rate for cost components)
// basis: InputQty = rate × sum(input qty), OutputQty = rate × main output qty,
// Fixed = flat per run (rate is the total). costSide picks input vs main output qty.
export const ProductionCostSideEnum = z.enum(['InputSide', 'OutputSide']);
export const ProductionCostBasisEnum = z.enum(['InputQty', 'OutputQty', 'Fixed']);

export const CreateProductionCostStandardSchema = z.object({
  name: z.string().min(1, 'Nama standar biaya wajib diisi.'),
  description: z.string().nullable().optional(),
  costSide: ProductionCostSideEnum,
  basis: ProductionCostBasisEnum,
  defaultRate: z.coerce.number().min(0, 'Rate tidak boleh negatif.'),
  costAccountId: z.string().uuid().nullable().optional(),
  itemId: z.string().uuid().nullable().optional(),
  // Optional warehouse scope — staff hanya lihat standar yang match dengan
  // gudang produksi yg dipilih, atau yang berlaku semua gudang (null).
  warehouseId: z.string().uuid().nullable().optional(),
});

export const UpdateProductionCostStandardSchema = CreateProductionCostStandardSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

// Production Processes (master traceability list)
export const CreateProductionProcessSchema = z.object({
  name: z.string().min(1, 'Nama proses wajib diisi.').max(100),
  description: z.string().nullable().optional(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export const UpdateProductionProcessSchema = CreateProductionProcessSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

// Machine (master mesin untuk OEE tracking)
// idealRatePerHour = kapasitas ideal (kg/jam) untuk komponen Performance OEE.
export const CreateMachineSchema = z.object({
  code: z.string().min(1, 'Kode mesin wajib diisi.').max(50),
  name: z.string().min(1, 'Nama mesin wajib diisi.').max(150),
  idealRatePerHour: z.coerce.number().min(0, 'Kapasitas ideal tidak boleh negatif.').nullable().optional(),
  unit: z.string().max(20).optional().default('kg'),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export const UpdateMachineSchema = CreateMachineSchema.partial();

// User Management
// role is a Role key (string); the users route checks it against the roles table.
const UserRoleEnum = z.string().min(1, 'Role wajib diisi.');

/** Registrasi AIRA (MCP) per user: akses, level (read/standard/direct), jabatan untuk persona agen. */
const AiraUserFields = {
  airaEnabled: z.boolean().optional(),
  airaTier: z.enum(['read', 'standard', 'direct']).optional(),
  airaJabatan: z.string().trim().max(100).nullable().optional(),
};

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
  /** Atasan langsung (approver tahap 1 Pengajuan Pembayaran). */
  supervisorId: z.string().min(1).nullable().optional(),
  ...AiraUserFields,
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
  supervisorId: z.string().min(1).nullable().optional(),
  ...AiraUserFields,
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

// Recurring Template
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

// Production Run
// Cost component line used at production submit time. The client supplies the
// rate (often prefilled from a master ProductionCostStandard); the server
// computes qtyBasis + totalAmount based on `basis`.
const ProductionRunCostInputSchema = z.object({
  standardId: z.string().uuid().nullable().optional(),
  description: z.string().min(1, 'Keterangan biaya wajib diisi.'),
  costSide: z.enum(['InputSide', 'OutputSide']),
  basis: z.enum(['InputQty', 'OutputQty', 'Fixed']),
  rate: z.coerce.number().min(0, 'Rate tidak boleh negatif.'),
  costAccountId: z.string().uuid().nullable().optional(),
});

const ProductionInputLineSchema = z.object({
  itemId: z.string().min(1, 'Item wajib dipilih.'),
  quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0.'),
  // Batch picker: consume a specific inbound batch and lock its unit cost even if
  // WAC changes later. Optional; without them costing falls back to WAC.
  sourceMovementId: z.string().uuid().nullable().optional(),
  batchUnitCost: z.coerce.number().min(0).nullable().optional(),
});

const ProductionOutputLineSchema = z.object({
  itemId: z.string().min(1, 'Item wajib dipilih.'),
  quantity: z.coerce.number().positive('Kuantitas harus lebih dari 0.'),
  unitPrice: z.coerce.number().nonnegative('Harga tidak boleh negatif.').optional().nullable(),
  isByProduct: z.boolean().optional().default(false),
});

// OEE: downtime row captured per run. category bebas (UI batasi ke
// Breakdown/Setup/Material/Lain), durasi dalam menit. machineId opsional —
// bila diisi, downtime diatribusikan ke mesin tsb (utk kalkulasi per-mesin).
const ProductionDowntimeLineSchema = z.object({
  machineId: z.string().uuid('Mesin downtime tidak valid.').nullable().optional(),
  category: z.string().min(1, 'Kategori downtime wajib diisi.').max(50),
  reason: z.string().max(500).nullable().optional(),
  durationMin: z.coerce.number().min(0, 'Durasi tidak boleh negatif.'),
});

// One machine used in the run (parallel, own start/stop). OEE is computed per
// machine; output is allocated in proportion to run time.
const ProductionRunMachineLineSchema = z.object({
  machineId: z.string().uuid('Mesin tidak valid.'),
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
});

export const CreateProductionRunSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  // Warehouse where inputs are consumed AND outputs deposited. Preferred over
  // the legacy default-warehouse fallback so user is explicit per run.
  warehouseId: z.string().uuid('Gudang wajib dipilih.').nullable().optional(),
  notes: z.string().nullable().optional(),
  referenceType: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
  inputs: z.array(ProductionInputLineSchema).min(1, 'Minimal satu item input.'),
  outputs: z.array(ProductionOutputLineSchema).min(1, 'Minimal satu item output.'),
  // Cost components for loaded HPP, snapshotted at submit (later master edits do
  // not change history). No GL is posted from these; real expenses go via JV/invoice.
  costs: z.array(ProductionRunCostInputSchema).optional().default([]),
  // User override for computedHpp; otherwise it is material + costs - byproduct value.
  hppOverride: z.coerce.number().min(0).nullable().optional(),
  // Traceability: list of process master ids that this run went through.
  // Optional + order-insensitive (multiselect). Empty array = unspecified.
  processIds: z.array(z.string().uuid()).optional().default([]),
  // OEE tracking (all optional): standard shift window (planned production time) and breaks.
  plannedStart: z.coerce.date().nullable().optional(),
  plannedEnd: z.coerce.date().nullable().optional(),
  breakStart: z.coerce.date().nullable().optional(),
  breakEnd: z.coerce.date().nullable().optional(),
  // Mesin paralel dalam run; OEE dihitung per mesin + agregat line.
  runMachines: z.array(ProductionRunMachineLineSchema).optional().default([]),
  shift: z.string().max(20).nullable().optional(),               // "1" | "2" | "3"
  shiftLead: z.string().max(150).nullable().optional(),          // kepala shift (teks bebas)
  manpowerCount: z.coerce.number().int().min(0).nullable().optional(),
  // OEE quality is derived from the run's input/output lines. goodQty/rejectQty
  // are ignored and stay optional so old payloads are still accepted.
  goodQty: z.coerce.number().min(0).nullable().optional(),       // LEGACY — diabaikan
  rejectQty: z.coerce.number().min(0).nullable().optional(),     // LEGACY — diabaikan
  downtimes: z.array(ProductionDowntimeLineSchema).optional().default([]),
  // Legacy single-machine fields: not used for OEE, optional so old payloads still pass.
  machineId: z.string().uuid('Mesin tidak valid.').nullable().optional(),
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
  // When true, production can consume more than current stock (stock goes negative).
  // Requires the inventory.negative_stock capability (checked in the route) and `negativeStockReason`.
  // Use case: backdated production input where sales already reduced stock.
  allowNegativeStock: z.boolean().optional().default(false),
  // Alasan bypass — wajib min 10 karakter kalau allowNegativeStock=true.
  // Disimpan ke audit log + ditampilkan di Dashboard "Stok Minus Aktif".
  negativeStockReason: z.string().max(500).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.allowNegativeStock && (!data.negativeStockReason || data.negativeStockReason.trim().length < 10)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Alasan bypass stok minus wajib diisi (minimal 10 karakter).',
      path: ['negativeStockReason'],
    });
  }
  // Main output unitPrice is optional: when omitted the server fills in the loaded
  // HPP ((material + costs - byproduct NRV) / main qty). By-products must send NRV.
  data.outputs.forEach((o, idx) => {
    if (o.isByProduct && (o.unitPrice == null || o.unitPrice < 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'NRV produk sampingan wajib diisi (minimal 0).',
        path: ['outputs', idx, 'unitPrice'],
      });
    }
  });
});

export const UpdateProductionRunSchema = CreateProductionRunSchema;

// Bank Reconciliation
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

// Tax Config
export const CreateTaxConfigSchema = z.object({
  name: z.string().min(1, 'Nama pajak wajib diisi.'),
  rate: z.coerce.number().min(0, 'Tarif tidak boleh negatif.').max(100, 'Tarif maksimal 100%.'),
  type: z.enum(['sales', 'purchase', 'withholding'], { message: 'Tipe harus: sales, purchase, atau withholding.' }),
  accountId: z.string().nullable().optional(),
});

export const UpdateTaxConfigSchema = CreateTaxConfigSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// Service Item
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

// Stok Opname
const StockOpnameItemSchema = z.object({
  itemId: z.string().uuid('Item ID harus UUID yang valid.'),
  // Not validated >= 0: the form sends every item, including ones already negative
  // in the system. The route rejects actualStock < 0 only when it differs from system stock.
  actualStock: z.coerce.number(),
  // Optional manual unit value. If it differs from averageCost, the item is revalued
  // to it and the value difference is journaled to Selisih Persediaan.
  unitCost: z.coerce.number().min(0, 'Nilai satuan tidak boleh negatif.').optional(),
  notes: z.string().nullable().optional(),
});

export const CreateStockOpnameSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  // Warehouse where this opname session was counted. Preferred over the
  // default-warehouse fallback so user is explicit per session.
  warehouseId: z.string().uuid('Gudang wajib dipilih.').nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(StockOpnameItemSchema).min(1, 'Minimal satu item stok opname.'),
});

export const SubmitStockOpnameSchema = z.object({
  warehouseId: z.string().uuid('Gudang wajib dipilih.').nullable().optional(),
  items: z.array(StockOpnameItemSchema).min(1, 'Minimal satu item stok opname.'),
});

// Delivery Order (Surat Jalan)
// Physical delivery document. Decrements stock without GL impact — multiple
// DOs are aggregated into a single sales invoice for monthly/weekly billing.
const DeliveryOrderItemSchema = z.object({
  inventoryItemId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  itemName: z.string().min(1, 'Nama item wajib diisi.'),
  quantity: z.coerce.number().positive('Jumlah harus lebih dari 0.'),
  unit: z.string().min(1, 'Satuan wajib diisi.'),
  description: z.string().nullable().optional(),
});

export const CreateDeliveryOrderSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  partyId: z.string().uuid('Customer wajib dipilih.'),
  nomorMobil: z.string().max(50).nullable().optional(),
  driverName: z.string().max(200).nullable().optional(),
  recipientName: z.string().max(200).nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(DeliveryOrderItemSchema).min(1, 'Minimal satu item.'),
  // Requires the inventory.negative_stock capability (checked in the route) and negativeStockReason.
  allowNegativeStock: z.boolean().optional().default(false),
  negativeStockReason: z.string().max(500).nullable().optional(),
  // Surat Jalan Sementara yang ditautkan ke DO resmi ini (opsional)
  temporaryNoteIds: z.array(z.string()).optional(),
}).superRefine((data, ctx) => {
  if (data.allowNegativeStock && (!data.negativeStockReason || data.negativeStockReason.trim().length < 10)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Alasan bypass stok minus wajib diisi (minimal 10 karakter).',
      path: ['negativeStockReason'],
    });
  }
});

// Body for the retroactive "DO dari Invoice" flow. Items are inherited from
// the invoice, so the request only carries the physical-delivery metadata.
export const CreateDOFromInvoiceSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  nomorMobil: z.string().max(50).nullable().optional(),
  driverName: z.string().max(200).nullable().optional(),
  recipientName: z.string().max(200).nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Goods Receipt (STT / BPB - Bukti Penerimaan Barang)
// Posting stok masuk dari supplier. lockedUnitCost diisi saat STT submit dan
// menjadi truth untuk averageCost. Variance ke PI rate posted ke "Selisih
// Harga Pembelian" saat PI submit nanti.
const GoodsReceiptItemSchema = z.object({
  inventoryItemId: z.string().uuid('Item inventaris wajib dipilih.'),
  warehouseId: z.string().uuid('Gudang wajib dipilih.'),
  itemName: z.string().min(1, 'Nama item wajib diisi.'),
  quantity: z.coerce.number().positive('Jumlah harus lebih dari 0.'),
  unit: z.string().min(1, 'Satuan wajib diisi.'),
  // Optional: when 0/undefined the current averageCost is the provisional cost for
  // the accrual and WAC; PI submit posts the difference to Selisih Harga Pembelian.
  lockedUnitCost: z.coerce.number().min(0).default(0).optional(),
  description: z.string().nullable().optional(),
  purchaseOrderItemId: z.string().uuid().nullable().optional(),
});

export const CreateGoodsReceiptSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  partyId: z.string().uuid('Supplier wajib dipilih.'),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  // Barang titipan pelanggan (jasa repros): GL nol, tak bisa di-invoice.
  isCustomerOwned: z.boolean().optional().default(false),
  nomorMobil: z.string().max(50).nullable().optional(),
  driverName: z.string().max(200).nullable().optional(),
  recipientName: z.string().max(200).nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(GoodsReceiptItemSchema).min(1, 'Minimal satu item.'),
});

// "STT dari PO" — header meta saja, items diturunkan dari PO. lockedUnitCost
// di setiap baris dipanggil dari estimatedRate PO item kecuali user override.
export const CreateGRFromPOSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  nomorMobil: z.string().max(50).nullable().optional(),
  driverName: z.string().max(200).nullable().optional(),
  recipientName: z.string().max(200).nullable().optional(),
  notes: z.string().nullable().optional(),
  // Optional per-item qty + cost override (subset of PO items).
  itemOverrides: z
    .array(
      z.object({
        purchaseOrderItemId: z.string().uuid(),
        warehouseId: z.string().uuid(),
        quantity: z.coerce.number().positive(),
        lockedUnitCost: z.coerce.number().min(0),
      }),
    )
    .optional(),
});

// Purchase Order (PO)
// PO bisa Umum (partyId null — boleh dipenuhi supplier mana saja) atau Khusus
// (partyId terikat ke supplier tertentu). Tidak ada GL impact, tidak ada
// stock impact. Hanya planning document.
const PurchaseOrderItemSchema = z.object({
  inventoryItemId: z.string().uuid().nullable().optional(),
  itemName: z.string().min(1, 'Nama item wajib diisi.'),
  quantity: z.coerce.number().positive('Jumlah harus lebih dari 0.'),
  unit: z.string().min(1, 'Satuan wajib diisi.'),
  estimatedRate: z.coerce.number().min(0).optional().default(0),
  discount: z.coerce.number().min(0, 'Diskon tidak boleh negatif.').max(100, 'Diskon maksimal 100%.').optional().default(0),
  taxPct: z.coerce.number().min(0, 'PPN tidak boleh negatif.').max(100, 'PPN maksimal 100%.').optional().default(0),
  description: z.string().nullable().optional(),
});

export const CreatePurchaseOrderSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  partyId: z.string().uuid().nullable().optional(), // null = PO Umum
  expectedDeliveryDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  paymentTermDays: z.coerce.number().int('Termin harus bilangan bulat.').min(0).max(365, 'Termin maksimal 365 hari.').nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  supplierQuoteRef: z.string().max(100, 'No. penawaran maksimal 100 karakter.').nullable().optional(),
  otherCosts: z.coerce.number().min(0, 'Biaya lain tidak boleh negatif.').optional().default(0),
  otherCostsLabel: z.string().max(100).nullable().optional(),
  saveAs: z.enum(['draft', 'submit']).optional().default('submit'),
  items: z.array(PurchaseOrderItemSchema).min(1, 'Minimal satu item.'),
});

// Short-close PO ("Tutup PO") — alasan wajib.
export const ClosePurchaseOrderSchema = z.object({
  reason: z.string().trim().min(5, 'Alasan penutupan minimal 5 karakter.').max(500),
});

// Revisi Harga Purchase Invoice
// Supplier mengoreksi harga setelah PI submit (barang bisa sudah diproduksi).
export const RevisePurchaseInvoiceSchema = z.object({
  lines: z.array(z.object({
    itemId: z.string().uuid('ID baris tidak valid.'),
    newRate: z.coerce.number().min(0, 'Harga baru tidak boleh negatif.'),
  })).min(1, 'Minimal satu baris untuk direvisi.'),
  reason: z.string().min(10, 'Alasan revisi minimal 10 karakter.').max(500),
});

// Telegram Notifikasi
// botToken opsional saat update (kosong/undefined = pertahankan yang tersimpan).
export const UpdateTelegramConfigSchema = z.object({
  enabled: z.boolean().optional(),
  botToken: z.string().nullable().optional(),
  chatId: z.string().nullable().optional(),
  notifyApproval: z.boolean().optional(),
  notifyInvoiceOverdue: z.boolean().optional(),
  notifyLowStock: z.boolean().optional(),
  personalEnabled: z.boolean().optional(),
});

export const TestTelegramSchema = z.object({
  botToken: z.string().nullable().optional(),
  chatId: z.string().nullable().optional(),
});

// Pengajuan Pembayaran (Payment Request)
const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.');
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

const TravelCategorySchema = z.enum(['TRANSPORT', 'LODGING', 'PER_DIEM', 'MEALS', 'OTHER']);

export const PaymentRequestLineSchema = z.object({
  description: z.string().trim().min(1, 'Uraian rincian wajib diisi.').max(500),
  amount: z.number().positive('Nominal harus lebih dari 0.').max(1e13, 'Nominal terlalu besar.'),
  expenseAccountId: z.string().min(1).nullable().optional(),
  costCenterId: z.string().min(1).nullable().optional(),
  expenseDate: IsoDay.nullable().optional(),
  // Perjalanan dinas: kategori + tarif × jumlah (amount = quantity × unitAmount).
  category: TravelCategorySchema.nullable().optional(),
  quantity: z.number().positive().max(1e6).nullable().optional(),
  unitAmount: z.number().positive().max(1e13).nullable().optional(),
});

export const PaymentRequestInputSchema = z.object({
  typeId: z.string().min(1, 'Jenis pengajuan wajib dipilih.'),
  costCenterId: z.string().min(1).nullable().optional(),
  department: optText(100),
  payeeKind: z.enum(['EMPLOYEE', 'VENDOR']),
  partyId: z.string().min(1).nullable().optional(),
  payeeName: z.string().trim().min(1, 'Nama penerima wajib diisi.').max(200),
  bankName: optText(100),
  bankAccountNo: optText(50),
  bankAccountHolder: optText(200),
  purpose: z.string().trim().min(3, 'Keperluan minimal 3 karakter.').max(1000),
  neededBy: IsoDay.nullable().optional(),
  // Hanya dipakai untuk jenis TRAVEL (diabaikan untuk jenis lain).
  travelDestination: optText(200),
  travelStartDate: IsoDay.nullable().optional(),
  travelEndDate: IsoDay.nullable().optional(),
  travelParticipants: optText(500),
  lines: z.array(PaymentRequestLineSchema).max(100, 'Maksimal 100 baris rincian.'),
});

// Pertanggungjawaban uang muka / perjalanan dinas (settlement)
export const PaymentRequestSettlementLineSchema = z.object({
  description: z.string().trim().min(1, 'Uraian realisasi wajib diisi.').max(500),
  amount: z.number().positive('Nominal harus lebih dari 0.').max(1e13, 'Nominal terlalu besar.'),
  expenseDate: IsoDay.nullable().optional(),
  category: TravelCategorySchema.nullable().optional(),
  plannedLineId: z.string().min(1).nullable().optional(),
  expenseAccountId: z.string().min(1).nullable().optional(),
});

export const PaymentRequestSettlementDraftSchema = z.object({
  note: optText(1000),
  deadline: IsoDay.nullable().optional(),
  lines: z.array(PaymentRequestSettlementLineSchema).max(100, 'Maksimal 100 baris realisasi.'),
});

const LineAccountsSchema = z.array(z.object({ id: z.string().min(1), expenseAccountId: z.string().min(1).nullable() })).max(100);

/** Finance preview of the settlement journal (nothing is saved). */
export const PaymentRequestSettlementPreviewSchema = z.object({
  lineAccounts: LineAccountsSchema.optional(),
  cashAccountId: z.string().min(1).nullable().optional(),
});

/** Finance step: verify accounts, record the cash movement (if any) and post. */
export const PaymentRequestSettlementPostSchema = z.object({
  settlementDate: IsoDay,
  lineAccounts: LineAccountsSchema.optional(),
  cashAccountId: z.string().min(1).nullable().optional(),
  reference: optText(100),
  note: optText(1000),
});

export const PaymentRequestDecisionSchema = z.object({
  note: optText(1000),
  /** Finance step only: expense account per line (by line id). */
  lineAccounts: z.array(z.object({ id: z.string().min(1), expenseAccountId: z.string().min(1).nullable() })).max(100).optional(),
});

export const PaymentRequestReasonSchema = z.object({
  reason: z.string().trim().min(3, 'Alasan minimal 3 karakter.').max(1000),
});

export const PaymentRequestVerifySchema = z.object({
  lineAccounts: z.array(z.object({ id: z.string().min(1), expenseAccountId: z.string().min(1).nullable() })).min(1).max(100),
});

export const PaymentRequestPaySchema = z.object({
  cashAccountId: z.string().min(1, 'Akun kas/bank wajib dipilih.'),
  paymentDate: IsoDay,
  reference: optText(100),
});

export const PaymentRequestTypeSchema = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9_-]+$/, 'Kode hanya huruf besar, angka, _ atau -.'),
  name: z.string().trim().min(2).max(100),
  kind: z.enum(['REIMBURSEMENT', 'VENDOR_PAYMENT', 'CASH_ADVANCE', 'TRAVEL', 'OTHER']),
  description: optText(500),
  defaultExpenseAccountId: z.string().min(1).nullable().optional(),
  requiresAttachment: z.boolean().default(false),
  requiresSettlement: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

// Tagihan EAM (Pengajuan Pembayaran > Tagihan EAM)
export const EamPaySchema = z.object({
  method: z.enum(['JOURNAL', 'PURCHASE_INVOICE']),
  accountId: z.string().min(1).optional().nullable(),
  creditAccountId: z.string().min(1).optional().nullable(),
  partyId: z.string().min(1).optional().nullable(),
  amount: z.number().positive().optional().nullable(),
  date: z.string().min(1).optional().nullable(),
  dueDate: z.string().min(1).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
