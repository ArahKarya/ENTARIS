/** Shape of GET /reports/daily (only the fields the page renders). */
export interface LineItem { itemName: string }

export interface TradeInvoice {
  invoiceNumber: string;
  customerName?: string;
  supplierName?: string;
  items: LineItem[];
  totalQty: number;
  grandTotal: number;
  outstanding: number;
}

export interface RunInput { itemName: string; quantity: number; unit: string }
export interface RunOutput extends RunInput { isByProduct?: boolean }
export interface ProductionRun {
  runNumber: string;
  inputs: RunInput[];
  outputs: RunOutput[];
  yieldPct: number | null;
}

export interface StockItem { code: string; name: string; unit: string; qty: number; averageCost: number; value: number }
export interface StockWarehouse {
  code: string;
  name: string;
  isDefault?: boolean;
  itemCount: number;
  totalValue: number;
  items: StockItem[];
}

export interface PaymentLine { paymentNumber: string; partyName: string; amount: number }
export interface CashBankBalance { accountNumber: string; accountName: string; balance: number }

export interface AgingRow {
  customerName?: string;
  supplierName?: string;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d91_plus: number;
  total: number;
}

export interface DepositRow {
  paymentNumber: string;
  supplierName: string;
  amount: number;
  totalApplied: number;
  remaining: number;
}

export interface DailyData {
  sales: {
    summary: { count: number; totalQty: number; totalRevenue: number; totalNewReceivables: number };
    invoices: TradeInvoice[];
  };
  purchases: {
    summary: { count: number; totalQty: number; totalSpend: number; totalNewPayables: number };
    invoices: TradeInvoice[];
  };
  production: {
    summary: { totalRuns: number; totalInputKg: number; totalOutputKg: number; avgYield: number };
    runs: ProductionRun[];
  };
  stock?: {
    summary: { totalWarehouses: number; totalItemLines: number; totalNegative: number; grandTotalValue: number };
    valuationNote: string;
    warehouses: StockWarehouse[];
  };
  finance: {
    summary: { totalIn: number; totalOut: number; netCashFlow: number };
    manualJournals: number;
    cashBankBalances: CashBankBalance[];
    paymentsIn: PaymentLine[];
    paymentsOut: PaymentLine[];
  };
  receivables: {
    summary: { totalOutstanding: number; totalOverdue: number; totalCustomers: number };
    byCustomer: AgingRow[];
  };
  payables: {
    summary: { totalOutstanding: number; totalOverdue: number; totalSuppliers: number };
    bySupplier: AgingRow[];
  };
  vendorDeposits: {
    summary: { totalDeposits: number; totalApplied: number; totalRemaining: number };
    deposits: DepositRow[];
  };
}
