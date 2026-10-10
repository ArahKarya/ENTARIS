// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import InvoicePDF from './InvoicePDF';
import SalesOrderPDF from './SalesOrderPDF';
import QuotationPDF from './QuotationPDF';
import DeliveryOrderPDF from './DeliveryOrderPDF';
import GoodsReceiptPDF from './GoodsReceiptPDF';
import WarehouseTransferPDF from './WarehouseTransferPDF';
import WarehouseStockPDF from './WarehouseStockPDF';
import StockOpnamePDF from './StockOpnamePDF';
import ProductionRunPDF from './ProductionRunPDF';
import { DailyReportPDF } from './DailyReportPDF';
import { TrialBalancePDF, ProfitLossPDF, BalanceSheetPDF, CashFlowPDF, AgingPDF } from './ReportPDF';
import VehicleReportPDF from './VehicleReportPDF';
import InspectionDetailPDF from './InspectionDetailPDF';
import { pdfDate, pdfMoneyAuto, pdfNum, pdfRp, pdfRpAuto } from './pdfFormat';

const company = { name: 'PT Contoh Pangan', address: 'Bandar Lampung', phone: null, email: null, taxId: null, logoUrl: null };
const co = { ...company, invoiceSettings: null };
const day = '2026-10-04T00:00:00.000Z';

const emptyDaily = {
  sales: { invoices: [], summary: { count: 0, totalRevenue: 0, totalNewReceivables: 0, totalQty: 0 } },
  purchases: { invoices: [], summary: { count: 0, totalSpend: 0, totalNewPayables: 0, totalQty: 0 } },
  production: { runs: [], summary: { totalRuns: 0, totalInputKg: 0, totalOutputKg: 0, avgYield: null } },
  stock: { summary: { totalWarehouses: 0, totalItemLines: 0, totalNegative: 0, grandTotalValue: 0 }, warehouses: [], valuationNote: null },
  finance: { summary: { totalIn: 0, totalOut: 0, netCashFlow: 0 }, manualJournals: 0, cashBankBalances: [], paymentsIn: [], paymentsOut: [] },
  receivables: { summary: { totalOutstanding: 0, totalOverdue: 0, totalCustomers: 0 }, byCustomer: [] },
  payables: { summary: { totalOutstanding: 0, totalOverdue: 0, totalSuppliers: 0 }, bySupplier: [] },
  vendorDeposits: { summary: { totalDeposits: 0, totalApplied: 0, totalRemaining: 0 }, deposits: [] },
};

const ncrItems = [{ code: 'A-1', name: 'Gabah', qty: 1250.5, unit: 'Kg' }, { name: 'Karung', qty: 3, unit: 'Pcs', description: 'Putih' }];

const cases: Array<[string, () => ReactElement]> = [
  ['InvoicePDF', () => (
    <InvoicePDF type="sales" invoiceNumber="SI-1" date={day} status="Submitted" grandTotal={1110000} party={{ name: 'CV Maju' }}
      items={[{ itemName: 'Beras', quantity: 100, unit: 'Kg', rate: 10000, amount: 1000000, taxPct: 11 }]} company={company} />
  )],
  ['SalesOrderPDF', () => <SalesOrderPDF so={{ soNumber: 'PSN-1', date: day, status: 'Draft', customer: { name: 'CV Maju' }, items: [], grandTotal: 0 }} company={company} />],
  ['QuotationPDF', () => (
    <QuotationPDF company={co} quotation={{
      quotationNumber: 'QO-1', date: day, validUntil: day, status: 'Draft', customer: { name: 'CV Maju' }, subtotal: 1000, potongan: 0, biayaLain: 0, grandTotal: 1000,
      items: [{ itemName: 'Beras', quantity: 1, unit: 'Kg', rate: 1000, discount: 0, amount: 1000 }],
    }} />
  )],
  ['DeliveryOrderPDF', () => <DeliveryOrderPDF status="Submitted" doNumber="DO-1" date={day} customer={{ name: 'CV Maju' }} items={ncrItems} company={company} />],
  ['DeliveryOrderPDF (dari SO, dengan No. PO)', () => <DeliveryOrderPDF status="Submitted" doNumber="DO-2" date={day} poRef="PO-7702" soNumber="PSN-202609-0009" customer={{ name: 'CV Maju' }} items={ncrItems} company={company} />],
  ['DeliveryOrderPDF (SO tanpa No. PO)', () => <DeliveryOrderPDF status="Submitted" doNumber="DO-3" date={day} poRef="  " soNumber="PSN-202609-0010" customer={{ name: 'CV Maju' }} items={ncrItems} company={company} />],
  ['GoodsReceiptPDF', () => <GoodsReceiptPDF sttNumber="STT-1" date={day} supplier={{ name: 'CV Tani' }} items={ncrItems} company={company} />],
  ['WarehouseTransferPDF', () => <WarehouseTransferPDF transferNumber="TRF-1" date={day} fromWarehouseName="A" toWarehouseName="B" items={ncrItems} company={company} />],
  ['WarehouseStockPDF', () => (
    <WarehouseStockPDF generatedAt={new Date()} company={company} warehouses={[
      { code: 'G1', name: 'Gudang 1', location: null, isDefault: true, items: [{ code: 'A', name: 'Gabah', unit: 'Kg', category: null, currentStock: 10, averageCost: 5000 }] },
      { code: 'G2', name: 'Gudang 2', location: null, isDefault: false, items: [] },
    ]} />
  )],
  ['StockOpnamePDF', () => (
    <StockOpnamePDF opnameNumber="SO-1" date={day} status="Submitted" company={company}
      items={[{ code: 'A', name: 'Gabah', unit: 'Kg', systemStock: 10, actualStock: 8, difference: -2, unitCost: 5000, totalValue: -10000 }]} />
  )],
  ['ProductionRunPDF', () => (
    <ProductionRunPDF runNumber="PR-1" date={day} company={company} inputs={[{ name: 'Gabah', qty: 100, unit: 'Kg', unitCost: 5000 }]}
      outputs={[{ name: 'Beras', qty: 60, unit: 'Kg', unitCost: 9000 }]} byproducts={[]} costs={[]}
      totals={{ totalMaterialCost: 500000, totalCostInputSide: 0, totalCostOutputSide: 0, totalByproductValue: 0, computedHpp: 8333.33, hppManualOverride: false, mainOutputQty: 60 }} />
  )],
  ['DailyReportPDF', () => <DailyReportPDF company={company} date={day} data={emptyDaily} />],
  ['TrialBalancePDF', () => <TrialBalancePDF company={company} period="Okt 2026" rows={[{ accountNumber: '1100', accountName: 'Kas', debit: 1000, credit: 0 }]} />],
  ['ProfitLossPDF', () => <ProfitLossPDF company={company} period="Okt 2026" revenue={[]} expense={[]} totalRevenue={0} totalExpense={0} netProfit={0} />],
  ['BalanceSheetPDF', () => (
    <BalanceSheetPDF company={company} asOf="2026-10-31" assets={[]} totalAssets={0} liabilities={[]} equity={[]} totalLiabilities={0} totalEquity={0} />
  )],
  ['CashFlowPDF', () => (
    <CashFlowPDF company={company} period="2026-01-01 s/d 2026-10-31" operating={-500} investing={0} financing={1000} netChange={500}
      operatingItems={[{ description: 'Beban Listrik', amount: -500 }]} financingItems={[{ description: 'Setoran Modal', amount: 1000 }]} />
  )],
  ['AgingPDF', () => <AgingPDF company={company} type="Customer" rows={[]} totals={{ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 } as never} />],
  ['VehicleReportPDF', () => (
    <VehicleReportPDF company={{ name: 'PT Contoh', address: null }} generatedAt={new Date()} report={{
      period: { from: day, to: day, months: 1 },
      asset: { id: '1', code: 'V-1', name: 'Truk', categoryName: null, status: 'Active', condition: 'Baik', noPlat: 'BE 1 AB', brand: null, tipe: null, tahunProduksi: null, odometerTerakhir: null },
      tco: { breakdown: { service: 0, fuel: 0, tax: 0, insurance: 0, incident: 0 }, totalCost: 0, costPerMonth: 0, distanceKm: null, costPerKm: null, fuelCostPerKm: null, totalLiters: 0, kmPerLiter: null, counts: { service: 0, fuel: 0, tax: 0, insurance: 0, incident: 0 } },
      monthlyTrend: [], compliance: { taxes: [], insurances: [], openIncidents: [], issueCount: 0 },
      condition: { lastInspection: null, activeTires: [], activeTireCount: 0, lastOil: null },
    }} />
  )],
  ['InspectionDetailPDF', () => (
    <InspectionDetailPDF company={{ name: 'PT Contoh', address: null }} generatedAt={new Date()} printedBy="Admin" photos={[]} categories={[]}
      asset={{ code: 'V-1', name: 'Truk', noPlat: 'BE 1 AB' } as never} inspection={{ tanggal: day, overallResult: 'BAIK', odometer: 1000 } as never} />
  )],
];

describe('PDF templates render a valid document for a minimal fixture', () => {
  it.each(cases)('%s', async (_name, build) => {
    const buf = await renderToBuffer(build() as never);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.subarray(-8).toString()).toContain('%%EOF');
  }, 30000);
});

describe('pdfFormat', () => {
  it('formats Indonesian numbers, rupiah and dates through lib/format', () => {
    expect(pdfNum(1250.5, 3)).toBe('1.250,5');
    expect(pdfRp(1250000)).toContain('1.250.000');
    expect(pdfMoneyAuto(5500)).toBe('5.500');
    expect(pdfMoneyAuto(5500.5)).toBe('5.500,50');
    expect(pdfRpAuto(10)).toContain('10');
    expect(pdfDate('2026-10-04')).toBe('4 Oktober 2026');
    expect(pdfDate(null)).toBe('—');
  });
});
