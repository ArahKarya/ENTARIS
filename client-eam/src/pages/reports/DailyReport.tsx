import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ShoppingCart, Truck, Factory, Wallet,
  Users, CreditCard, Package, Warehouse as WhIcon,
} from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '../../lib/formatters';
import { ReportLayout } from '../../components/reports';
import { DailyReportPDF } from '../../lib/pdf/DailyReportPDF';
import { useCompanyPDF } from '../../lib/pdf/useCompanyPDF';

interface SummaryCardProps {
  label: string;
  value: string;
  sub?: string;
}
function SummaryCard({ label, value, sub }: SummaryCardProps) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-lg font-semibold text-gray-900 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
        <Icon size={15} className="text-blue-600" />
      </div>
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {count !== undefined && (
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message?: string }) {
  return (
    <tr><td colSpan={colSpan} className="py-6 text-center text-xs text-gray-400">{message || 'Tidak ada data'}</td></tr>
  );
}

const DailyReport = () => {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const company = useCompanyPDF();

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'daily-report-print';
    style.textContent = '@page { size: A4 landscape; margin: 1cm; }';
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['daily-report', date],
    queryFn: async () => {
      const r = await api.get('/reports/daily', { params: { date } });
      return r.data;
    },
  });

  const formattedDate = new Date(date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <ReportLayout
      title="Laporan Harian"
      subtitle={`Ringkasan aktivitas bisnis — ${formattedDate}`}
      dateFilter={{ mode: 'single', date, onDateChange: setDate, label: 'Tanggal:' }}
      pdfDocument={data ? <DailyReportPDF company={company} date={date} data={data} /> : undefined}
      pdfFileName={`Laporan-Harian-${date}.pdf`}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
    >
      {data && (
        <div className="space-y-6 print-landscape">
          {/* 1. PENJUALAN */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <SectionHeader icon={ShoppingCart} title="Penjualan" count={data.sales.summary.count} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <SummaryCard label="Jumlah Faktur" value={String(data.sales.summary.count)} />
              <SummaryCard label="Total Qty" value={`${data.sales.summary.totalQty.toLocaleString('id-ID')} kg`} />
              <SummaryCard label="Total Omzet" value={formatRupiah(data.sales.summary.totalRevenue)} />
              <SummaryCard label="Piutang Baru" value={formatRupiah(data.sales.summary.totalNewReceivables)} />
            </div>
            <div className="table-responsive">
              <table className="data-table text-xs">
                <thead><tr><th>No. Faktur</th><th>Pelanggan</th><th>Item</th><th className="text-right">Qty</th><th className="text-right">Total</th><th className="text-right">Sisa Piutang</th></tr></thead>
                <tbody>
                  {data.sales.invoices.length === 0 ? <EmptyRow colSpan={6} message="Tidak ada penjualan hari ini" /> :
                    data.sales.invoices.map((inv: any) => (
                      <tr key={inv.invoiceNumber}>
                        <td className="font-mono">{inv.invoiceNumber}</td>
                        <td>{inv.customerName}</td>
                        <td className="text-gray-500">{inv.items.map((i: any) => i.itemName).join(', ')}</td>
                        <td className="text-right tabular-nums">{inv.totalQty.toLocaleString('id-ID')}</td>
                        <td className="text-right tabular-nums">{formatRupiah(inv.grandTotal)}</td>
                        <td className="text-right tabular-nums">{formatRupiah(inv.outstanding)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 2. PEMBELIAN */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <SectionHeader icon={Truck} title="Pembelian" count={data.purchases.summary.count} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <SummaryCard label="Jumlah Faktur" value={String(data.purchases.summary.count)} />
              <SummaryCard label="Total Qty" value={`${data.purchases.summary.totalQty.toLocaleString('id-ID')} kg`} />
              <SummaryCard label="Total Belanja" value={formatRupiah(data.purchases.summary.totalSpend)} />
              <SummaryCard label="Hutang Baru" value={formatRupiah(data.purchases.summary.totalNewPayables)} />
            </div>
            <div className="table-responsive">
              <table className="data-table text-xs">
                <thead><tr><th>No. Faktur</th><th>Supplier</th><th>Item</th><th className="text-right">Qty</th><th className="text-right">Total</th><th className="text-right">Sisa Hutang</th></tr></thead>
                <tbody>
                  {data.purchases.invoices.length === 0 ? <EmptyRow colSpan={6} message="Tidak ada pembelian hari ini" /> :
                    data.purchases.invoices.map((inv: any) => (
                      <tr key={inv.invoiceNumber}>
                        <td className="font-mono">{inv.invoiceNumber}</td>
                        <td>{inv.supplierName}</td>
                        <td className="text-gray-500">{inv.items.map((i: any) => i.itemName).join(', ')}</td>
                        <td className="text-right tabular-nums">{inv.totalQty.toLocaleString('id-ID')}</td>
                        <td className="text-right tabular-nums">{formatRupiah(inv.grandTotal)}</td>
                        <td className="text-right tabular-nums">{formatRupiah(inv.outstanding)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. PRODUKSI */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <SectionHeader icon={Factory} title="Produksi" count={data.production.summary.totalRuns} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <SummaryCard label="Jumlah Run" value={String(data.production.summary.totalRuns)} />
              <SummaryCard label="Total Input" value={`${data.production.summary.totalInputKg.toLocaleString('id-ID')} kg`} />
              <SummaryCard label="Total Output" value={`${data.production.summary.totalOutputKg.toLocaleString('id-ID')} kg`} />
              <SummaryCard label="Yield Rata-rata" value={data.production.summary.avgYield > 0 ? `${data.production.summary.avgYield}%` : '—'} />
            </div>
            <div className="table-responsive">
              <table className="data-table text-xs">
                <thead><tr><th>No. Run</th><th>Input</th><th>Output</th><th className="text-right">Yield</th></tr></thead>
                <tbody>
                  {data.production.runs.length === 0 ? <EmptyRow colSpan={4} message="Tidak ada produksi hari ini" /> :
                    data.production.runs.map((run: any) => (
                      <tr key={run.runNumber}>
                        <td className="font-mono">{run.runNumber}</td>
                        <td>{run.inputs.map((i: any) => `${i.itemName} (${i.quantity.toLocaleString('id-ID')} ${i.unit})`).join(', ')}</td>
                        <td>{run.outputs.map((o: any) => `${o.itemName} (${o.quantity.toLocaleString('id-ID')} ${o.unit})${o.isByProduct ? ' *' : ''}`).join(', ')}</td>
                        <td className="text-right tabular-nums">{run.yieldPct ? `${run.yieldPct}%` : '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3b. KONDISI STOK (snapshot per gudang, posisi akhir tanggal) */}
          {data.stock && (
            <section className="bg-white border border-gray-200 rounded-xl p-5">
              <SectionHeader icon={WhIcon} title="Kondisi Stok" count={data.stock.summary.totalWarehouses} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
                <SummaryCard label="Jumlah Gudang" value={String(data.stock.summary.totalWarehouses)} />
                <SummaryCard label="Total Baris Item" value={String(data.stock.summary.totalItemLines)} />
                <SummaryCard label="Item Stok Negatif" value={String(data.stock.summary.totalNegative)} />
                <SummaryCard label="Total Nilai Stok" value={formatRupiah(data.stock.summary.grandTotalValue)} />
              </div>
              <p className="text-[11px] text-gray-400 italic mb-4">{data.stock.valuationNote}</p>
              {data.stock.warehouses.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Tidak ada stok pada tanggal ini.</p>
              ) : (
                <div className="space-y-4">
                  {data.stock.warehouses.filter((w: any) => w.items.length > 0).map((w: any) => (
                    <div key={w.code}>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-gray-700">
                          {w.code} — {w.name}{w.isDefault ? ' (default)' : ''}
                          <span className="text-gray-400 font-normal"> · {w.itemCount} item</span>
                        </p>
                        <p className="text-xs font-semibold text-gray-700">{formatRupiah(w.totalValue)}</p>
                      </div>
                      <div className="table-responsive">
                        <table className="data-table text-xs">
                          <thead><tr><th>Kode</th><th>Nama Item</th><th>Sat.</th><th className="text-right">Stok</th><th className="text-right">Avg Cost</th><th className="text-right">Nilai</th></tr></thead>
                          <tbody>
                            {w.items.map((it: any) => (
                              <tr key={`${w.code}-${it.code}`}>
                                <td className="font-mono">{it.code}</td>
                                <td>{it.name}</td>
                                <td className="text-gray-500">{it.unit}</td>
                                <td className={`text-right tabular-nums font-semibold ${it.qty < 0 ? 'text-red-600' : ''}`}>
                                  {it.qty.toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                                </td>
                                <td className="text-right tabular-nums text-gray-500">
                                  {it.averageCost > 0 ? it.averageCost.toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '—'}
                                </td>
                                <td className={`text-right tabular-nums ${it.value < 0 ? 'text-red-600' : ''}`}>
                                  {it.value !== 0 ? formatRupiah(it.value) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 4. KEUANGAN */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <SectionHeader icon={Wallet} title="Keuangan" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <SummaryCard label="Penerimaan" value={formatRupiah(data.finance.summary.totalIn)} />
              <SummaryCard label="Pengeluaran" value={formatRupiah(data.finance.summary.totalOut)} />
              <SummaryCard label="Arus Kas Bersih" value={formatRupiah(data.finance.summary.netCashFlow)} />
              <SummaryCard label="Jurnal Manual" value={String(data.finance.manualJournals)} />
            </div>

            {/* Saldo Kas/Bank */}
            <p className="text-xs font-semibold text-gray-700 mb-2">Saldo Kas & Bank</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
              {data.finance.cashBankBalances.map((cb: any) => (
                <div key={cb.accountNumber} className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <p className="text-xs text-blue-600 font-medium">{cb.accountNumber} — {cb.accountName}</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatRupiah(cb.balance)}</p>
                </div>
              ))}
            </div>

            {/* Payment in/out tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-green-700 mb-2">Penerimaan ({data.finance.paymentsIn.length})</p>
                <div className="table-responsive">
                  <table className="data-table text-xs">
                    <thead><tr><th>No.</th><th>Pihak</th><th className="text-right">Jumlah</th></tr></thead>
                    <tbody>
                      {data.finance.paymentsIn.length === 0 ? <EmptyRow colSpan={3} /> :
                        data.finance.paymentsIn.map((p: any) => (
                          <tr key={p.paymentNumber}>
                            <td className="font-mono">{p.paymentNumber}</td>
                            <td>{p.partyName}</td>
                            <td className="text-right tabular-nums text-green-700">{formatRupiah(p.amount)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-red-700 mb-2">Pengeluaran ({data.finance.paymentsOut.length})</p>
                <div className="table-responsive">
                  <table className="data-table text-xs">
                    <thead><tr><th>No.</th><th>Pihak</th><th className="text-right">Jumlah</th></tr></thead>
                    <tbody>
                      {data.finance.paymentsOut.length === 0 ? <EmptyRow colSpan={3} /> :
                        data.finance.paymentsOut.map((p: any) => (
                          <tr key={p.paymentNumber}>
                            <td className="font-mono">{p.paymentNumber}</td>
                            <td>{p.partyName}</td>
                            <td className="text-right tabular-nums text-red-700">{formatRupiah(p.amount)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {/* 5. PIUTANG */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <SectionHeader icon={Users} title="Piutang Usaha" count={data.receivables.summary.totalCustomers} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <SummaryCard label="Total Piutang" value={formatRupiah(data.receivables.summary.totalOutstanding)} />
              <SummaryCard label="Jatuh Tempo" value={formatRupiah(data.receivables.summary.totalOverdue)} />
              <SummaryCard label="Jumlah Pelanggan" value={String(data.receivables.summary.totalCustomers)} />
            </div>
            <div className="table-responsive">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th>Pelanggan</th>
                    <th className="text-right">Belum Jatuh Tempo</th>
                    <th className="text-right">1-30 hari</th>
                    <th className="text-right">31-60 hari</th>
                    <th className="text-right">61-90 hari</th>
                    <th className="text-right">&gt;90 hari</th>
                    <th className="text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.receivables.byCustomer.length === 0 ? <EmptyRow colSpan={7} message="Tidak ada piutang" /> :
                    data.receivables.byCustomer.map((c: any) => (
                      <tr key={c.customerName}>
                        <td className="font-medium">{c.customerName}</td>
                        <td className="text-right tabular-nums">{c.current > 0 ? formatRupiah(c.current) : '—'}</td>
                        <td className="text-right tabular-nums">{c.d1_30 > 0 ? formatRupiah(c.d1_30) : '—'}</td>
                        <td className="text-right tabular-nums">{c.d31_60 > 0 ? formatRupiah(c.d31_60) : '—'}</td>
                        <td className="text-right tabular-nums">{c.d61_90 > 0 ? formatRupiah(c.d61_90) : '—'}</td>
                        <td className="text-right tabular-nums text-red-600">{c.d91_plus > 0 ? formatRupiah(c.d91_plus) : '—'}</td>
                        <td className="text-right tabular-nums font-semibold">{formatRupiah(c.total)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 6. HUTANG */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <SectionHeader icon={CreditCard} title="Hutang Usaha" count={data.payables.summary.totalSuppliers} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <SummaryCard label="Total Hutang" value={formatRupiah(data.payables.summary.totalOutstanding)} />
              <SummaryCard label="Jatuh Tempo" value={formatRupiah(data.payables.summary.totalOverdue)} />
              <SummaryCard label="Jumlah Supplier" value={String(data.payables.summary.totalSuppliers)} />
            </div>
            <div className="table-responsive">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th className="text-right">Belum Jatuh Tempo</th>
                    <th className="text-right">1-30 hari</th>
                    <th className="text-right">31-60 hari</th>
                    <th className="text-right">61-90 hari</th>
                    <th className="text-right">&gt;90 hari</th>
                    <th className="text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payables.bySupplier.length === 0 ? <EmptyRow colSpan={7} message="Tidak ada hutang" /> :
                    data.payables.bySupplier.map((s: any) => (
                      <tr key={s.supplierName}>
                        <td className="font-medium">{s.supplierName}</td>
                        <td className="text-right tabular-nums">{s.current > 0 ? formatRupiah(s.current) : '—'}</td>
                        <td className="text-right tabular-nums">{s.d1_30 > 0 ? formatRupiah(s.d1_30) : '—'}</td>
                        <td className="text-right tabular-nums">{s.d31_60 > 0 ? formatRupiah(s.d31_60) : '—'}</td>
                        <td className="text-right tabular-nums">{s.d61_90 > 0 ? formatRupiah(s.d61_90) : '—'}</td>
                        <td className="text-right tabular-nums text-red-600">{s.d91_plus > 0 ? formatRupiah(s.d91_plus) : '—'}</td>
                        <td className="text-right tabular-nums font-semibold">{formatRupiah(s.total)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 7. DEPOSIT SUPPLIER */}
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <SectionHeader icon={Package} title="Deposit Supplier" count={data.vendorDeposits.deposits.length} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <SummaryCard label="Total Deposit" value={formatRupiah(data.vendorDeposits.summary.totalDeposits)} />
              <SummaryCard label="Sudah Dialokasi" value={formatRupiah(data.vendorDeposits.summary.totalApplied)} />
              <SummaryCard label="Sisa Belum Dialokasi" value={formatRupiah(data.vendorDeposits.summary.totalRemaining)} />
            </div>
            <div className="table-responsive">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th>No. Pembayaran</th>
                    <th>Supplier</th>
                    <th className="text-right">Jumlah Deposit</th>
                    <th className="text-right">Dialokasi</th>
                    <th className="text-right">Sisa</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vendorDeposits.deposits.length === 0 ? <EmptyRow colSpan={5} message="Tidak ada deposit supplier" /> :
                    data.vendorDeposits.deposits.map((d: any) => (
                      <tr key={d.paymentNumber}>
                        <td className="font-mono">{d.paymentNumber}</td>
                        <td>{d.supplierName}</td>
                        <td className="text-right tabular-nums">{formatRupiah(d.amount)}</td>
                        <td className="text-right tabular-nums">{formatRupiah(d.totalApplied)}</td>
                        <td className="text-right tabular-nums font-semibold">{formatRupiah(d.remaining)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </ReportLayout>
  );
};

export default DailyReport;
