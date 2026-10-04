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
  // Phase 5: batch picker. When sourceMovementId is set, the SM Out generated
  // at submit (or DO submit for from-DO lines) links back to this inbound
  // batch and the unit_cost_loaded snapshot from the batch is copied onto
  // the sales line for Phase 6 "loaded margin" reports.
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

// ─── Retur Penjualan (Sales Return) ──────────────────────────────────────────
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

// ─── Quotation ───────────────────────────────────────────────────────────────
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

// ─── Inquiry ────────────────────────────────────────────────────────────────
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
  // CustomerDeposit-only: tag uang muka ini ke Sales Order tertentu, supaya
  // dari layar SO kelihatan DP yang sudah diterima untuk pesanan itu.
  salesOrderId: z.string().uuid().nullable().optional(),
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

// ─── Vendor Deposit Refund / Offset ───────────────────────────────────────────
// Menyelesaikan sisa uang muka vendor (DP belanja yang dikembalikan vendor):
//   - offset terhadap hutang (otomatis FIFO ke purchase invoice terlama), dan/atau
//   - pengembalian kas ke rekening bank/kas.
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

// ─── Uang Jaminan Proyek ─────────────────────────────────────────────────────
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

// ─── Party ────────────────────────────────────────────────────────────────────
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
  // Phase 5: batch picker for adjustment Out
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

// ─── Production Cost Standards (Phase 1 — master rate for cost components) ──
// costSide: 'InputSide' = charged per input qty (e.g. listrik per kg input).
//           'OutputSide' = charged per main output qty (e.g. kirim per kg output).
// basis:    'InputQty'  = rate × sum(input qty)
//           'OutputQty' = rate × main output qty
//           'Fixed'     = flat per run (rate is the total)
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

// ─── Production Processes (master traceability list) ─────────────────────────
export const CreateProductionProcessSchema = z.object({
  name: z.string().min(1, 'Nama proses wajib diisi.').max(100),
  description: z.string().nullable().optional(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export const UpdateProductionProcessSchema = CreateProductionProcessSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

// ─── Machine (master mesin untuk OEE tracking) ───────────────────────────────
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

// ─── User Management ─────────────────────────────────────────────────────────
// RBAC dinamis: role = key Role (string). Keberadaan role divalidasi di route
// users (cek ke tabel roles), bukan enum hardcoded lagi.
const UserRoleEnum = z.string().min(1, 'Role wajib diisi.');

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
  // Phase 2: batch picker. When provided, this input line consumes a specific
  // inbound stock movement (batch). batchUnitCost is captured from the picker
  // so the production cost is locked even if WAC changes later. Both fields
  // are optional for backward compatibility — callers that don't send them
  // fall back to WAC-based costing (legacy behavior).
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

// B2 multi-mesin: satu baris mesin yang dipakai dalam run (paralel, on/off
// sendiri). OEE dihitung per mesin; output dialokasi proporsional run-time.
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
  // Phase 3: cost components for loaded HPP computation. Each cost entry is a
  // snapshot at submit time — retroactive master edits don't affect history.
  // GL is NOT posted from these — real expenses still flow via JV/invoice.
  costs: z.array(ProductionRunCostInputSchema).optional().default([]),
  // Phase 3: when set, computedHpp is locked to this value (user override the
  // auto-computed loaded HPP). Otherwise the service computes it from
  // material + costs - byproduct value.
  hppOverride: z.coerce.number().min(0).nullable().optional(),
  // Traceability: list of process master ids that this run went through.
  // Optional + order-insensitive (multiselect). Empty array = unspecified.
  processIds: z.array(z.string().uuid()).optional().default([]),
  // ─── OEE tracking (semua opsional, backward-compatible) ──────────────────
  // B2 multi-mesin: jendela shift standar (planned production time) & istirahat.
  plannedStart: z.coerce.date().nullable().optional(),
  plannedEnd: z.coerce.date().nullable().optional(),
  breakStart: z.coerce.date().nullable().optional(),
  breakEnd: z.coerce.date().nullable().optional(),
  // Mesin paralel dalam run; OEE dihitung per mesin + agregat line.
  runMachines: z.array(ProductionRunMachineLineSchema).optional().default([]),
  shift: z.string().max(20).nullable().optional(),               // "1" | "2" | "3"
  shiftLead: z.string().max(150).nullable().optional(),          // kepala shift (teks bebas)
  manpowerCount: z.coerce.number().int().min(0).nullable().optional(),
  // OEE Quality/output is DERIVED dari baris Input/Output run (bukan manual
  // good/reject). goodQty/rejectQty tidak lagi dipakai — frontend berhenti
  // mengirimnya. Field dibiarkan ignored-optional supaya payload lama tetap
  // diterima tanpa error.
  goodQty: z.coerce.number().min(0).nullable().optional(),       // LEGACY — diabaikan
  rejectQty: z.coerce.number().min(0).nullable().optional(),     // LEGACY — diabaikan
  downtimes: z.array(ProductionDowntimeLineSchema).optional().default([]),
  // ─── LEGACY (single-machine, diabaikan untuk perhitungan B2) ─────────────
  // Tetap opsional supaya payload lama tidak ditolak. machineId/startAt/endAt
  // tidak lagi dipakai untuk compute OEE.
  machineId: z.string().uuid('Mesin tidak valid.').nullable().optional(),
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
  // When true, production can consume more than current stock (stock goes negative).
  // ADMIN ONLY (enforced di route handler). Wajib isi `negativeStockReason`.
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
  // Main output unitPrice is OPTIONAL (Phase 3+): when omitted, the server
  // back-fills it with the computed loaded HPP (material + costs − byproduct
  // NRV, divided by main qty). User can still supply a value to override.
  // By-products keep the strict requirement so their NRV is always explicit.
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
  // Catatan: TIDAK divalidasi >=0 di sini. Form opname mengirim SEMUA item
  // gudang untuk audit trail, termasuk item yang stok sistemnya sudah minus
  // secara historis (belum disentuh user di sesi opname ini). Menolak nilai
  // negatif di sini akan memblokir seluruh submit walau item minusnya bukan
  // yang sedang di-opname. Guard sebenarnya (tolak input BARU yang negatif)
  // ada di route: hanya reject actualStock<0 kalau nilainya BEDA dari stok
  // sistem saat ini (artinya user aktif mengetik angka negatif).
  actualStock: z.coerce.number(),
  // Nilai satuan manual (opsional). Bila diisi dan berbeda dari averageCost
  // item, opname akan MEREVALUASI nilai persediaan: averageCost item di-set
  // ke nilai ini dan selisih nilainya dijurnal ke akun Selisih Persediaan.
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

// ─── Delivery Order (Surat Jalan) ────────────────────────────────────────────
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
  // ADMIN ONLY bypass — wajib isi negativeStockReason. Enforced di route handler.
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

// ─── Goods Receipt (STT / BPB - Bukti Penerimaan Barang) ─────────────────────
// Posting stok masuk dari supplier. lockedUnitCost diisi saat STT submit dan
// menjadi truth untuk averageCost. Variance ke PI rate posted ke "Selisih
// Harga Pembelian" saat PI submit nanti.
const GoodsReceiptItemSchema = z.object({
  inventoryItemId: z.string().uuid('Item inventaris wajib dipilih.'),
  warehouseId: z.string().uuid('Gudang wajib dipilih.'),
  itemName: z.string().min(1, 'Nama item wajib diisi.'),
  quantity: z.coerce.number().positive('Jumlah harus lebih dari 0.'),
  unit: z.string().min(1, 'Satuan wajib diisi.'),
  // Optional — STT tidak punya harga di UI. Kalau dikirim 0/undefined,
  // service akan pakai averageCost item saat ini sebagai provisional cost
  // untuk JE accrual + weighted-avg. PI submit nanti yang kasih harga
  // aktual, selisih posted ke "Selisih Harga Pembelian".
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

// ─── Purchase Order (PO) ─────────────────────────────────────────────────────
// PO bisa Umum (partyId null — boleh dipenuhi supplier mana saja) atau Khusus
// (partyId terikat ke supplier tertentu). Tidak ada GL impact, tidak ada
// stock impact. Hanya planning document.
const PurchaseOrderItemSchema = z.object({
  inventoryItemId: z.string().uuid().nullable().optional(),
  itemName: z.string().min(1, 'Nama item wajib diisi.'),
  quantity: z.coerce.number().positive('Jumlah harus lebih dari 0.'),
  unit: z.string().min(1, 'Satuan wajib diisi.'),
  estimatedRate: z.coerce.number().min(0).optional().default(0),
  description: z.string().nullable().optional(),
});

export const CreatePurchaseOrderSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  partyId: z.string().uuid().nullable().optional(), // null = PO Umum
  expectedDeliveryDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  items: z.array(PurchaseOrderItemSchema).min(1, 'Minimal satu item.'),
});

// Short-close PO ("Tutup PO") — alasan wajib.
export const ClosePurchaseOrderSchema = z.object({
  reason: z.string().trim().min(5, 'Alasan penutupan minimal 5 karakter.').max(500),
});

// ─── Revisi Harga Purchase Invoice ───────────────────────────────────────────
// Supplier mengoreksi harga setelah PI submit (barang bisa sudah diproduksi).
export const RevisePurchaseInvoiceSchema = z.object({
  lines: z.array(z.object({
    itemId: z.string().uuid('ID baris tidak valid.'),
    newRate: z.coerce.number().min(0, 'Harga baru tidak boleh negatif.'),
  })).min(1, 'Minimal satu baris untuk direvisi.'),
  reason: z.string().min(10, 'Alasan revisi minimal 10 karakter.').max(500),
});

// ─── Telegram Notifikasi ─────────────────────────────────────────────────────
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
