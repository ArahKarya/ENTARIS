import { Factory, Truck, ShoppingCart, Warehouse as WarehouseIcon } from 'lucide-react';
import { formatNumber, formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ReportDataTable, ReportMetricGrid, ReportSection, type DataColumn } from '@/components/report-kit';
import type { DailyData, ProductionRun, StockItem, TradeInvoice } from './types';

const qty = (n: number) => formatNumber(n, { maxDecimals: 3 });
const rp = (n: number) => formatRupiah(n);

function invoiceColumns(party: 'customer' | 'supplier'): DataColumn<TradeInvoice>[] {
  return [
    { key: 'no', header: 'No. Faktur', rowHeader: true, className: 'whitespace-nowrap font-mono text-xs', render: (i) => i.invoiceNumber },
    { key: 'party', header: party === 'customer' ? 'Pelanggan' : 'Supplier', render: (i) => (party === 'customer' ? i.customerName : i.supplierName) },
    { key: 'items', header: 'Item', className: 'text-muted-foreground', hideBelowSm: true, render: (i) => i.items.map((x) => x.itemName).join(', ') },
    { key: 'qty', header: 'Qty', numeric: true, render: (i) => qty(i.totalQty) },
    { key: 'total', header: 'Total', numeric: true, className: 'whitespace-nowrap', render: (i) => rp(i.grandTotal) },
    { key: 'out', header: party === 'customer' ? 'Sisa Piutang' : 'Sisa Hutang', numeric: true, className: 'whitespace-nowrap', render: (i) => rp(i.outstanding) },
  ];
}

const SALES_COLUMNS = invoiceColumns('customer');
const PURCHASE_COLUMNS = invoiceColumns('supplier');

export function SalesSection({ data }: { data: DailyData['sales'] }) {
  const s = data.summary;
  return (
    <ReportSection title="Penjualan" icon={ShoppingCart} count={s.count}>
      <ReportMetricGrid
        label="Ringkasan penjualan"
        className="mb-4"
        items={[
          { label: 'Jumlah Faktur', value: s.count },
          { label: 'Total Qty', value: `${qty(s.totalQty)} kg` },
          { label: 'Total Omzet', value: rp(s.totalRevenue) },
          { label: 'Piutang Baru', value: rp(s.totalNewReceivables) },
        ]}
      />
      <ReportDataTable caption="Faktur penjualan hari ini" columns={SALES_COLUMNS} rows={data.invoices} getRowKey={(i) => i.invoiceNumber} emptyText="Tidak ada penjualan hari ini" maxHeightClass="max-h-96" />
    </ReportSection>
  );
}

export function PurchasesSection({ data }: { data: DailyData['purchases'] }) {
  const s = data.summary;
  return (
    <ReportSection title="Pembelian" icon={Truck} count={s.count}>
      <ReportMetricGrid
        label="Ringkasan pembelian"
        className="mb-4"
        items={[
          { label: 'Jumlah Faktur', value: s.count },
          { label: 'Total Qty', value: `${qty(s.totalQty)} kg` },
          { label: 'Total Belanja', value: rp(s.totalSpend) },
          { label: 'Hutang Baru', value: rp(s.totalNewPayables) },
        ]}
      />
      <ReportDataTable caption="Faktur pembelian hari ini" columns={PURCHASE_COLUMNS} rows={data.invoices} getRowKey={(i) => i.invoiceNumber} emptyText="Tidak ada pembelian hari ini" maxHeightClass="max-h-96" />
    </ReportSection>
  );
}

const RUN_COLUMNS: DataColumn<ProductionRun>[] = [
  { key: 'no', header: 'No. Run', rowHeader: true, className: 'whitespace-nowrap font-mono text-xs', render: (r) => r.runNumber },
  { key: 'in', header: 'Input', render: (r) => r.inputs.map((i) => `${i.itemName} (${qty(i.quantity)} ${i.unit})`).join(', ') },
  {
    key: 'out',
    header: 'Output',
    render: (r) => r.outputs.map((o) => `${o.itemName} (${qty(o.quantity)} ${o.unit})${o.isByProduct ? ' *' : ''}`).join(', '),
  },
  { key: 'yield', header: 'Yield', numeric: true, render: (r) => (r.yieldPct ? `${r.yieldPct}%` : '—') },
];

export function ProductionSection({ data }: { data: DailyData['production'] }) {
  const s = data.summary;
  return (
    <ReportSection title="Produksi" icon={Factory} count={s.totalRuns}>
      <ReportMetricGrid
        label="Ringkasan produksi"
        className="mb-4"
        items={[
          { label: 'Jumlah Run', value: s.totalRuns },
          { label: 'Total Input', value: `${qty(s.totalInputKg)} kg` },
          { label: 'Total Output', value: `${qty(s.totalOutputKg)} kg` },
          { label: 'Yield Rata-rata', value: s.avgYield > 0 ? `${s.avgYield}%` : '—' },
        ]}
      />
      <ReportDataTable caption="Produksi hari ini" columns={RUN_COLUMNS} rows={data.runs} getRowKey={(r) => r.runNumber} emptyText="Tidak ada produksi hari ini" maxHeightClass="max-h-96" />
      {data.runs.some((r) => r.outputs.some((o) => o.isByProduct)) && (
        <p className="mt-2 text-xs text-muted-foreground">* = produk samping</p>
      )}
    </ReportSection>
  );
}

const STOCK_COLUMNS: DataColumn<StockItem>[] = [
  { key: 'code', header: 'Kode', className: 'whitespace-nowrap font-mono text-xs', render: (i) => i.code },
  { key: 'name', header: 'Nama Item', rowHeader: true, render: (i) => i.name },
  { key: 'unit', header: 'Sat.', className: 'text-muted-foreground', render: (i) => i.unit },
  {
    key: 'qty',
    header: 'Stok',
    numeric: true,
    className: (i) => cn('font-semibold', i.qty < 0 && 'text-danger-text'),
    render: (i) => formatNumber(i.qty, { maxDecimals: 3 }),
  },
  {
    key: 'avg',
    header: 'Avg Cost',
    numeric: true,
    className: 'text-muted-foreground',
    render: (i) => (i.averageCost > 0 ? formatNumber(i.averageCost) : '—'),
  },
  {
    key: 'value',
    header: 'Nilai',
    numeric: true,
    className: (i) => cn('whitespace-nowrap', i.value < 0 && 'text-danger-text'),
    render: (i) => (i.value !== 0 ? formatRupiah(i.value, { negative: 'parens' }) : '—'),
  },
];

export function StockSection({ data }: { data: NonNullable<DailyData['stock']> }) {
  const s = data.summary;
  const warehouses = data.warehouses.filter((w) => w.items.length > 0);
  return (
    <ReportSection title="Kondisi Stok" icon={WarehouseIcon} count={s.totalWarehouses}>
      <ReportMetricGrid
        label="Ringkasan stok"
        items={[
          { label: 'Jumlah Gudang', value: s.totalWarehouses },
          { label: 'Total Baris Item', value: s.totalItemLines },
          { label: 'Item Stok Negatif', value: s.totalNegative, valueClassName: s.totalNegative > 0 ? 'text-danger-text' : undefined },
          { label: 'Total Nilai Stok', value: rp(s.grandTotalValue) },
        ]}
      />
      <p className="mb-4 mt-2 text-xs italic text-muted-foreground">{data.valuationNote}</p>
      {data.warehouses.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Tidak ada stok pada tanggal ini.</p>
      ) : (
        <div className="space-y-4">
          {warehouses.map((w) => (
            <div key={w.code}>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3">
                <h3 className="text-xs font-semibold text-foreground">
                  {w.code} · {w.name}
                  {w.isDefault ? ' (default)' : ''}
                  <span className="font-normal text-muted-foreground"> · {w.itemCount} item</span>
                </h3>
                <p className="num text-xs font-semibold text-foreground">{rp(w.totalValue)}</p>
              </div>
              <ReportDataTable
                caption={`Stok gudang ${w.code} ${w.name}`}
                columns={STOCK_COLUMNS}
                rows={w.items}
                getRowKey={(i) => `${w.code}-${i.code}`}
                maxHeightClass="max-h-80"
              />
            </div>
          ))}
        </div>
      )}
    </ReportSection>
  );
}
