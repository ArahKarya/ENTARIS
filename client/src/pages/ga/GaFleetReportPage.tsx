/**
 * Laporan Armada (/ga/vehicle/report) — fleet-level cost of ownership from
 * GET /ga/vehicle/fleet-report: KPIs, cost distribution, monthly trend, top
 * spenders, compliance and a per-vehicle table. Period lives in the URL
 * (?period=…&startDate=…&endDate=…); Excel export of the filtered rows.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Car, Download, Gauge, Search, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatDate, formatNumber, formatPercent, formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, PageHeader, StatCard } from '@/components/shared';
import { ChartTooltipBox, Panel, PanelState } from '@/components/inventory/dashboard-kit';
import { CHART_AXIS, CHART_GRID_STROKE } from '@/components/inventory/dashboard-hooks';
import { ReportPeriodToolbar } from '@/components/ga/vehicle/ReportPeriodToolbar';
import { useReportPeriod } from '@/components/ga/vehicle/useReportPeriod';
import { monthLabel } from '@/components/ga/vehicle/fleet-report-model';
import { DueMarker, UnitHeader } from '@/components/ga/vehicle/vehicle-ui';
import { FLUSH_TABLE } from '@/components/ga/vehicle/ui-classes';

type ComplianceState = 'EXPIRED' | 'EXPIRING' | 'OK' | 'NONE';
type CostCategory = 'service' | 'fuel' | 'tax' | 'insurance' | 'incident' | 'workorder';
type Breakdown = Record<CostCategory, number>;

interface FleetVehicle {
  assetId: string;
  code: string;
  name: string;
  noPlat: string | null;
  brand: string | null;
  tipe: string | null;
  categoryName: string | null;
  status: string;
  condition: string;
  odometerTerakhir: number | null;
  breakdown: Breakdown;
  totalCost: number;
  costPerMonth: number;
  totalLiters: number;
  taxState: ComplianceState;
  taxDueDate: string | null;
  insuranceState: ComplianceState;
  insuranceEndDate: string | null;
  openIncidentCount: number;
  workOrderCount: number;
  openWorkOrderCount: number;
  materialRequestCount: number;
  issueCount: number;
}

interface FleetReport {
  period: { from: string; to: string; months: number };
  vehicles: FleetVehicle[];
  totals: Breakdown & { totalCost: number; vehicleCount: number; costPerVehicle: number };
  distribution: { category: CostCategory; amount: number; percentage: number }[];
  topSpenders: { assetId: string; code: string; name: string; noPlat: string | null; totalCost: number; costPerMonth: number }[];
  monthlyTrend: (Breakdown & { month: string; total: number })[];
  compliance: { taxIssues: number; insuranceIssues: number; openIncidents: number; openWorkOrders?: number; vehiclesWithIssues: number };
}

const CATS: CostCategory[] = ['service', 'fuel', 'tax', 'insurance', 'incident', 'workorder'];
const CAT_LABEL: Record<CostCategory, string> = {
  service: 'Servis & perawatan',
  fuel: 'Bahan bakar',
  tax: 'Pajak kendaraan',
  insurance: 'Asuransi',
  incident: 'Insiden & perbaikan',
  workorder: 'Work order & sparepart',
};
const CAT_COLOR: Record<CostCategory, string> = {
  service: 'var(--chart-1)',
  fuel: 'var(--chart-2)',
  tax: 'var(--chart-4)',
  insurance: 'var(--chart-3)',
  incident: 'var(--chart-5)',
  workorder: 'var(--chart-6)',
};
const CAT_SHORT: Record<CostCategory, string> = {
  service: 'Servis', fuel: 'BBM', tax: 'Pajak', insurance: 'Asuransi', incident: 'Insiden', workorder: 'Work order',
};
const STATE_LABEL: Record<ComplianceState, string> = { EXPIRED: 'Lewat', EXPIRING: 'Segera', OK: 'Aman', NONE: '-' };
const toDue = (s: ComplianceState) => (s === 'EXPIRED' ? 'overdue' : s === 'EXPIRING' ? 'dueSoon' : s === 'OK' ? 'ok' : null);
const money = (v: number) => formatRupiah(v, { symbol: false });
const compact = (v: number) => formatRupiah(v, { compact: true, symbol: false });

function vehicleLink(assetId: string, section?: string) {
  return `/ga/vehicle?vehicle=${assetId}${section ? `&section=${section}` : ''}`;
}

export function GaFleetReportPage() {
  const { period, setPreset, setRange } = useReportPeriod();
  const [search, setSearch] = useState('');

  const query = useQuery<FleetReport>({
    queryKey: ['ga-fleet-report', period.startDate, period.endDate],
    queryFn: async () => (await api.get('/ga/vehicle/fleet-report', { params: { from: period.startDate, to: period.endDate } })).data,
    placeholderData: keepPreviousData,
  });
  const data = query.data;

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const list = q
      ? data.vehicles.filter((v) => [v.code, v.name, v.noPlat, v.brand, v.tipe].some((f) => f?.toLowerCase().includes(q)))
      : data.vehicles;
    return [...list].sort((a, b) => b.totalCost - a.totalCost);
  }, [data, search]);

  const distribution = useMemo(
    () => [...(data?.distribution ?? [])].filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount),
    [data],
  );
  const trend = useMemo(() => (data?.monthlyTrend ?? []).map((m) => ({ ...m, label: monthLabel(m.month) })), [data]);
  const hasTrend = trend.some((m) => m.total > 0);

  const handleExport = async () => {
    if (!rows.length) {
      toast.error('Tidak ada data untuk diekspor.');
      return;
    }
    try {
      await exportToExcel(
        rows.map((v) => ({
          'Kode Aset': v.code,
          Nama: v.name,
          'No. Plat': v.noPlat ?? '',
          Merek: v.brand ?? '',
          Tipe: v.tipe ?? '',
          Kategori: v.categoryName ?? '',
          Status: v.status,
          Kondisi: v.condition,
          'Odometer (km)': v.odometerTerakhir ?? '',
          Service: v.breakdown.service,
          BBM: v.breakdown.fuel,
          Pajak: v.breakdown.tax,
          Asuransi: v.breakdown.insurance,
          Insiden: v.breakdown.incident,
          'Work Order & Sparepart': v.breakdown.workorder,
          'Total Biaya': v.totalCost,
          'Biaya/Bulan': Math.round(v.costPerMonth),
          'Liter BBM': v.totalLiters,
          'Status Pajak': STATE_LABEL[v.taxState],
          'Jatuh Tempo Pajak': v.taxDueDate ? formatDate(v.taxDueDate) : '',
          'Status Asuransi': STATE_LABEL[v.insuranceState],
          'Akhir Asuransi': v.insuranceEndDate ? formatDate(v.insuranceEndDate) : '',
          'Insiden Terbuka': v.openIncidentCount,
          'Jumlah WO': v.workOrderCount,
          'WO Terbuka': v.openWorkOrderCount,
          'Jumlah MR Dibayar': v.materialRequestCount,
          'Total Isu': v.issueCount,
        })),
        `Laporan-Armada-${period.startDate}_${period.endDate}`,
      );
      toast.success('Laporan armada diekspor.');
    } catch {
      toast.error('Gagal mengekspor laporan.');
    }
  };

  const columns = useMemo<ColumnDef<FleetVehicle>[]>(
    () => [
      {
        id: 'vehicle',
        header: 'Kendaraan',
        meta: { cellClassName: 'min-w-40' },
        cell: ({ row }) => {
          const v = row.original;
          return (
            <div className="min-w-0">
              <Link to={vehicleLink(v.assetId, 'laporan')} className="num text-sm font-medium text-primary-hover underline-offset-2 hover:underline">
                {v.noPlat ?? v.code}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{[v.brand, v.tipe].filter(Boolean).join(' ') || v.name}</p>
            </div>
          );
        },
      },
      ...(['service', 'fuel', 'tax', 'insurance', 'incident', 'workorder'] as CostCategory[]).map<ColumnDef<FleetVehicle>>((k) => ({
        id: k,
        header: () => <UnitHeader label={{ service: 'Servis', fuel: 'BBM', tax: 'Pajak', insurance: 'Asuransi', incident: 'Insiden', workorder: 'WO' }[k]} />,
        meta: { align: 'right', hideBelow: k === 'service' || k === 'fuel' ? 'md' : 'xl' },
        cell: ({ row }) => (row.original.breakdown[k] ? money(row.original.breakdown[k]) : <span className="text-muted-foreground">-</span>),
      })),
      {
        id: 'total',
        header: () => <UnitHeader label="Total" />,
        meta: { align: 'right' },
        cell: ({ row }) => <span className="font-semibold text-foreground">{money(row.original.totalCost)}</span>,
      },
      {
        id: 'perMonth',
        header: () => <UnitHeader label="Per bulan" />,
        meta: { align: 'right', hideBelow: 'lg' },
        cell: ({ row }) => money(row.original.costPerMonth),
      },
      {
        id: 'compliance',
        header: 'Kepatuhan',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => {
          const v = row.original;
          const tax = toDue(v.taxState);
          const ins = toDue(v.insuranceState);
          const flagged = [tax !== 'ok' && tax && { p: 'Pajak', s: tax }, ins !== 'ok' && ins && { p: 'Asuransi', s: ins }].filter(Boolean) as { p: string; s: 'overdue' | 'dueSoon' }[];
          return (
            <div className="flex flex-col items-start gap-0.5">
              {flagged.map((f) => (
                <DueMarker key={f.p} state={f.s} prefix={f.p} short />
              ))}
              {v.openIncidentCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-text">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  {v.openIncidentCount} insiden
                </span>
              )}
              {flagged.length === 0 && v.openIncidentCount === 0 && <span className="text-xs text-muted-foreground">Tidak ada isu</span>}
            </div>
          );
        },
      },
    ],
    [],
  );

  const top = data?.distribution.length ? [...data.distribution].sort((a, b) => b.amount - a.amount)[0] : undefined;
  const loading = !data && query.isLoading;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Laporan Armada"
        description="Biaya kepemilikan lintas kendaraan: distribusi biaya, tren bulanan, kendaraan terboros, dan kepatuhan dokumen."
        breadcrumbs={[{ label: 'Kendaraan', href: '/ga/vehicle' }, { label: 'Laporan Armada' }]}
        actions={
          <Button variant="outline" onClick={handleExport} disabled={!rows.length}>
            <Download aria-hidden />
            Export Excel
          </Button>
        }
      >
        <ReportPeriodToolbar period={period} onPresetChange={setPreset} onRangeChange={setRange} />
      </PageHeader>

      {query.isError && !data ? (
        <PanelState error={query.error} onRetry={() => query.refetch()}>
          {null}
        </PanelState>
      ) : (
        <>
          <section aria-label="Ringkasan biaya armada" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Total Biaya"
              icon={Wallet}
              loading={loading}
              value={data ? formatRupiah(data.totals.totalCost, { compact: true }) : '-'}
              valueTitle={data ? formatRupiah(data.totals.totalCost) : undefined}
              hint={data ? `${formatRupiah(data.totals.totalCost / data.period.months, { compact: true })} / bulan` : undefined}
            />
            <StatCard
              label="Kendaraan"
              icon={Car}
              loading={loading}
              value={data ? formatNumber(data.totals.vehicleCount) : '-'}
              hint={data ? `${formatRupiah(data.totals.costPerVehicle, { compact: true })} / kendaraan` : undefined}
            />
            <StatCard
              label="Biaya Terbesar"
              icon={TrendingUp}
              loading={loading}
              value={top && top.amount > 0 ? CAT_SHORT[top.category] : '-'}
              hint={top && top.amount > 0 ? `${CAT_LABEL[top.category]} · ${formatPercent(top.percentage / 100)}` : 'Belum ada biaya'}
            />
            <StatCard
              label="Kendaraan Bermasalah"
              icon={AlertTriangle}
              loading={loading}
              value={data ? formatNumber(data.compliance.vehiclesWithIssues) : '-'}
              hint={
                data
                  ? `${data.compliance.taxIssues} pajak · ${data.compliance.insuranceIssues} asuransi · ${data.compliance.openIncidents} insiden`
                  : undefined
              }
            />
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Tren Biaya Bulanan" description={data ? `${data.period.months} bulan · ${formatDate(data.period.from)} – ${formatDate(data.period.to)}` : undefined}>
              <PanelState loading={loading} skeleton="chart" empty={!hasTrend} emptyTitle="Belum ada biaya pada periode ini">
                <figure className="m-0">
                  <div className="h-64" aria-hidden>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart accessibilityLayer={false} data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
                        <XAxis dataKey="label" {...CHART_AXIS} interval="preserveStartEnd" minTickGap={8} />
                        <YAxis {...CHART_AXIS} width={52} tickFormatter={(v: number) => compact(v)} />
                        <Tooltip
                          cursor={{ fill: 'var(--accent)' }}
                          content={({ active, payload }) => {
                            const m = active ? (payload?.[0]?.payload as (typeof trend)[number] | undefined) : undefined;
                            if (!m) return null;
                            return (
                              <ChartTooltipBox
                                title={m.label}
                                rows={[
                                  ...CATS.filter((c) => m[c] > 0).map((c) => ({ label: CAT_LABEL[c], value: formatRupiah(m[c]), color: CAT_COLOR[c] })),
                                  { label: 'Total', value: formatRupiah(m.total) },
                                ]}
                              />
                            );
                          }}
                        />
                        {CATS.map((c, i) => (
                          <Bar key={c} dataKey={c} stackId="cost" fill={CAT_COLOR[c]} maxBarSize={28} radius={i === CATS.length - 1 ? [3, 3, 0, 0] : 0} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <figcaption className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {CATS.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1.5">
                        <span className="size-2.5 rounded-sm" style={{ background: CAT_COLOR[c] }} aria-hidden />
                        {CAT_LABEL[c]}
                      </span>
                    ))}
                    <span className="sr-only">
                      Total per bulan: {trend.map((m) => `${m.label} ${formatRupiah(m.total)}`).join('; ')}
                    </span>
                  </figcaption>
                </figure>
              </PanelState>
            </Panel>

            <Panel title="Distribusi Biaya per Kategori">
              <PanelState loading={loading} skeleton="chart" empty={distribution.length === 0} emptyTitle="Belum ada biaya pada periode ini">
                <figure className="m-0">
                  <div style={{ height: Math.max(120, distribution.length * 40) }} aria-hidden>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart accessibilityLayer={false} data={distribution} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap={8}>
                        <CartesianGrid horizontal={false} stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
                        <XAxis type="number" {...CHART_AXIS} tickFormatter={(v: number) => compact(v)} />
                        <YAxis type="category" dataKey="category" {...CHART_AXIS} width={128} tickFormatter={(v: CostCategory) => CAT_LABEL[v]} />
                        <Tooltip
                          cursor={{ fill: 'var(--accent)' }}
                          content={({ active, payload }) => {
                            const d = active ? (payload?.[0]?.payload as (typeof distribution)[number] | undefined) : undefined;
                            if (!d) return null;
                            return (
                              <ChartTooltipBox
                                title={CAT_LABEL[d.category]}
                                rows={[
                                  { label: 'Biaya', value: formatRupiah(d.amount) },
                                  { label: 'Porsi', value: formatPercent(d.percentage / 100) },
                                ]}
                              />
                            );
                          }}
                        />
                        <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={22}>
                          {distribution.map((d) => (
                            <Cell key={d.category} fill={CAT_COLOR[d.category]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <figcaption className="sr-only">
                    {distribution.map((d) => `${CAT_LABEL[d.category]} ${formatRupiah(d.amount)} (${formatPercent(d.percentage / 100)})`).join('; ')}
                  </figcaption>
                </figure>
              </PanelState>
            </Panel>
          </div>

          <Panel title="10 Kendaraan Biaya Tertinggi" description="Klik untuk membuka laporan per kendaraan.">
            <PanelState loading={loading} empty={!data?.topSpenders.length} emptyTitle="Belum ada data biaya">
              <ol className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
                {(data?.topSpenders ?? []).map((v, i) => {
                  const max = data?.topSpenders[0]?.totalCost || 1;
                  return (
                    <li key={v.assetId} className="flex items-center gap-3">
                      <span className="num w-5 text-right text-xs font-semibold text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                          <Link to={vehicleLink(v.assetId, 'laporan')} className="min-w-0 truncate font-medium text-foreground hover:underline">
                            {v.noPlat ?? v.code} <span className="font-normal text-muted-foreground">· {v.name}</span>
                          </Link>
                          <span className="num shrink-0 text-muted-foreground">{formatRupiah(v.totalCost, { compact: true })}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-sm bg-muted" aria-hidden>
                          <div className="h-full rounded-sm" style={{ width: `${(v.totalCost / max) * 100}%`, background: 'var(--chart-2)' }} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </PanelState>
          </Panel>

          <Panel
            title="Detail per Kendaraan"
            description={data ? `${formatNumber(rows.length)} dari ${formatNumber(data.vehicles.length)} kendaraan · urut total biaya` : undefined}
            bodyClassName="p-0"
            action={
              <div className="relative w-full sm:w-64">
                <label htmlFor="fleet-report-q" className="sr-only">
                  Cari kendaraan
                </label>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="fleet-report-q" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari plat, kode, merek" className="pl-9" />
              </div>
            }
          >
            <DataTable
              label="Biaya per kendaraan"
              itemLabel="kendaraan"
              columns={columns}
              data={rows}
              getRowId={(r) => r.assetId}
              loading={loading}
              fetching={query.isFetching && query.isPlaceholderData}
              filtered={!!search.trim()}
              onClearFilters={() => setSearch('')}
              stickyHeader={false}
              pageSize={25}
              className={FLUSH_TABLE}
              empty={{ title: 'Belum ada kendaraan', description: 'Kendaraan dengan data kendaraan terisi akan muncul di sini.' }}
            />
            {rows.length > 0 && (
              <p className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-sm">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Gauge className="size-4" aria-hidden /> Total {formatNumber(rows.length)} kendaraan
                </span>
                <span className="num font-semibold text-foreground">{formatRupiah(rows.reduce((s, v) => s + v.totalCost, 0))}</span>
              </p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

export default GaFleetReportPage;
