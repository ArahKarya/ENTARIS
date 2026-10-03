/**
 * Internal component review page (/_ui). Registered only when
 * import.meta.env.DEV, lazy-loaded, never shipped in production builds.
 * Every section renders twice: in a forced .light and a forced .dark scope.
 */
import { useState, type ReactNode } from 'react';
import { FileText, Inbox, Plus, Receipt, Search, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { BrandMark, ConfirmDialog, EmptyState, Field, PageHeader, StatCard, StatusBadge, Wordmark } from '@/components/shared';
import { formatDate, formatDateRange, formatNumber, formatPercent, formatRupiah, NUM_CLASS } from '@/lib/format';
import { STATUS_TONES } from '@/lib/status';

const SWATCHES = [
  'background', 'surface', 'surface-sunken', 'surface-raised', 'brand-navy', 'brand-accent',
  'border', 'border-strong', 'input', 'ring', 'text', 'text-secondary', 'text-muted',
  'primary', 'primary-hover', 'primary-subtle', 'success', 'success-subtle', 'warning',
  'warning-subtle', 'danger', 'danger-subtle', 'info', 'info-subtle',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6',
] as const;

const STATUSES = ['Draft', 'Submitted', 'Paid', 'PartiallyPaid', 'Overdue', 'Cancelled', 'IN_PROGRESS', 'Disetor'];

const ROWS = [
  { no: 'INV/2026/10/0001', customer: 'PT Sinar Pangan', date: '2026-10-01', total: 12_500_000, status: 'Paid' },
  { no: 'INV/2026/10/0002', customer: 'CV Maju Bersama', date: '2026-10-02', total: 3_250_000.5, status: 'PartiallyPaid' },
  { no: 'INV/2026/09/0114', customer: 'UD Tani Makmur', date: '2026-09-12', total: 870_000, status: 'Overdue' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Showcase({ scheme }: { scheme: 'light' | 'dark' }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [name, setName] = useState('');

  return (
    <div className={`${scheme} space-y-8 rounded-xl border border-border bg-background p-6 text-foreground`}>
      <PageHeader
        title={scheme === 'light' ? 'Terang' : 'Gelap'}
        description="Pratinjau komponen design system Entaris."
        icon={FileText}
        breadcrumbs={[{ label: 'Beranda', href: '/' }, { label: 'Komponen' }]}
        actions={
          <>
            <Button variant="outline">Ekspor</Button>
            <Button>
              <Plus /> Buat invoice
            </Button>
          </>
        }
      />

      <Section title="Brand">
        <div className="flex flex-wrap items-center gap-4">
          <BrandMark size={40} />
          <span className="rounded-lg bg-brand-navy p-2">
            <BrandMark size={40} variant="negative" />
          </span>
          <BrandMark size={40} variant="mono" className="text-foreground" />
          <BrandMark size={16} />
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <Wordmark variant={scheme === 'dark' ? 'negative' : 'default'} product="ERP" />
          <Wordmark variant={scheme === 'dark' ? 'negative' : 'default'} product="EAM" size="lg" tagline />
          <span className="rounded-lg bg-brand-navy px-3 py-2">
            <Wordmark variant="negative" size="sm" />
          </span>
        </div>
      </Section>

      <Section title="Token warna">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {SWATCHES.map((t) => (
            <div key={t} className="space-y-1">
              <div className="h-8 rounded-md border border-border" style={{ background: `var(--${t})` }} />
              <p className="truncate text-[11px] text-muted-foreground">{t}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografi">
        <div className="space-y-1">
          <p className="font-heading text-[28px] font-bold leading-[34px] num">{formatRupiah(1_284_500_000)}</p>
          <p className="font-heading text-[22px] font-semibold leading-7">Judul halaman (page)</p>
          <p className="text-lg font-semibold">Judul seksi (title)</p>
          <p className="text-base">Teks isi 16 · body default di mobile</p>
          <p className="text-sm text-foreground-secondary">Teks sekunder 14</p>
          <p className="text-xs text-muted-foreground">Caption 12 · teks redup</p>
        </div>
      </Section>

      <Section title="Tombol">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">
            <Trash2 /> Hapus
          </Button>
          <Button variant="link">Tautan</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Kecil</Button>
          <Button size="md">Sedang</Button>
          <Button size="lg">Besar</Button>
          <Button loading>Menyimpan…</Button>
          <Button disabled>Nonaktif</Button>
          <SimpleTooltip content="Cari dokumen">
            <Button size="icon" variant="outline" aria-label="Cari">
              <Search />
            </Button>
          </SimpleTooltip>
        </div>
      </Section>

      <Section title="Form">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama pelanggan" required hint="Sesuai dokumen pajak">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="PT Contoh Abadi" />
          </Field>
          <Field label="NPWP" error="Format NPWP tidak valid">
            <Input defaultValue="12.345" />
          </Field>
          <Field label="Gudang">
            {(p) => (
              <Select defaultValue="utama">
                <SelectTrigger {...p}>
                  <SelectValue placeholder="Pilih gudang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="utama">Gudang Utama</SelectItem>
                  <SelectItem value="cabang">Gudang Cabang</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Dinonaktifkan">
            <Input disabled defaultValue="Tidak bisa diubah" />
          </Field>
          <Field label="Catatan" className="sm:col-span-2">
            <Textarea placeholder="Catatan internal…" />
          </Field>
        </div>
      </Section>

      <Section title="Badge & status">
        <div className="flex flex-wrap gap-2">
          {(['neutral', 'primary', 'success', 'warning', 'danger', 'info', 'outline', 'solid'] as const).map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} docType="sales_invoice" />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_TONES.map((t) => (
            <StatusBadge key={t} status={t} tone={t} label={`tone ${t}`} />
          ))}
        </div>
      </Section>

      <Section title="Kartu statistik">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Pendapatan bulan ini"
            value={formatRupiah(1_284_500_000, { compact: true })}
            valueTitle={formatRupiah(1_284_500_000)}
            icon={Wallet}
            delta={{ value: '12,4%', direction: 'up', label: 'vs bulan lalu' }}
            href="/_ui"
          />
          <StatCard
            label="Piutang jatuh tempo"
            value={formatRupiah(86_250_000, { compact: true })}
            icon={Receipt}
            delta={{ value: '3', direction: 'up', upIsGood: false, label: 'invoice baru' }}
          />
          <StatCard label="Memuat" value="—" loading />
        </div>
      </Section>

      <Section title="Kartu & tab">
        <Card>
          <CardHeader>
            <CardTitle>Ringkasan penjualan</CardTitle>
            <CardDescription>{formatDateRange('2026-10-01', '2026-10-31')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="a">
              <TabsList>
                <TabsTrigger value="a">Semua</TabsTrigger>
                <TabsTrigger value="b">Belum lunas</TabsTrigger>
                <TabsTrigger value="c">Lunas</TabsTrigger>
              </TabsList>
              <TabsContent value="a">Tab segmented.</TabsContent>
              <TabsContent value="b">Isi tab kedua.</TabsContent>
              <TabsContent value="c">Isi tab ketiga.</TabsContent>
            </Tabs>
            <Tabs defaultValue="x" className="mt-4">
              <TabsList variant="underline">
                <TabsTrigger value="x">Detail</TabsTrigger>
                <TabsTrigger value="y">Riwayat</TabsTrigger>
              </TabsList>
              <TabsContent value="x">Tab underline.</TabsContent>
              <TabsContent value="y">Riwayat dokumen.</TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter>
            <Button size="sm" variant="outline">
              Lihat semua
            </Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Tabel">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. invoice</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead numeric>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((r, i) => (
                <TableRow key={r.no} data-state={i === 1 ? 'selected' : undefined}>
                  <TableCell className="font-mono text-xs">{r.no}</TableCell>
                  <TableCell>{r.customer}</TableCell>
                  <TableCell>{formatDate(r.date)}</TableCell>
                  <TableCell numeric>{formatRupiah(r.total, { decimals: 2 })}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} docType="sales_invoice" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell numeric>{formatRupiah(16_620_000.5, { decimals: 2 })}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Format: <span className={NUM_CLASS}>{formatNumber(1234567.891, { decimals: 2 })}</span> ·{' '}
          {formatPercent(0.125)} · {formatRupiah(-50000, { negative: 'parens' })}
        </p>
      </Section>

      <Section title="Empty state">
        <div className="grid gap-3 sm:grid-cols-3">
          {(['empty', 'no-results', 'error'] as const).map((k) => (
            <Card key={k}>
              <EmptyState
                kind={k}
                compact
                icon={k === 'empty' ? Inbox : undefined}
                action={k === 'error' ? <Button size="sm" variant="outline">Coba lagi</Button> : undefined}
              />
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Overlay">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDialogOpen(true)}>
            Buka dialog
          </Button>
          <Button variant="outline" onClick={() => setSheetOpen(true)}>
            Buka sheet
          </Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Batalkan invoice
          </Button>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>Tambah pelanggan</DialogTitle>
              <DialogDescription>Isi data pelanggan baru.</DialogDescription>
            </DialogHeader>
            <Field label="Nama" required>
              <Input />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Batal
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent size="md">
            <SheetHeader>
              <SheetTitle>INV/2026/10/0001</SheetTitle>
              <SheetDescription>PT Sinar Pangan · {formatDate('2026-10-01', 'long')}</SheetDescription>
            </SheetHeader>
            <SheetBody>
              <StatusBadge status="Paid" />
            </SheetBody>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>
                Tutup
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          tone="danger"
          title="Batalkan invoice INV/2026/10/0001?"
          description="Jurnal dan stok terkait akan dibalik. Tindakan ini tidak bisa diurungkan."
          confirmLabel="Batalkan invoice"
          requireReason
          onConfirm={() => new Promise((resolve) => setTimeout(resolve, 600))}
        />
      </Section>
    </div>
  );
}

export default function UiPlayground() {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Wordmark product="ERP" />
          <p className="text-sm text-muted-foreground">/_ui · hanya mode pengembangan</p>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Showcase scheme="light" />
          <Showcase scheme="dark" />
        </div>
      </div>
    </main>
  );
}
