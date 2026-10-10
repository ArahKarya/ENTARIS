/**
 * Detail Pengajuan Pembayaran (/payment-requests/:id): header + amounts,
 * payee & bank, lines (finance sets the expense account per line),
 * attachments, timeline, and a contextual action bar driven by the server's
 * `actions` flags (who may do what is decided server-side).
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, BookOpen, Check, ClipboardCheck, Pencil, RotateCcw, Save, Send, Undo2, X, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatDateTime, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog, EmptyState, Field, LoadingState, PageHeader, StatusBadge } from '@/components/shared';
import { AccountPicker, type AccountOption } from '@/components/fixed-assets/AccountPicker';
import { apiError } from '@/components/fixed-assets/errors';
import { AttachmentPicker } from '@/components/payment-requests/AttachmentPicker';
import { PayDialog } from '@/components/payment-requests/PayDialog';
import { SettlementCard } from '@/components/payment-requests/SettlementCard';
import { SettlementPostDialog } from '@/components/payment-requests/SettlementPostDialog';
import { TravelSummary } from '@/components/payment-requests/TravelSummary';
import { Timeline } from '@/components/payment-requests/Timeline';
import {
  KIND_LABEL,
  PR_ENDPOINT,
  formatMoney,
  STEP_LABEL,
  TRAVEL_CATEGORY_LABEL,
  isAdvanceKind,
  type PaymentRequestDetail,
} from '@/components/payment-requests/payment-request';

interface FlatAccount extends AccountOption {
  accountType?: string;
  isGroup?: boolean;
}

type Dialog =
  | 'approve'
  | 'reject'
  | 'return'
  | 'cancel'
  | 'cancelPayment'
  | 'submit'
  | 'settleApprove'
  | 'settleReturn'
  | 'settleCancelPosting'
  | null;

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-sm text-muted-foreground sm:w-36">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

export const PaymentRequestDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [paying, setPaying] = useState(false);
  const [posting, setPosting] = useState(false);
  const [approveNote, setApproveNote] = useState('');
  const [accountEdits, setAccountEdits] = useState<Record<string, string>>({});

  const detailQuery = useQuery({
    queryKey: ['payment-requests', 'detail', id],
    queryFn: async () => (await api.get<PaymentRequestDetail>(`${PR_ENDPOINT}/${id}`)).data,
  });
  const pr = detailQuery.data;
  const actions = pr?.actions;
  const financeMode = !!actions && (actions.verify || actions.pay || actions.settlement.post);

  const accountsQuery = useQuery({
    queryKey: ['all-accounts-flat'],
    queryFn: async () => {
      const res = await api.get<FlatAccount[] | { data: FlatAccount[] }>('/coa/flat');
      const all = Array.isArray(res.data) ? res.data : res.data.data;
      return all.filter((a) => !a.isGroup);
    },
    enabled: financeMode,
  });
  const systemQuery = useQuery({
    queryKey: ['system-accounts'],
    queryFn: async () => (await api.get<{ mappings: Record<string, Array<{ accountId: string; accountNumber: string; accountName: string }>> }>('/system-accounts')).data,
    enabled: financeMode,
  });
  const expenseAccounts = useMemo(() => (accountsQuery.data ?? []).filter((a) => a.accountType === 'EXPENSE'), [accountsQuery.data]);
  const cashAccounts = useMemo(() => {
    const mapped = new Set((systemQuery.data?.mappings.CASH ?? []).map((m) => m.accountId));
    return (accountsQuery.data ?? []).filter((a) => a.accountType === 'ASSET' && (mapped.has(a.id) || a.accountNumber.startsWith('1.1')));
  }, [accountsQuery.data, systemQuery.data]);
  const advance = systemQuery.data?.mappings.EMPLOYEE_ADVANCE?.[0];
  const advanceLabel = advance ? `${advance.accountNumber} · ${advance.accountName}` : 'Uang Muka Karyawan (akun sistem belum dipetakan)';

  const refresh = () => {
    setAccountEdits({});
    qc.invalidateQueries({ queryKey: ['payment-requests'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const lineAccounts = () =>
    Object.entries(accountEdits).map(([lineId, accountId]) => ({ id: lineId, expenseAccountId: accountId || null }));

  const act = useMutation({
    mutationFn: async ({ kind, reason }: { kind: Exclude<Dialog, null>; reason?: string }) => {
      const base = `${PR_ENDPOINT}/${id}`;
      if (kind === 'approve') return api.post(`${base}/approve`, { lineAccounts: lineAccounts(), note: approveNote.trim() || null });
      if (kind === 'settleApprove') return api.post(`${base}/settlement/approve`, { note: approveNote.trim() || null });
      if (kind === 'settleReturn') return api.post(`${base}/settlement/return`, { reason });
      if (kind === 'settleCancelPosting') return api.post(`${base}/settlement/cancel-posting`, { reason });
      if (kind === 'reject') return api.post(`${base}/reject`, { reason });
      if (kind === 'return') return api.post(`${base}/return`, { reason });
      if (kind === 'cancel') return api.post(`${base}/cancel`, { reason: reason || null });
      if (kind === 'submit') return api.post(`${base}/submit`);
      return api.post(`${base}/cancel-payment`, { reason });
    },
    onSuccess: (_res, { kind }) => {
      const msg: Record<string, string> = {
        approve: 'Pengajuan disetujui.',
        reject: 'Pengajuan ditolak.',
        return: 'Pengajuan dikembalikan untuk revisi.',
        cancel: 'Pengajuan dibatalkan.',
        submit: 'Pengajuan diajukan.',
        cancelPayment: 'Pembayaran dibatalkan; jurnal di-void.',
        settleApprove: 'Pertanggungjawaban disetujui; diteruskan ke Keuangan.',
        settleReturn: 'Pertanggungjawaban dikembalikan untuk revisi.',
        settleCancelPosting: 'Posting dibatalkan; jurnal pertanggungjawaban di-void.',
      };
      toast.success(msg[kind]);
      setApproveNote('');
      setDialog(null);
      refresh();
    },
    onError: (e) => {
      toast.error(apiError(e, 'Gagal memproses pengajuan.'));
    },
  });

  const saveAccounts = useMutation({
    mutationFn: () => api.put(`${PR_ENDPOINT}/${id}/accounts`, { lineAccounts: lineAccounts() }),
    onSuccess: () => {
      toast.success('Akun biaya disimpan.');
      refresh();
    },
    onError: (e) => toast.error(apiError(e, 'Gagal menyimpan akun biaya.')),
  });

  if (detailQuery.isLoading) return <LoadingState label="Memuat pengajuan…" />;
  if (!pr) {
    return (
      <EmptyState
        kind="error"
        title="Pengajuan tidak ditemukan"
        description="Pengajuan ini tidak ada atau Anda tidak memiliki akses."
        action={<Button onClick={() => navigate(PR_ENDPOINT)}>Kembali ke daftar</Button>}
      />
    );
  }

  const total = toNumber(pr.totalAmount) ?? 0;
  const advanceKind = isAdvanceKind(pr.type.kind);
  const accountsDirty = Object.keys(accountEdits).length > 0;
  const missingAccounts = !advanceKind && pr.lines.some((l) => !(accountEdits[l.id] ?? l.expenseAccountId));
  const sActions = actions?.settlement;
  const requestAttachments = pr.attachments.filter((a) => a.scope !== 'SETTLEMENT');
  const waitingFor =
    pr.status === 'SUBMITTED'
      ? `Menunggu persetujuan ${pr.supervisor?.fullName ?? 'atasan'}`
      : pr.status === 'PENDING_FINANCE'
        ? 'Menunggu verifikasi Keuangan'
        : pr.status === 'PENDING_DIRECTOR'
          ? `Menunggu persetujuan ${pr.directorRole ?? 'Direktur'} (melewati batas nilai)`
          : null;

  const busy = act.isPending;
  const actionButtons = (
    <>
      {actions?.edit && (
        <>
          <Button variant="outline" onClick={() => navigate(`${PR_ENDPOINT}/${pr.id}/edit`)}>
            <Pencil aria-hidden />
            Ubah
          </Button>
          <Button onClick={() => setDialog('submit')}>
            <Send aria-hidden />
            Ajukan
          </Button>
        </>
      )}
      {actions?.decide && (
        <>
          <Button variant="outline" onClick={() => setDialog('reject')} className="text-danger">
            <X aria-hidden />
            Tolak
          </Button>
          <Button variant="outline" onClick={() => setDialog('return')}>
            <Undo2 aria-hidden />
            Minta Revisi
          </Button>
          <Button onClick={() => setDialog('approve')}>
            <Check aria-hidden />
            Setujui
          </Button>
        </>
      )}
      {actions?.pay && (
        <Button onClick={() => setPaying(true)} disabled={missingAccounts || accountsDirty} title={missingAccounts ? 'Lengkapi akun biaya per baris dulu' : undefined}>
          <Banknote aria-hidden />
          Bayar
        </Button>
      )}
      {actions?.cancelPayment && (
        <Button variant="outline" onClick={() => setDialog('cancelPayment')}>
          <RotateCcw aria-hidden />
          Batalkan Pembayaran
        </Button>
      )}
      {sActions?.decide && (
        <>
          <Button variant="outline" onClick={() => setDialog('settleReturn')}>
            <Undo2 aria-hidden />
            Minta Revisi Pertanggungjawaban
          </Button>
          {sActions.post ? (
            <Button onClick={() => setPosting(true)}>
              <ClipboardCheck aria-hidden />
              Verifikasi & Posting
            </Button>
          ) : (
            <Button onClick={() => setDialog('settleApprove')}>
              <Check aria-hidden />
              Setujui Pertanggungjawaban
            </Button>
          )}
        </>
      )}
      {sActions?.cancelPosting && (
        <Button variant="outline" onClick={() => setDialog('settleCancelPosting')}>
          <RotateCcw aria-hidden />
          Batalkan Posting Pertanggungjawaban
        </Button>
      )}
      {actions?.cancel && (
        <Button variant="ghost" onClick={() => setDialog('cancel')} className="text-danger">
          <Ban aria-hidden />
          Batalkan Pengajuan
        </Button>
      )}
    </>
  );
  const hasActions =
    !!actions &&
    (actions.edit || actions.decide || actions.pay || actions.cancelPayment || actions.cancel || actions.settlement.decide || actions.settlement.cancelPosting);

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title={pr.number}
        description={pr.purpose}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <StatusBadge status={pr.status} docType="payment_request" />
          {pr.settlementStatus && <StatusBadge status={pr.settlementStatus} docType="payment_request_settlement" />}
          {waitingFor && <span className="text-muted-foreground">{waitingFor}</span>}
          {actions?.decide && actions.step && (
            <span className="font-medium text-foreground">Anda memproses tahap {STEP_LABEL[actions.step]}.</span>
          )}
        </div>
      </PageHeader>

      {pr.lastNote && ['REVISION', 'REJECTED', 'CANCELLED', 'APPROVED'].includes(pr.status) && (
        <p role="status" className="rounded-lg border border-border bg-muted/60 p-3 text-sm text-foreground">
          <span className="font-medium">Catatan terakhir:</span> {pr.lastNote}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <section aria-label="Ringkasan" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="num mt-1 text-xl font-semibold text-foreground">{formatMoney(total)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">Jenis</p>
              <p className="mt-1 font-medium text-foreground">{pr.type.name}</p>
              {KIND_LABEL[pr.type.kind] !== pr.type.name && <p className="text-xs text-muted-foreground">{KIND_LABEL[pr.type.kind]}</p>}
            </div>
            <div className="col-span-2 rounded-lg border border-border bg-card p-4 sm:col-span-1">
              <p className="text-xs text-muted-foreground">Dibutuhkan</p>
              <p className="mt-1 font-medium text-foreground">{pr.neededBy ? formatDate(pr.neededBy) : '—'}</p>
            </div>
          </section>

          <TravelSummary pr={pr} />

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>{pr.type.kind === 'TRAVEL' ? 'Rencana biaya' : 'Rincian biaya'}</CardTitle>
              {actions?.verify && accountsDirty && (
                <Button size="sm" variant="secondary" onClick={() => saveAccounts.mutate()} loading={saveAccounts.isPending}>
                  <Save aria-hidden />
                  Simpan akun
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {advanceKind && (
                <p className="mb-3 rounded-md bg-info/10 px-3 py-2 text-sm text-foreground">
                  Uang muka: saat dibayar dicatat ke <span className="font-medium">{advanceLabel.split(' (')[0]}</span>, lalu dipertanggungjawabkan.
                </p>
              )}
              <ul className="divide-y divide-border">
                {pr.lines.map((l, i) => (
                  <li key={l.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        <span className="num mr-2 text-muted-foreground">{i + 1}.</span>
                        {l.description}
                      </p>
                      {(l.category || (l.quantity !== null && l.unitAmount !== null)) && (
                        <p className="text-xs text-muted-foreground">
                          {l.category && TRAVEL_CATEGORY_LABEL[l.category]}
                          {l.quantity !== null && l.unitAmount !== null && (
                            <span className="num">
                              {l.category ? ' · ' : ''}
                              {formatMoney(l.unitAmount)} × {toNumber(l.quantity)}
                            </span>
                          )}
                        </p>
                      )}
                      {l.expenseDate && <p className="text-xs text-muted-foreground">Tanggal biaya {formatDate(l.expenseDate)}</p>}
                      {actions?.verify && !advanceKind ? (
                        <AccountPicker
                          label={`Akun biaya baris ${i + 1}`}
                          value={accountEdits[l.id] ?? l.expenseAccountId ?? ''}
                          onChange={(v) => setAccountEdits((e) => ({ ...e, [l.id]: v }))}
                          accounts={expenseAccounts}
                          loading={accountsQuery.isLoading}
                          className="max-w-md"
                        />
                      ) : (
                        !advanceKind && (
                          <p className="text-xs text-muted-foreground">
                            Akun: {l.expenseAccount ? `${l.expenseAccount.accountNumber} · ${l.expenseAccount.name}` : 'belum diisi Keuangan'}
                          </p>
                        )
                      )}
                    </div>
                    <p className="num text-right text-sm font-semibold text-foreground">{formatMoney(toNumber(l.amount) ?? 0)}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="num font-semibold text-foreground">{formatMoney(total)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lampiran ({requestAttachments.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {requestAttachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada lampiran.</p>
              ) : (
                <AttachmentPicker saved={requestAttachments} pending={[]} onPendingChange={() => undefined} readOnly />
              )}
            </CardContent>
          </Card>

          <SettlementCard pr={pr} onFill={() => navigate(`${PR_ENDPOINT}/${pr.id}/settlement`)} />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Pengaju & penerima</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2.5">
                <InfoRow label="Pengaju">{pr.requester.fullName}</InfoRow>
                <InfoRow label="Atasan">{pr.supervisor?.fullName ?? '—'}</InfoRow>
                {pr.department && <InfoRow label="Departemen">{pr.department}</InfoRow>}
                <InfoRow label="Diajukan">{pr.submittedAt ? formatDateTime(pr.submittedAt) : 'Belum diajukan'}</InfoRow>
                <InfoRow label="Penerima">
                  {pr.payeeName}
                  <span className="text-muted-foreground"> · {pr.payeeKind === 'VENDOR' ? 'Vendor' : 'Karyawan'}</span>
                </InfoRow>
                <InfoRow label="Rekening">
                  {pr.bankAccountNo ? (
                    <>
                      {pr.bankName} <span className="num">{pr.bankAccountNo}</span>
                      {pr.bankAccountHolder && <span className="block text-muted-foreground">a.n. {pr.bankAccountHolder}</span>}
                    </>
                  ) : (
                    '—'
                  )}
                </InfoRow>
              </dl>
            </CardContent>
          </Card>

          {pr.status === 'PAID' || pr.paidAt ? (
            <Card>
              <CardHeader>
                <CardTitle>Pembayaran</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2.5">
                  <InfoRow label="Tanggal bayar">{pr.paymentDate ? formatDate(pr.paymentDate) : '—'}</InfoRow>
                  <InfoRow label="Sumber dana">{pr.cashAccount ? `${pr.cashAccount.accountNumber} · ${pr.cashAccount.name}` : '—'}</InfoRow>
                  <InfoRow label="Referensi">{pr.paymentReference ?? '—'}</InfoRow>
                  <InfoRow label="Dibayar oleh">{pr.paidBy?.fullName ?? '—'}</InfoRow>
                  {pr.journalEntry && (
                    <InfoRow label="Jurnal">
                      {actions?.viewJournal ? (
                        <Link to={`/gl?q=${encodeURIComponent(pr.journalEntry.entryNumber)}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <BookOpen className="size-3.5" aria-hidden />
                          {pr.journalEntry.entryNumber}
                        </Link>
                      ) : (
                        pr.journalEntry.entryNumber
                      )}
                    </InfoRow>
                  )}
                </dl>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Riwayat</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline items={pr.history} />
            </CardContent>
          </Card>
        </div>
      </div>

      {hasActions && (
        <div className="sticky bottom-0 z-10 -mx-3 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
          {actionButtons}
        </div>
      )}

      <ConfirmDialog
        open={dialog === 'approve'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Setujui ${pr.number}?`}
        description={
          actions?.step === 'FINANCE'
            ? `Total ${formatMoney(total)}. Jika melewati batas nilai aturan persetujuan, pengajuan diteruskan ke Direktur; jika tidak, langsung siap dibayar.`
            : `Total ${formatMoney(total)} untuk ${pr.payeeName}.`
        }
        confirmLabel="Setujui"
        loading={busy}
        onConfirm={() => act.mutateAsync({ kind: 'approve' })}
      >
        <Field label={actions?.step === 'FINANCE' ? 'Catatan Keuangan' : 'Catatan'} hint="Opsional. Terlihat oleh pengaju dan di riwayat.">
          <Textarea rows={2} maxLength={1000} value={approveNote} onChange={(e) => setApproveNote(e.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'settleApprove'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Setujui pertanggungjawaban ${pr.number}?`}
        description="Pertanggungjawaban diteruskan ke Keuangan untuk diverifikasi dan diposting."
        confirmLabel="Setujui"
        loading={busy}
        onConfirm={() => act.mutateAsync({ kind: 'settleApprove' })}
      >
        <Field label="Catatan" hint="Opsional.">
          <Textarea rows={2} maxLength={1000} value={approveNote} onChange={(e) => setApproveNote(e.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'settleReturn'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Minta revisi pertanggungjawaban ${pr.number}?`}
        description="Dikembalikan ke pengaju untuk diperbaiki lalu diajukan ulang."
        confirmLabel="Kembalikan"
        requireReason={{ label: 'Yang perlu diperbaiki', minLength: 3 }}
        loading={busy}
        onConfirm={(reason) => act.mutateAsync({ kind: 'settleReturn', reason })}
      />
      <ConfirmDialog
        open={dialog === 'settleCancelPosting'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Batalkan posting pertanggungjawaban ${pr.number}?`}
        description="Jurnal pertanggungjawaban di-void; status kembali ke Verifikasi Keuangan dan uang muka kembali terbuka."
        tone="danger"
        confirmLabel="Batalkan Posting"
        requireReason={{ label: 'Alasan pembatalan', minLength: 3 }}
        loading={busy}
        onConfirm={(reason) => act.mutateAsync({ kind: 'settleCancelPosting', reason })}
      />
      <ConfirmDialog
        open={dialog === 'submit'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Ajukan ${pr.number}?`}
        description="Setelah diajukan, pengajuan tidak bisa diubah kecuali dikembalikan untuk revisi."
        confirmLabel="Ajukan"
        loading={busy}
        onConfirm={() => act.mutateAsync({ kind: 'submit' })}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Tolak ${pr.number}?`}
        description="Pengajuan yang ditolak tidak bisa diajukan ulang. Gunakan Minta Revisi bila pengaju cukup memperbaiki."
        tone="danger"
        confirmLabel="Tolak"
        requireReason={{ label: 'Alasan penolakan', minLength: 3 }}
        loading={busy}
        onConfirm={(reason) => act.mutateAsync({ kind: 'reject', reason })}
      />
      <ConfirmDialog
        open={dialog === 'return'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Minta revisi ${pr.number}?`}
        description="Pengajuan dikembalikan ke pengaju untuk diperbaiki lalu diajukan ulang."
        confirmLabel="Kembalikan"
        requireReason={{ label: 'Yang perlu diperbaiki', minLength: 3 }}
        loading={busy}
        onConfirm={(reason) => act.mutateAsync({ kind: 'return', reason })}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Batalkan ${pr.number}?`}
        description="Pengajuan yang dibatalkan tidak bisa diproses lagi."
        tone="danger"
        confirmLabel="Ya, Batalkan"
        loading={busy}
        onConfirm={() => act.mutateAsync({ kind: 'cancel' })}
      />
      <ConfirmDialog
        open={dialog === 'cancelPayment'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Batalkan pembayaran ${pr.number}?`}
        description="Jurnal pembayaran di-void dan pengajuan kembali ke Siap Dibayar."
        tone="danger"
        confirmLabel="Batalkan Pembayaran"
        requireReason={{ label: 'Alasan pembatalan', minLength: 3 }}
        loading={busy}
        onConfirm={(reason) => act.mutateAsync({ kind: 'cancelPayment', reason })}
      />
      {posting && (
        <SettlementPostDialog
          request={pr}
          expenseAccounts={expenseAccounts}
          cashAccounts={cashAccounts}
          onClose={() => setPosting(false)}
          onPosted={() => {
            setPosting(false);
            refresh();
          }}
        />
      )}
      {paying && (
        <PayDialog
          request={pr}
          cashAccounts={cashAccounts}
          advanceAccountLabel={advanceLabel}
          onClose={() => setPaying(false)}
          onPaid={() => {
            setPaying(false);
            refresh();
          }}
        />
      )}
    </div>
  );
};
