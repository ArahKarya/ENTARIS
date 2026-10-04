/**
 * Detail drawer for one project guarantee (Uang Jaminan Proyek): document
 * fields, settled amounts and the settlement history. Renders from the list
 * row (the list endpoint already carries settlements with account names), so
 * it needs no extra request. Write actions are passed in by the page, which
 * owns the permission checks and the confirmations.
 */
import type { ReactNode } from 'react';
import { Undo2, XCircle } from 'lucide-react';
import { formatDate, formatRupiah, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { StatusBadge } from '@/components/shared';
import { DueDate, type GuaranteeDueState } from './ProjectGuaranteeDueDate';

type Money = string | number;

export interface GuaranteeAccount {
  id: string;
  accountNumber: string;
  name: string;
}

export interface GuaranteeSettlementRow {
  id: string;
  date: string;
  returnAmount: Money;
  forfeitAmount: Money;
  notes?: string | null;
  isCancelled: boolean;
  returnAccount?: GuaranteeAccount | null;
  forfeitAccount?: GuaranteeAccount | null;
}

export interface ProjectGuaranteeRow {
  id: string;
  guaranteeNumber: string;
  date: string;
  guaranteeType: string;
  projectName: string;
  referenceNo?: string | null;
  amount: Money;
  expectedReturnDate?: string | null;
  notes?: string | null;
  status: string;
  party?: { id: string; name: string } | null;
  account?: GuaranteeAccount | null;
  settlements?: GuaranteeSettlementRow[];
  totalReturned: number;
  totalForfeited: number;
  outstanding: number;
  dueState?: GuaranteeDueState | null;
}

interface ProjectGuaranteeDetailSheetProps {
  guarantee: ProjectGuaranteeRow | null;
  onClose: () => void;
  /** Present only when the user may settle this guarantee. */
  onSettle?: () => void;
  /** Present only when the user may cancel this guarantee. */
  onCancel?: () => void;
  /** Present only when the user may cancel settlements. */
  onCancelSettlement?: (settlement: GuaranteeSettlementRow) => void;
}

const num = (v: Money | null | undefined) => toNumber(v) ?? 0;

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

function Figure({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={emphasis ? 'num mt-0.5 font-semibold text-foreground' : 'num mt-0.5 text-foreground'}>
        {formatRupiah(value)}
      </dd>
    </div>
  );
}

export function ProjectGuaranteeDetailSheet({
  guarantee: g,
  onClose,
  onSettle,
  onCancel,
  onCancelSettlement,
}: ProjectGuaranteeDetailSheetProps) {
  const settlements = (g?.settlements ?? []).filter((s) => !s.isCancelled);

  return (
    <Sheet open={g !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="md">
        {g && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="num font-mono">{g.guaranteeNumber}</SheetTitle>
                <StatusBadge status={g.status} docType="project_guarantee" />
              </div>
              <SheetDescription>{g.projectName}</SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-6">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Detail label="Pemberi proyek">{g.party?.name ?? '-'}</Detail>
                <Detail label="Jenis jaminan">{g.guaranteeType}</Detail>
                <Detail label="Tanggal setor">{formatDate(g.date)}</Detail>
                <Detail label="Jatuh tempo kembali">
                  <DueDate date={g.expectedReturnDate} dueState={g.dueState} />
                </Detail>
                <Detail label="Akun sumber dana">
                  {g.account ? `${g.account.accountNumber} · ${g.account.name}` : '-'}
                </Detail>
                <Detail label="No. referensi">{g.referenceNo || '-'}</Detail>
                {g.notes && (
                  <div className="col-span-2">
                    <Detail label="Catatan">{g.notes}</Detail>
                  </div>
                )}
              </dl>

              <dl className="grid grid-cols-2 gap-2">
                <Figure label="Jumlah disetor" value={num(g.amount)} />
                <Figure label="Sisa di luar" value={g.outstanding} emphasis />
                <Figure label="Dikembalikan" value={g.totalReturned} />
                <Figure label="Hangus" value={g.totalForfeited} />
              </dl>

              <section aria-labelledby="pg-settlements">
                <h3 id="pg-settlements" className="text-sm font-semibold text-foreground">
                  Riwayat Settlement
                </h3>
                {settlements.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Belum ada settlement.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {settlements.map((s) => {
                      const ret = num(s.returnAmount);
                      const forfeit = num(s.forfeitAmount);
                      return (
                        <li key={s.id} className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
                          <div className="min-w-0 space-y-0.5 text-sm">
                            <p className="num text-muted-foreground">{formatDate(s.date)}</p>
                            {ret > 0 && (
                              <p className="text-foreground">
                                Kembali <span className="num font-medium">{formatRupiah(ret)}</span>
                                {s.returnAccount && <span className="text-muted-foreground"> → {s.returnAccount.name}</span>}
                              </p>
                            )}
                            {forfeit > 0 && (
                              <p className="text-foreground">
                                Hangus <span className="num font-medium text-danger-text">{formatRupiah(forfeit)}</span>
                                {s.forfeitAccount && <span className="text-muted-foreground"> → {s.forfeitAccount.name}</span>}
                              </p>
                            )}
                            {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
                          </div>
                          {onCancelSettlement && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="shrink-0 text-muted-foreground hover:text-danger-text"
                              aria-label={`Batalkan settlement ${formatDate(s.date)}`}
                              onClick={() => onCancelSettlement(s)}
                            >
                              <XCircle aria-hidden />
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </SheetBody>

            {(onSettle || onCancel) && (
              <SheetFooter>
                {onCancel && (
                  <Button variant="outline" className="text-danger-text" onClick={onCancel}>
                    <XCircle aria-hidden />
                    Batalkan setoran
                  </Button>
                )}
                {onSettle && (
                  <Button onClick={onSettle}>
                    <Undo2 aria-hidden />
                    Settlement
                  </Button>
                )}
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
