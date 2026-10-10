/**
 * Editable review table of a Draft Buku Kas. Rows arrive with the user's pending edits
 * already applied (see cash-book.withEdit); every change goes up through onEdit. The table
 * sits in a focusable scroll region so it stays usable at 390px. "Ragu" (doubtful) and
 * "Duplikat?" are text + icon markers, never colour alone; the reason is expandable.
 */
import { memo, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { ComboboxFilter, type ComboboxOption } from '@/components/shared';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MoneyInput } from '@/components/payment-requests/MoneyInput';
import { TXN_LABEL, confidencePercent, isAdvanceType, typesFor, type DraftRow, type RowEdit, type TxnType } from './cash-book';

interface TableProps {
  rows: readonly DraftRow[];
  editable: boolean;
  options: ComboboxOption[];
  selected: ReadonlySet<string>;
  allSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onEdit: (id: string, change: RowEdit) => void;
}

interface RowProps {
  row: DraftRow;
  editable: boolean;
  options: ComboboxOption[];
  selected: boolean;
  expanded: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onToggle: (id: string) => void;
  onEdit: (id: string, change: RowEdit) => void;
}

const TH = 'px-2 py-2 text-left font-medium whitespace-nowrap';

const ReviewRow = memo(function ReviewRow({ row, editable, options, selected, expanded, onSelect, onToggle, onEdit }: RowProps) {
  const locked = !!row.journalEntryId;
  const canEdit = editable && !locked;
  const n = row.idx;
  const advance = isAdvanceType(row.txnType);
  const reasonId = `reason-${row.id}`;
  const dim = row.skip && !locked;

  const amountCell = (side: 'masuk' | 'keluar') =>
    row.direction !== side ? (
      <span className="text-muted-foreground" aria-label="kosong">—</span>
    ) : canEdit ? (
      <MoneyInput aria-label={`Nominal ${side} baris ${n}`} className="min-w-24" value={row.amount} onChange={(v) => v !== null && v > 0 && onEdit(row.id, { amount: v })} />
    ) : (
      <span className="num font-medium text-foreground">{formatNumber(row.amount, { maxDecimals: 2 })}</span>
    );

  return (
    <>
      <tr className={cn('align-top', row.needsReview && !row.skip && !locked && 'bg-warning-subtle/40', dim && 'text-muted-foreground', row.error && 'bg-danger-subtle/40')} data-row={row.idx}>
        <td className="w-8 px-2 py-2">
          {canEdit && <Checkbox aria-label={`Pilih baris ${n}`} checked={selected} onCheckedChange={(c) => onSelect(row.id, c === true)} />}
        </td>
        <th scope="row" className="num px-2 py-2 text-left font-normal text-muted-foreground">{n}</th>
        <td className="px-2 py-2">
          {canEdit ? (
            <Input type="date" aria-label={`Tanggal baris ${n}`} className="w-36 px-2" value={row.rowDate} onChange={(e) => e.target.value && onEdit(row.id, { date: e.target.value })} />
          ) : (
            <span className="num whitespace-nowrap">{row.rowDate}</span>
          )}
        </td>
        <td className="min-w-48 px-2 py-2">
          {canEdit ? (
            <Input aria-label={`Keterangan baris ${n}`} value={row.description} maxLength={500} onChange={(e) => onEdit(row.id, { description: e.target.value })} />
          ) : (
            <span className={cn('break-words', dim && 'line-through')}>{row.description}</span>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {row.isDuplicate && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-warning-subtle px-1.5 py-0.5 font-medium text-warning-text">
                <Copy className="size-3" aria-hidden />
                Duplikat?
              </span>
            )}
            {locked && row.journalNumber && (
              <Link to={`/gl?q=${encodeURIComponent(row.journalNumber)}`} className="num font-medium text-primary underline-offset-2 hover:underline">
                {row.journalNumber}
              </Link>
            )}
            {row.error && <span className="font-medium text-danger-text">Gagal: {row.error}</span>}
          </div>
        </td>
        <td className="px-2 py-2 text-right">{amountCell('masuk')}</td>
        <td className="px-2 py-2 text-right">{amountCell('keluar')}</td>
        <td className="px-2 py-2">
          {canEdit ? (
            <Select value={row.txnType} onValueChange={(v) => onEdit(row.id, { txnType: v as TxnType })}>
              <SelectTrigger className="w-40" aria-label={`Jenis transaksi baris ${n}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typesFor(row.direction).map((t) => (
                  <SelectItem key={t} value={t}>{TXN_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="whitespace-nowrap">{TXN_LABEL[row.txnType]}</span>
          )}
        </td>
        <td className="min-w-52 px-2 py-2">
          {canEdit && !advance ? (
            <ComboboxFilter
              label={`Akun lawan baris ${n}`}
              value={row.accountId ?? ''}
              onChange={(v) => onEdit(row.id, { accountId: v || null })}
              options={options}
              allLabel="Pilih akun…"
              searchPlaceholder="Cari nomor atau nama akun…"
            />
          ) : (
            <span className={cn(!row.accountLabel && 'text-danger-text font-medium')}>{row.accountLabel ?? 'Belum dipilih'}</span>
          )}
        </td>
        <td className="px-2 py-2">
          <div className="flex flex-col items-start gap-1">
            <span className="num text-xs text-muted-foreground">{confidencePercent(row.confidence)}</span>
            {row.needsReview && !locked && (
              <span title={row.reason ?? undefined} className="inline-flex items-center gap-1 rounded-sm bg-warning-subtle px-1.5 py-0.5 text-xs font-medium text-warning-text">
                <AlertTriangle className="size-3" aria-hidden />
                Ragu
              </span>
            )}
            {row.reason && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={reasonId}
                onClick={() => onToggle(row.id)}
                className="inline-flex items-center gap-0.5 rounded-sm text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {expanded ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
                Alasan<span className="sr-only"> baris {n}</span>
              </button>
            )}
          </div>
        </td>
        <td className="w-14 px-2 py-2 text-center">
          {canEdit ? (
            <Checkbox aria-label={`Lewati baris ${n}`} checked={row.skip} onCheckedChange={(c) => onEdit(row.id, { skip: c === true })} />
          ) : (
            <span className="text-xs text-muted-foreground">{locked ? 'Diposting' : row.skip ? 'Dilewati' : ''}</span>
          )}
        </td>
      </tr>
      {expanded && row.reason && (
        <tr id={reasonId} className="bg-muted/40">
          <td colSpan={10} className="py-2 pl-12 pr-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Alasan klasifikasi:</span> {row.reason}
          </td>
        </tr>
      )}
    </>
  );
});

export function ReviewTable({ rows, editable, options, selected, allSelected, onSelect, onSelectAll, onEdit }: TableProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard reachable
    <div role="region" tabIndex={0} aria-label="Tabel baris draft buku kas (geser untuk melihat semua kolom)" className="relative overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[66rem] text-sm">
        <caption className="sr-only">Baris draft buku kas: tanggal, keterangan, masuk, keluar, jenis transaksi, akun lawan, keyakinan, dan lewati</caption>
        <thead>
          <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="w-8 px-2 py-2">
              <span className="sr-only">Pilih</span>
              {editable && <Checkbox aria-label="Pilih semua baris yang tampil" checked={allSelected} onCheckedChange={(c) => onSelectAll(c === true)} />}
            </th>
            <th scope="col" className={TH}>#</th>
            <th scope="col" className={TH}>Tanggal</th>
            <th scope="col" className={TH}>Keterangan</th>
            <th scope="col" className={cn(TH, 'text-right')}>Masuk</th>
            <th scope="col" className={cn(TH, 'text-right')}>Keluar</th>
            <th scope="col" className={TH}>Jenis transaksi</th>
            <th scope="col" className={TH}>Akun lawan</th>
            <th scope="col" className={TH}>Keyakinan</th>
            <th scope="col" className={cn(TH, 'text-center')}>Lewati</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <ReviewRow
              key={row.id}
              row={row}
              editable={editable}
              options={options}
              selected={selected.has(row.id)}
              expanded={expanded.has(row.id)}
              onSelect={onSelect}
              onToggle={toggle}
              onEdit={onEdit}
            />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">Tidak ada baris yang cocok dengan filter.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
