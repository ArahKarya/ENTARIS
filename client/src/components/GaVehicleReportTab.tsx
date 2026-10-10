/**
 * Laporan (vehicle detail) — TCO, monthly trend, document compliance and
 * physical condition of one vehicle from GET /ga/vehicle/assets/:id/report.
 * Period in the URL (shared with the fleet report); PDF download + print.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { pdf } from '@react-pdf/renderer';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CircleDot, ClipboardCheck, Download, Fuel, Gauge, Printer, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber, formatPercent, formatRupiah } from '@/lib/format';
import { useCompanyPDF } from '@/lib/pdf/useCompanyPDF';
import VehicleReportPDF from '@/lib/pdf/VehicleReportPDF';
import { Button } from '@/components/ui/button';
import { DataTable, StatCard, StatusBadge } from '@/components/shared';
import { ChartTooltipBox, Panel, PanelState } from '@/components/inventory/dashboard-kit';
import { CHART_AXIS, CHART_GRID_STROKE } from '@/components/inventory/dashboard-hooks';
import { ReportPeriodToolbar } from '@/components/ga/vehicle/ReportPeriodToolbar';
import { useReportPeriod } from '@/components/ga/vehicle/useReportPeriod';
import { monthLabel } from '@/components/ga/vehicle/fleet-report-model';
import { INCIDENT_SEVERITY_META, INSPECTION_RESULT_META, INSURANCE_TYPE_LABELS, TAX_TYPE_LABELS, TIRE_POSITION_LABELS } from '@/components/ga/vehicle/constants';
import { DetailItem, DueMarker, ToneBadge, UnitHeader } from '@/components/ga/vehicle/vehicle-ui';
import { downloadBlob } from '@/components/ga/vehicle/documents-api';
import { FLUSH_TABLE } from '@/components/ga/vehicle/ui-classes';

export type ComplianceState = 'EXPIRED' | 'EXPIRING' | 'OK' | 'NONE';

export interface VehicleReport {
  period: { from: string; to: string; months: number };
  asset: {
    id: string; code: string; name: string; categoryName: string | null;
    status: string; condition: string; noPlat: string | null; brand: string | null;
    tipe: string | null; tahunProduksi: number | null; odometerTerakhir: number | null;
  };
  tco: {
    breakdown: { service: number; fuel: number; tax: number; insurance: number; incident: number };
    totalCost: number; costPerMonth: number; distanceKm: number | null;
    costPerKm: number | null; fuelCostPerKm: number | null; totalLiters: number;
    kmPerLiter: number | null;
    counts: { service: number; fuel: number; tax: number; insurance: number; incident: number };
  };
  monthlyTrend: { month: string; service: number; fuel: number; tax: number; insurance: number; incident: number; total: number }[];
  compliance: {
    taxes: { type: string; periodYear: number; dueDate: string; paidAt: string | null; amount: number; state: ComplianceState; daysRemaining: number | null }[];
    insurances: { type: string; provider: string | null; endDate: string; premium: number; state: ComplianceState; daysRemaining: number | null }[];
    openIncidents: { tanggal: string; severity: string; status: string; description: string | null; cost: number }[];
    issueCount: number;
  };
  condition: {
    lastInspection: { tanggal: string; overallResult: string; odometer: number | null; notes: string | null } | null;
    activeTires: { position: string; brand: string | null; serialNumber: string | null; installedAt: string; installedOdometer: number | null; usageKm: number | null }[];
    activeTireCount: number;
    lastOil: { tanggal: string; odometer: number; nextOdometerDue: number; brand: string | null; volume: number; remainingKm: number | null; isDue: boolean | null } | null;
  };
}

type CostKey = keyof VehicleReport['tco']['breakdown'];
const COSTS: { key: CostKey; label: string; color: string }[] = [
  { key: 'service', label: 'Servis', color: 'var(--chart-1)' },
  { key: 'fuel', label: 'BBM', color: 'var(--chart-2)' },
  { key: 'tax', label: 'Pajak', color: 'var(--chart-4)' },
  { key: 'insurance', label: 'Asuransi', color: 'var(--chart-3)' },
  { key: 'incident', label: 'Insiden', color: 'var(--chart-6)' },
];

interface ComplianceRow {
  key: string;
  kind: string;
  detail: string;
  dueDate: string;
  daysRemaining: number | null;
  state: ComplianceState;
  amount: number;
}

const toDue = (s: ComplianceState) => (s === 'EXPIRED' ? 'overdue' : s === 'EXPIRING' ? 'dueSoon' : s === 'OK' ? 'ok' : null);

export default function GaVehicleReportTab({ assetId }: { assetId: string }) {
  const { period, setPreset, setRange } = useReportPeriod();
  const [busy, setBusy] = useState(false);
  const company = useCompanyPDF();

  const query = useQuery<VehicleReport>({
    queryKey: ['ga-vehicle-report', assetId, period.startDate, period.endDate],
    queryFn: async () =>
      (await api.get(`/ga/vehicle/assets/${assetId}/report`, { params: { from: period.startDate, to: period.endDate } })).data,
    placeholderData: keepPreviousData,
  });
  const report = query.data;

  const trend = useMemo(() => (report?.monthlyTrend ?? []).map((m) => ({ ...m, label: monthLabel(m.month) })), [report]);
  const complianceRows = useMemo<ComplianceRow[]>(
    () => [
      ...(report?.compliance.taxes ?? []).map((t, i) => ({
        key: `t${i}`, kind: 'Pajak', detail: `${TAX_TYPE_LABELS[t.type] ?? t.type} · ${t.periodYear}`,
        dueDate: t.dueDate, daysRemaining: t.daysRemaining, state: t.state, amount: t.amount,
      })),
      ...(report?.compliance.insurances ?? []).map((x, i) => ({
        key: `i${i}`, kind: 'Asuransi', detail: `${INSURANCE_TYPE_LABELS[x.type] ?? x.type}${x.provider ? ` · ${x.provider}` : ''}`,
        dueDate: x.endDate, daysRemaining: x.daysRemaining, state: x.state, amount: x.premium,
      })),
    ],
    [report],
  );

  const columns = useMemo<ColumnDef<ComplianceRow>[]>(
    () => [
      {
        id: 'detail',
        header: 'Dokumen',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{row.original.kind}</p>
            <p className="text-xs text-muted-foreground">{row.original.detail}</p>
          </div>
        ),
      },
      {
        id: 'due',
        header: 'Jatuh Tempo',
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <span className="num whitespace-nowrap">{formatDate(row.original.dueDate)}</span>
            <DueMarker state={toDue(row.original.state)} />
          </div>
        ),
      },
      {
        id: 'days',
        header: 'Sisa Hari',
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => (row.original.daysRemaining != null ? formatNumber(row.original.daysRemaining) : '-'),
      },
      {
        id: 'amount',
        header: () => <UnitHeader label="Nilai" />,
        meta: { align: 'right' },
        cell: ({ row }) => formatRupiah(row.original.amount, { symbol: false }),
      },
    ],
    [],
  );

  const renderPdf = async () =>
    pdf(
      <VehicleReportPDF
        report={report!}
        company={{ name: company.name, address: company.address, logoUrl: company.logoUrl }}
        generatedAt={new Date()}
      />,
    ).toBlob();

  const handlePdf = async () => {
    if (!report) return;
    setBusy(true);
    try {
      downloadBlob(await renderPdf(), `Report-Kendaraan_${report.asset.code}_${period.startDate}_${period.endDate}.pdf`);
    } catch {
      toast.error('Gagal membuat PDF.');
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = async () => {
    if (!report) return;
    setBusy(true);
    try {
      const url = URL.createObjectURL(await renderPdf());
      const w = window.open(url);
      if (!w) {
        toast.error('Popup diblokir browser. Izinkan popup untuk mencetak.');
        URL.revokeObjectURL(url);
        return;
      }
      w.addEventListener('load', () => w.print());
    } catch {
      toast.error('Gagal menyiapkan cetak.');
    } finally {
      setBusy(false);
    }
  };

  const loading = !report && query.isLoading;
  if (query.isError && !report) {
    return (
      <Panel title="Laporan Kendaraan">
        <PanelState error={query.error} onRetry={() => query.refetch()}>
          {null}
        </PanelState>
      </Panel>
    );
  }
  const tco = report?.tco;
  const cond = report?.condition;
  const insp = cond?.lastInspection ? INSPECTION_RESULT_META[cond.lastInspection.overallResult] : undefined;

  return (
    <div className="space-y-4">
      <ReportPeriodToolbar period={period} onPresetChange={setPreset} onRangeChange={setRange}>
        <Button variant="outline" size="sm" onClick={handlePrint} disabled={!report || busy}>
          <Printer aria-hidden />
          Cetak
        </Button>
        <Button size="sm" onClick={handlePdf} loading={busy} disabled={!report}>
          {!busy && <Download aria-hidden />}
          Unduh PDF
        </Button>
      </ReportPeriodToolbar>

      <section aria-label="Ringkasan biaya kendaraan" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Biaya (TCO)"
          icon={TrendingUp}
          loading={loading}
          value={tco ? formatRupiah(tco.totalCost, { compact: true }) : '-'}
          valueTitle={tco ? formatRupiah(tco.totalCost) : undefined}
          hint={tco ? `${formatRupiah(tco.costPerMonth, { compact: true })} / bulan` : undefined}
        />
        <StatCard
          label="Biaya per km"
          icon={Gauge}
          loading={loading}
          value={tco?.costPerKm != null ? formatRupiah(tco.costPerKm) : '-'}
          hint={tco ? (tco.distanceKm != null ? `${formatNumber(tco.distanceKm)} km tercatat` : 'Data odometer belum cukup') : undefined}
        />
        <StatCard
          label="Konsumsi BBM"
          icon={Fuel}
          loading={loading}
          value={tco?.kmPerLiter != null ? `${formatNumber(tco.kmPerLiter, { decimals: 1 })} km/L` : '-'}
          hint={tco ? `${formatNumber(tco.totalLiters, { maxDecimals: 1 })} L · ${formatRupiah(tco.breakdown.fuel, { compact: true })}` : undefined}
        />
        <StatCard
          label="Isu Kepatuhan"
          icon={AlertTriangle}
          loading={loading}
          value={report ? formatNumber(report.compliance.issueCount) : '-'}
          hint={report ? (report.compliance.issueCount > 0 ? 'Perlu tindak lanjut' : 'Semua dokumen aman') : undefined}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel title="Rincian Biaya" className="lg:col-span-2" description={report ? `${report.period.months} bulan · ${formatDate(report.period.from)} – ${formatDate(report.period.to)}` : undefined}>
          <PanelState loading={loading} empty={!!tco && tco.totalCost === 0} emptyTitle="Belum ada biaya pada periode ini">
            {tco && (
              <dl className="space-y-2.5">
                {COSTS.map((c) => {
                  const amount = tco.breakdown[c.key];
                  const pct = tco.totalCost > 0 ? amount / tco.totalCost : 0;
                  return (
                    <div key={c.key}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <dt className="flex items-center gap-1.5 text-foreground">
                          <span className="size-2.5 rounded-sm" style={{ background: c.color }} aria-hidden />
                          {c.label}
                          <span className="text-xs text-muted-foreground">({tco.counts[c.key]} transaksi)</span>
                        </dt>
                        <dd className="num text-foreground">
                          {formatRupiah(amount)} <span className="text-muted-foreground">· {formatPercent(pct)}</span>
                        </dd>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: c.color }} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t border-border pt-2.5 text-sm font-semibold">
                  <dt className="text-foreground">Total</dt>
                  <dd className="num text-foreground">{formatRupiah(tco.totalCost)}</dd>
                </div>
              </dl>
            )}
          </PanelState>
        </Panel>

        <Panel title="Tren Biaya Bulanan" className="lg:col-span-3">
          <PanelState loading={loading} skeleton="chart" empty={!trend.some((m) => m.total > 0)} emptyTitle="Belum ada biaya pada periode ini">
            <figure className="m-0">
              <div className="h-56" aria-hidden>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart accessibilityLayer={false} data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={CHART_GRID_STROKE} strokeDasharray="3 3" />
                    <XAxis dataKey="label" {...CHART_AXIS} interval="preserveStartEnd" minTickGap={8} />
                    <YAxis {...CHART_AXIS} width={52} tickFormatter={(v: number) => formatRupiah(v, { compact: true, symbol: false })} />
                    <Tooltip
                      cursor={{ fill: 'var(--accent)' }}
                      content={({ active, payload }) => {
                        const m = active ? (payload?.[0]?.payload as (typeof trend)[number] | undefined) : undefined;
                        if (!m) return null;
                        return (
                          <ChartTooltipBox
                            title={m.label}
                            rows={[
                              ...COSTS.filter((c) => m[c.key] > 0).map((c) => ({ label: c.label, value: formatRupiah(m[c.key]), color: c.color })),
                              { label: 'Total', value: formatRupiah(m.total) },
                            ]}
                          />
                        );
                      }}
                    />
                    {COSTS.map((c, i) => (
                      <Bar key={c.key} dataKey={c.key} stackId="cost" fill={c.color} stroke="var(--card)" strokeWidth={1} maxBarSize={28} radius={i === COSTS.length - 1 ? [3, 3, 0, 0] : 0} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legenda kategori biaya">
                {COSTS.map((c) => (
                  <li key={c.key} className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: c.color }} aria-hidden />
                    <span className="text-foreground">{c.label}</span>
                    <span className="num">{formatRupiah(trend.reduce((sum, m) => sum + (m[c.key] || 0), 0), { compact: true })}</span>
                  </li>
                ))}
              </ul>
              <figcaption className="sr-only">Total per bulan: {trend.map((m) => `${m.label} ${formatRupiah(m.total)}`).join('; ')}</figcaption>
            </figure>
          </PanelState>
        </Panel>
      </div>

      <Panel title="Kepatuhan Dokumen" bodyClassName="p-0">
        <DataTable
          label="Kepatuhan dokumen kendaraan"
          itemLabel="dokumen"
          columns={columns}
          data={loading ? undefined : complianceRows}
          getRowId={(r) => r.key}
          loading={loading}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: 'Belum ada dokumen aktif' }}
        />
      </Panel>

      {report && report.compliance.openIncidents.length > 0 && (
        <Panel title="Insiden Belum Selesai">
          <ul className="divide-y divide-border">
            {report.compliance.openIncidents.map((inc, i) => {
              const sev = INCIDENT_SEVERITY_META[inc.severity];
              return (
                <li key={i} className="flex flex-wrap items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{inc.description ?? '-'}</p>
                    <p className="num text-xs text-muted-foreground">{formatDate(inc.tanggal)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sev && <ToneBadge label={sev.label} tone={sev.tone} />}
                    <StatusBadge status={inc.status} />
                    <span className="num text-sm text-foreground">{formatRupiah(inc.cost)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Inspeksi & Oli" action={<ClipboardCheck className="size-4 text-muted-foreground" aria-hidden />}>
          <PanelState loading={loading}>
            <dl className="grid grid-cols-2 gap-3">
              <DetailItem label="Inspeksi terakhir">
                {cond?.lastInspection ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="num">{formatDate(cond.lastInspection.tanggal)}</span>
                    {insp && <ToneBadge label={insp.label} tone={insp.tone} />}
                  </span>
                ) : (
                  'Belum ada'
                )}
              </DetailItem>
              <DetailItem label="Ganti oli terakhir">
                {cond?.lastOil ? (
                  <span className="num">
                    {formatDate(cond.lastOil.tanggal)} · {formatNumber(cond.lastOil.odometer)} km
                  </span>
                ) : (
                  'Belum ada'
                )}
              </DetailItem>
              {cond?.lastOil && (
                <DetailItem label="Ganti oli berikutnya" className="col-span-2">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="num">{formatNumber(cond.lastOil.nextOdometerDue)} km</span>
                    {cond.lastOil.remainingKm != null && (
                      <span className="num text-muted-foreground">(sisa {formatNumber(cond.lastOil.remainingKm)} km)</span>
                    )}
                    {cond.lastOil.isDue != null && <DueMarker state={cond.lastOil.isDue ? 'overdue' : 'ok'} />}
                  </span>
                </DetailItem>
              )}
            </dl>
          </PanelState>
        </Panel>

        <Panel title={`Ban Terpasang (${cond?.activeTireCount ?? 0})`} action={<CircleDot className="size-4 text-muted-foreground" aria-hidden />}>
          <PanelState loading={loading} empty={!!cond && cond.activeTires.length === 0} emptyTitle="Belum ada data ban terpasang">
            <ul className="divide-y divide-border">
              {(cond?.activeTires ?? []).map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{TIRE_POSITION_LABELS[t.position] ?? t.position}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.brand ?? '-'}
                      {t.serialNumber ? ` · ${t.serialNumber}` : ''} · pasang {formatDate(t.installedAt)}
                    </p>
                  </div>
                  <span className="num text-sm text-foreground">{t.usageKm != null ? `${formatNumber(t.usageKm)} km` : '-'}</span>
                </li>
              ))}
            </ul>
          </PanelState>
        </Panel>
      </div>
    </div>
  );
}
