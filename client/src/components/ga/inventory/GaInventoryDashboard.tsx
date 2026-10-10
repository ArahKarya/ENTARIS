/**
 * Inventaris Kantor → tab "Dashboard stok" (default, no ?tab). Every figure
 * comes from GET /ga/inventory/dashboard (computed server-side from stock per
 * location and the movement log; nothing is derived from a client subset).
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Boxes, MapPin, Package, TrendingUp } from 'lucide-react';
import api from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { StatCard, StatusBadge } from '@/components/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Panel, PanelState } from '@/components/inventory/dashboard-kit';
import { MovementType } from './GaMovementsTab';
import {
  GA_INVENTORY_KEY,
  MOVEMENT_TYPES,
  formatMovementQty,
  formatQty,
  movementRoute,
  type GaInventoryDashboard as DashboardData,
} from './ga-inventory-model';

interface GaInventoryDashboardProps {
  onShowMovements: () => void;
  onShowLowStock: () => void;
}

function useDashboard() {
  return useQuery({
    queryKey: [GA_INVENTORY_KEY, 'dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/ga/inventory/dashboard')).data,
  });
}

interface BreakdownRow {
  key: string;
  name: ReactNode;
  items: number;
  qty: number;
}

function BreakdownTable({ label, head, rows }: { label: string; head: string; rows: BreakdownRow[] }) {
  return (
    <Table aria-label={label}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{head}</TableHead>
          <TableHead scope="col" className="text-right">
            Item
          </TableHead>
          <TableHead scope="col" className="text-right">
            Total Qty
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="min-w-0">{r.name}</TableCell>
            <TableCell className="num text-right text-muted-foreground">{formatNumber(r.items)}</TableCell>
            <TableCell className="num text-right font-medium text-foreground">{formatQty(r.qty)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function GaInventoryDashboard({ onShowMovements, onShowLowStock }: GaInventoryDashboardProps) {
  const q = useDashboard();
  const d = q.data;
  const loading = q.isLoading;
  const s = d?.summary;

  return (
    <div className="space-y-5">
      <section aria-label="Ringkasan stok inventaris kantor" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Item"
          icon={Package}
          loading={loading}
          value={s ? formatNumber(s.totalItems) : '—'}
          hint={s ? `${formatNumber(s.activeItems)} aktif · ${formatNumber(s.categoryCount)} kategori` : undefined}
        />
        <StatCard
          label="Total Kuantitas"
          icon={Boxes}
          loading={loading}
          value={s ? formatQty(s.totalQty) : '—'}
          hint={s ? `di ${formatNumber(s.locationCount)} lokasi` : undefined}
        />
        <StatCard
          label="Perlu Restock"
          icon={AlertTriangle}
          loading={loading}
          value={s ? formatNumber(s.lowStockCount) : '—'}
          hint={s ? `di bawah minimum · ${formatNumber(s.outOfStockCount)} habis` : undefined}
        />
        <StatCard
          label="Mutasi 30 Hari"
          icon={TrendingUp}
          loading={loading}
          value={s ? formatNumber(s.movements30d) : '—'}
          hint={s ? `${formatNumber(s.itemsMoved30d)} item bergerak` : undefined}
        />
      </section>

      <Panel title="Aktivitas Mutasi" description="30 hari terakhir, per tipe pergerakan">
        <PanelState loading={loading} error={q.error} onRetry={() => q.refetch()}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {MOVEMENT_TYPES.map((t) => {
              const total = d?.movementTotals[t] ?? { count: 0, qty: 0 };
              return (
                <div key={t} className="min-w-0 rounded-md border border-border px-3 py-2.5">
                  <dt className="text-sm">
                    <MovementType type={t} />
                  </dt>
                  <dd className="num mt-1 font-heading text-lg font-semibold text-foreground">{formatQty(total.qty)}</dd>
                  <dd className="text-xs text-muted-foreground">{formatNumber(total.count)} transaksi</dd>
                </div>
              );
            })}
          </dl>
        </PanelState>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Stok per Lokasi" action={<MapPin className="size-4 text-muted-foreground" aria-hidden />}>
          <PanelState
            loading={loading}
            error={q.error}
            onRetry={() => q.refetch()}
            empty={d?.byLocation.length === 0}
            emptyIcon={MapPin}
            emptyTitle="Belum ada lokasi"
            emptyDescription="Tambahkan lokasi gudang di Data Induk Aset."
          >
            <div className="-m-4">
              <BreakdownTable
                label="Stok per Lokasi"
                head="Lokasi"
                rows={(d?.byLocation ?? []).map((l) => ({
                  key: l.code,
                  name: (
                    <>
                      <span className="block font-medium text-foreground">{l.name}</span>
                      <span className="num block font-mono text-xs text-muted-foreground">{l.code}</span>
                    </>
                  ),
                  items: l.items,
                  qty: l.qty,
                }))}
              />
            </div>
          </PanelState>
        </Panel>

        <Panel title="Stok per Kategori" action={<Boxes className="size-4 text-muted-foreground" aria-hidden />}>
          <PanelState
            loading={loading}
            error={q.error}
            onRetry={() => q.refetch()}
            empty={d?.byCategory.length === 0}
            emptyIcon={Boxes}
            emptyTitle="Belum ada kategori terpakai"
          >
            <div className="-m-4">
              <BreakdownTable
                label="Stok per Kategori"
                head="Kategori"
                rows={(d?.byCategory ?? []).map((c) => ({
                  key: c.name,
                  name: (
                    <>
                      <span className="block font-medium text-foreground">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.type === 'SPAREPART' ? 'Sparepart' : 'Habis pakai'}
                      </span>
                    </>
                  ),
                  items: c.items,
                  qty: c.qty,
                }))}
              />
            </div>
          </PanelState>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Item di Bawah Stok Minimum"
          description="10 kekurangan terbesar"
          action={
            <Button variant="link" size="sm" onClick={onShowLowStock}>
              Lihat item
            </Button>
          }
        >
          <PanelState
            loading={loading}
            error={q.error}
            onRetry={() => q.refetch()}
            empty={d?.lowStockItems.length === 0}
            emptyIcon={Package}
            emptyTitle="Semua item aman"
            emptyDescription="Tidak ada item di bawah stok minimum."
          >
            <ul className="divide-y divide-border">
              {d?.lowStockItems.map((it) => {
                const state = it.totalStock <= 0 ? 'out' : 'low';
                return (
                  <li key={it.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-medium break-words text-foreground">{it.name}</p>
                      <p className="num truncate font-mono text-xs text-muted-foreground">
                        {it.sku} · {it.category}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                      <span className="num inline-flex items-center gap-1 text-sm font-semibold text-danger-text">
                        <AlertTriangle className="size-3.5" aria-hidden />
                        {formatQty(it.totalStock)} <span className="text-xs font-normal text-muted-foreground">{it.uom}</span>
                      </span>
                      <span className="num text-xs text-muted-foreground">
                        min {formatQty(it.minStock)} · kurang {formatQty(it.shortfall)}
                      </span>
                      <StatusBadge status={state} docType="inventory_item" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </PanelState>
        </Panel>

        <Panel
          title="Mutasi Terakhir"
          action={
            <Button variant="link" size="sm" onClick={onShowMovements}>
              <ArrowLeftRight aria-hidden />
              Lihat semua
            </Button>
          }
        >
          <PanelState
            loading={loading}
            error={q.error}
            onRetry={() => q.refetch()}
            empty={d?.recentMovements.length === 0}
            emptyIcon={ArrowLeftRight}
            emptyTitle="Belum ada pergerakan"
          >
            <ul className="divide-y divide-border">
              {d?.recentMovements.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{m.item?.name ?? '—'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="num">{formatDateTime(m.createdAt)}</span> · {movementRoute(m)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                    <span className="num text-sm font-medium text-foreground">
                      {formatMovementQty(m)} <span className="text-xs font-normal text-muted-foreground">{m.item?.uom}</span>
                    </span>
                    <MovementType type={m.type} className="text-xs" />
                  </div>
                </li>
              ))}
            </ul>
          </PanelState>
        </Panel>
      </div>
    </div>
  );
}
