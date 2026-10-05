import { memo, useId } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { focusRing } from '@/components/ui/styles';
import { formatDate, formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface LedgerEntry {
  id: string;
  date: string;
  debit: number;
  credit: number;
  description: string;
  referenceType: string | null;
  runningBalance: number;
}

export interface AccountLedger {
  accountId: string;
  accountNumber: string;
  accountName: string;
  rootType: string;
  openingBalance: number;
  entries: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

/** Ledger convention kept from the original page: absolute value, "(CR)" suffix when negative. */
function balanceText(value: number): string {
  return `${formatRupiah(Math.abs(value), { symbol: false })}${value < 0 ? ' (CR)' : ''}`;
}

const TH = 'sticky top-0 z-10 border-b border-border bg-muted px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground';

interface Props {
  account: AccountLedger;
  expanded: boolean;
  onToggle: (accountId: string) => void;
}

/** One collapsible account block of the general ledger. */
function LedgerAccountCardBase({ account, expanded, onToggle }: Props) {
  const panelId = useId();
  const closingNegative = account.closingBalance < 0;
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-1)]" aria-label={`${account.accountNumber} ${account.accountName}`}>
      <h2 className="text-base">
        <button
          type="button"
          onClick={() => onToggle(account.accountId)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className={cn('flex min-h-11 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-muted/50', focusRing)}
        >
          <span className="flex min-w-0 items-center gap-3">
            {expanded ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{account.accountNumber}</span>
            <span className="text-sm font-semibold">{account.accountName}</span>
            <span className="text-xs uppercase text-muted-foreground">{account.entries.length} mutasi</span>
          </span>
          <span className="ml-7 text-left sm:ml-0 sm:text-right">
            <span className="block text-xs text-muted-foreground">Saldo Akhir</span>
            <span className={cn('num text-sm font-medium', closingNegative && 'text-danger-text')}>{balanceText(account.closingBalance)}</span>
          </span>
        </button>
      </h2>

      {expanded && (
        <div
          id={panelId}
          role="region"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          aria-label={`Mutasi ${account.accountName}`}
          className={cn('max-h-[60vh] overflow-auto border-t border-border', focusRing)}
        >
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Mutasi akun {account.accountNumber} {account.accountName} dengan saldo berjalan</caption>
            <thead>
              <tr>
                <th scope="col" className={cn(TH, 'text-left')}>Tanggal</th>
                <th scope="col" className={cn(TH, 'text-left')}>Keterangan</th>
                <th scope="col" className={cn(TH, 'text-right')}>Debit</th>
                <th scope="col" className={cn(TH, 'text-right')}>Kredit</th>
                <th scope="col" className={cn(TH, 'text-right')}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {account.openingBalance !== 0 && (
                <tr className="border-b border-border bg-info-subtle">
                  <th scope="row" colSpan={4} className="px-4 py-2 text-left text-xs font-medium italic text-info-text">Saldo Awal</th>
                  <td className="num px-4 py-2 text-right text-xs font-medium text-info-text">{balanceText(account.openingBalance)}</td>
                </tr>
              )}
              {account.entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border hover:bg-muted/50">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{formatDate(entry.date)}</td>
                  <td className="min-w-48 px-4 py-2 text-xs">{entry.description || '—'}</td>
                  <td className="num px-4 py-2 text-right text-xs">
                    {entry.debit > 0 ? formatRupiah(entry.debit, { symbol: false }) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="num px-4 py-2 text-right text-xs">
                    {entry.credit > 0 ? formatRupiah(entry.credit, { symbol: false }) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className={cn('num whitespace-nowrap px-4 py-2 text-right text-xs font-medium', entry.runningBalance < 0 && 'text-danger-text')}>
                    {balanceText(entry.runningBalance)}
                  </td>
                </tr>
              ))}
              {account.entries.length === 0 && (
                <tr className="border-b border-border">
                  <td colSpan={5} className="px-4 py-4 text-center text-xs text-muted-foreground">Tidak ada mutasi pada periode ini</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border-strong bg-muted font-semibold">
                <th scope="row" colSpan={2} className="px-4 py-2.5 text-left text-xs">Total Mutasi</th>
                <td className="num px-4 py-2.5 text-right text-xs">{formatRupiah(account.totalDebit, { symbol: false })}</td>
                <td className="num px-4 py-2.5 text-right text-xs">{formatRupiah(account.totalCredit, { symbol: false })}</td>
                <td className={cn('num whitespace-nowrap px-4 py-2.5 text-right text-xs font-bold', closingNegative && 'text-danger-text')}>
                  {balanceText(account.closingBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

export const LedgerAccountCard = memo(LedgerAccountCardBase);
