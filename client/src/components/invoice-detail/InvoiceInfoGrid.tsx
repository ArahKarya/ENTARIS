/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped (same as the legacy drawer) */
/** Party + invoice meta block (with inline due-date/terms edit) for InvoiceDetailDrawer. */
import { Calendar, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { DateInput, Field } from '@/components/shared';

interface InvoiceInfoGridProps {
  invoice: any;
  party: any;
  partyLabel: string;
  isOverdue: boolean;
  isEditing: boolean;
  editDueDate: string;
  editTerms: string;
  onEditDueDate: (v: string) => void;
  onEditTerms: (v: string) => void;
}

const sectionTitle = 'mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

export function InvoiceInfoGrid({
  invoice,
  party,
  partyLabel,
  isOverdue,
  isEditing,
  editDueDate,
  editTerms,
  onEditDueDate,
  onEditTerms,
}: InvoiceInfoGridProps) {
  return (
    <div className="grid grid-cols-1 gap-6 border-b border-border px-6 py-4 sm:grid-cols-2">
      <div>
        <h3 className={sectionTitle}><User size={10} aria-hidden /> {partyLabel}</h3>
        <p className="text-sm font-semibold text-foreground">{party?.name ?? '—'}</p>
        {party?.phone && <p className="mt-0.5 text-xs text-muted-foreground">{party.phone}</p>}
        {party?.email && <p className="text-xs text-muted-foreground">{party.email}</p>}
        {party?.address && <p className="mt-0.5 text-xs text-muted-foreground">{party.address}</p>}
        {party?.taxId && <p className="text-xs text-muted-foreground">NPWP: {party.taxId}</p>}
      </div>

      <div>
        <h3 className={sectionTitle}><Calendar size={10} aria-hidden /> Informasi Invoice</h3>
        {isEditing ? (
          <div className="space-y-3">
            <Field label="Jatuh Tempo">
              {(c) => <DateInput id={c.id} value={editDueDate} onChange={onEditDueDate} />}
            </Field>
            <Field label="Termin">
              <Input value={editTerms} onChange={(e) => onEditTerms(e.target.value)} placeholder="Net 30" autoComplete="off" />
            </Field>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Tanggal</dt>
              <dd className="text-xs font-medium text-foreground">{formatDate(invoice.date)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Jatuh Tempo</dt>
              <dd className={cn('text-xs font-medium', isOverdue ? 'text-danger-text' : 'text-foreground')}>
                {invoice.dueDate ? formatDate(invoice.dueDate) : '—'}
              </dd>
            </div>
            {invoice.terms && (
              <div>
                <dt className="text-xs text-muted-foreground">Termin</dt>
                <dd className="text-xs font-medium text-foreground">{invoice.terms}</dd>
              </div>
            )}
            {invoice.customerRefNo && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">No. Ref. PO / Penawaran</dt>
                <dd className="font-mono text-xs font-medium text-foreground">{invoice.customerRefNo}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">Dibuat oleh</dt>
              <dd className="text-xs font-medium text-foreground">{invoice.user?.fullName ?? '—'}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
