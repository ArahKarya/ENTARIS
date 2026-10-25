// Entry bundel SSR: dipakai server untuk merender PDF dengan templat YANG SAMA dengan UI.
// Pemetaan payload API → props templat di sini meniru drawer terkait (satu-satunya tempat server tahu bentuk props).
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import i18n from '../i18n';
import QuotationPDF from '../lib/pdf/QuotationPDF';
import ProformaInvoicePDF from '../lib/pdf/ProformaInvoicePDF';
import SalesOrderPDF from '../lib/pdf/SalesOrderPDF';
import PurchaseOrderPDF from '../lib/pdf/PurchaseOrderPDF';
import DeliveryOrderPDF from '../lib/pdf/DeliveryOrderPDF';
import GoodsReceiptPDF from '../lib/pdf/GoodsReceiptPDF';
import WarehouseTransferPDF from '../lib/pdf/WarehouseTransferPDF';
import StockOpnamePDF from '../lib/pdf/StockOpnamePDF';
import ProductionRunPDF from '../lib/pdf/ProductionRunPDF';
import { ProfitLossPDF, BalanceSheetPDF, TrialBalancePDF, CashFlowPDF, AgingPDF } from '../lib/pdf/ReportPDF';
import { DailyReportPDF } from '../lib/pdf/DailyReportPDF';
import { buildInvoicePdf, deriveInvoicePdfArgs } from '../components/invoice-detail/buildInvoicePdf';
import { buildPdfProps } from '../components/production/run-pdf-props';

export type PdfKind =
  | 'quotation'
  | 'proforma_invoice'
  | 'sales_order'
  | 'purchase_order'
  | 'delivery_order'
  | 'goods_receipt'
  | 'stock_transfer'
  | 'stock_opname'
  | 'production_run'
  | 'sales_invoice'
  | 'purchase_invoice'
  | 'report_profit_loss'
  | 'report_balance_sheet'
  | 'report_trial_balance'
  | 'report_cash_flow'
  | 'report_aging'
  | 'report_daily';

/** Parameter laporan yang dikirim server (dari docId): `periode` untuk rentang, `date` untuk tanggal tunggal, `agingType`. */
export interface ReportParams { startDate?: string; endDate?: string; date?: string; agingType?: 'Customer' | 'Supplier' }



export interface PdfCompany {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  logoUrl: string | null;
  invoiceSettings: unknown;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- payload API tak bertipe (sama dengan drawer) */
const pdfCompany = (c: PdfCompany) => ({ name: c.name, address: c.address, phone: c.phone, email: c.email, taxId: c.taxId, logoUrl: c.logoUrl });
const itemLine = (it: any) => ({ code: it.inventoryItem?.code ?? null, name: it.itemName, qty: Number(it.quantity), unit: it.unit, description: it.description });
const numv = (v: unknown) => Number(v ?? 0);
/** Sama dengan useCompanyPDF: pengaturan perusahaan → header PDF. */
export function companyFromSettings(data: any, fallbackName = 'Perusahaan'): PdfCompany {
  return {
    name: data?.companyName || fallbackName,
    address: data?.address || null,
    phone: data?.phone || null,
    email: data?.email || null,
    taxId: data?.taxId || null,
    logoUrl: data?.logoUrl || null,
    invoiceSettings: data?.invoiceSettings || null,
  };
}

const rangeLabel = (r: ReportParams) => i18n.getFixedT(null, 'reports')('reportsShared.dateRange', { start: r.startDate, end: r.endDate });

function build(kind: PdfKind, p: any, company: PdfCompany, rp: ReportParams = {}): { element: React.ReactElement; fileName: string } {
  switch (kind) {
    case 'report_profit_loss':
      return {
        element: (
          <ProfitLossPDF company={company} period={rangeLabel(rp)} revenue={p.revenue ?? []} expense={p.expense ?? []}
            totalRevenue={p.totalRevenue ?? 0} totalExpense={p.totalExpense ?? 0} netProfit={p.netProfit ?? 0} />
        ),
        fileName: `Laba-Rugi-${rp.startDate}-sd-${rp.endDate}.pdf`,
      };
    case 'report_balance_sheet':
      return {
        element: (
          <BalanceSheetPDF company={company} asOf={rp.date as string} assets={p.assets ?? []} liabilities={p.liabilities ?? []} equity={p.equity ?? []}
            totalAssets={p.totalAssets ?? 0} totalLiabilities={p.totalLiabilities ?? 0} totalEquity={p.totalEquity ?? 0} />
        ),
        fileName: `Neraca-${rp.date}.pdf`,
      };
    case 'report_trial_balance': {
      const rows = (Array.isArray(p) ? p : []).map((item: any) => ({
        accountNumber: item.accountNumber, accountName: item.name, debit: Number(item.debit), credit: Number(item.credit),
      }));
      return { element: <TrialBalancePDF company={company} period={rangeLabel(rp)} rows={rows} />, fileName: `Neraca-Saldo-${rp.startDate}-sd-${rp.endDate}.pdf` };
    }
    case 'report_cash_flow': {
      const items = (xs: any[] | undefined) => (xs ?? []).map((it) => ({ description: it.name, amount: it.amount }));
      return {
        element: (
          <CashFlowPDF company={company} period={rangeLabel(rp)} operating={p.operating ?? 0} investing={p.investing ?? 0} financing={p.financing ?? 0}
            netChange={p.netChange ?? 0} operatingItems={items(p.details?.operating)} investingItems={items(p.details?.investing)} financingItems={items(p.details?.financing)} />
        ),
        fileName: `Arus-Kas-${rp.startDate}-sd-${rp.endDate}.pdf`,
      };
    }
    case 'report_aging': {
      const src: any[] = Array.isArray(p) ? p : [];
      const sum = (k: string | number) => src.reduce((a, r) => a + numv(r[k]), 0);
      const rows = src.map((r) => ({ name: r.name, current: numv(r.current), d1_30: numv(r[1]), d31_60: numv(r[31]), d61_90: numv(r[61]), d91_plus: numv(r[91]), total: numv(r.total) }));
      const totals = { name: 'TOTAL', current: sum('current'), d1_30: sum(1), d31_60: sum(31), d61_90: sum(61), d91_plus: sum(91), total: sum('total') };
      const type = rp.agingType ?? 'Customer';
      return { element: <AgingPDF company={company} type={type} rows={rows} totals={totals} />, fileName: `${type === 'Customer' ? 'Aging-Piutang' : 'Aging-Hutang'}-${new Date().toISOString().slice(0, 10)}.pdf` };
    }
    case 'report_daily':
      return { element: <DailyReportPDF company={company} date={rp.date as string} data={p} />, fileName: `Laporan-Harian-${rp.date}.pdf` };
    case 'quotation':
      return { element: <QuotationPDF quotation={p} company={company as never} />, fileName: `${p.quotationNumber}.pdf` };
    case 'proforma_invoice': {
      // Sama dengan ProformaDetailDrawer: status tampilan + jumlah terbayar dari ringkasan pembayaran.
      const proforma = { ...p, status: p.displayStatus ?? p.status, paid: p.payment?.paid ?? 0 };
      return { element: <ProformaInvoicePDF proforma={proforma} company={company as never} />, fileName: `${p.proformaNumber}.pdf` };
    }
    case 'sales_order':
      return { element: <SalesOrderPDF so={p} company={company as never} />, fileName: `${p.soNumber}.pdf` };
    case 'purchase_order':
      return { element: <PurchaseOrderPDF po={p} company={company as never} />, fileName: `${p.poNumber}.pdf` };
    case 'delivery_order': {
      // Sama dengan DeliveryOrderDetailDrawer: status "Invoiced" diturunkan dari Submitted + invoice.
      const customer = p.customer ?? p.party ?? null;
      const invoiceRef = p.salesInvoice ?? p.invoice ?? null;
      const status = p.status === 'Submitted' && invoiceRef ? 'Invoiced' : p.status;
      const el = (
        <DeliveryOrderPDF
          doNumber={p.doNumber}
          date={p.date}
          status={status}
          customer={{ name: customer?.name ?? '—', address: customer?.address ?? null, phone: customer?.phone ?? null }}
          poRef={p.salesOrder?.customerRefNo ?? null}
          soNumber={p.salesOrder?.soNumber ?? null}
          nomorMobil={p.nomorMobil}
          driverName={p.driverName}
          recipientName={p.recipientName}
          notes={p.notes}
          items={(p.items ?? []).map(itemLine)}
          company={pdfCompany(company)}
        />
      );
      return { element: el, fileName: `${p.doNumber}.pdf` };
    }
    case 'goods_receipt': {
      const supplier = p.supplier ?? null;
      const el = (
        <GoodsReceiptPDF
          sttNumber={p.sttNumber}
          date={p.date}
          supplier={{ name: supplier?.name ?? '—', address: supplier?.address ?? null, phone: supplier?.phone ?? null }}
          poNumber={p.purchaseOrder?.poNumber ?? null}
          nomorMobil={p.nomorMobil}
          driverName={p.driverName}
          recipientName={p.recipientName}
          notes={p.notes}
          items={(p.items ?? []).map(itemLine)}
          company={pdfCompany(company)}
        />
      );
      return { element: el, fileName: `${p.sttNumber}.pdf` };
    }
    case 'stock_transfer': {
      const el = (
        <WarehouseTransferPDF
          transferNumber={p.transferNumber}
          date={p.date}
          fromWarehouseName={p.fromWarehouse?.name ?? '—'}
          toWarehouseName={p.toWarehouse?.name ?? '—'}
          nomorMobil={p.nomorMobil}
          driverName={p.driverName}
          recipientName={p.recipientName}
          notes={p.notes}
          items={(p.items ?? []).map((it: any) => ({
            code: it.item?.code ?? null,
            name: it.item?.name ?? '—',
            qty: Number(it.quantity),
            unit: it.item?.unit ?? '',
            description: it.description,
          }))}
          company={pdfCompany(company)}
        />
      );
      return { element: el, fileName: `${p.transferNumber}.pdf` };
    }
    case 'stock_opname': {
      // Sama dengan StockOpnameDetailView: hanya baris yang selisihnya ≠ 0.
      const withDiff = (p.items ?? []).filter((i: any) => numv(i.difference) !== 0);
      const el = (
        <StockOpnamePDF
          opnameNumber={p.opnameNumber}
          date={p.date}
          status={p.status}
          notes={p.notes}
          createdBy={p.createdBy?.fullName}
          items={withDiff.map((i: any) => ({
            code: i.item.code,
            name: i.item.name,
            unit: i.item.unit,
            systemStock: numv(i.systemStock),
            actualStock: numv(i.actualStock),
            difference: numv(i.difference),
            unitCost: numv(i.unitCost),
            totalValue: numv(i.totalValue),
          }))}
          company={{ name: company.name, address: company.address, logoUrl: company.logoUrl }}
        />
      );
      return { element: el, fileName: `stok-opname-${p.opnameNumber}.pdf` };
    }
    case 'sales_invoice':
    case 'purchase_invoice': {
      const type = kind === 'sales_invoice' ? 'sales' : 'purchase';
      const el = buildInvoicePdf({ ...deriveInvoicePdfArgs(type, p), company: company as never });
      return { element: el, fileName: `${p.invoiceNumber}.pdf` };
    }
    case 'production_run':
      return { element: <ProductionRunPDF {...buildPdfProps(p, company as never)} />, fileName: `${p.runNumber}.pdf` };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function renderDoc(
  kind: PdfKind,
  payload: unknown,
  company: PdfCompany,
  lang: 'id' | 'en' = 'id',
  reportParams: ReportParams = {},
): Promise<{ buffer: Uint8Array; fileName: string }> {
  await i18n.changeLanguage(lang);
  await i18n.loadNamespaces(['pdf', 'reports']);
  const { element, fileName } = build(kind, payload, company, reportParams);
  return { buffer: await renderToBuffer(element as never), fileName };
}
