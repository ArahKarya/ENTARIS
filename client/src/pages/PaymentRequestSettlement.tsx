/**
 * Advance / travel settlement (/payment-requests/:id/settlement). Save writes the lines, uploads
 * picked receipts, then submits for "Ajukan". TRAVEL starts from the planned lines (editable).
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { DateInput, Field, LoadingState, PageHeader } from '@/components/shared';
import { apiError } from '@/components/fixed-assets/errors';
import { AttachmentPicker } from '@/components/payment-requests/AttachmentPicker';
import { LinesEditor } from '@/components/payment-requests/LinesEditor';
import { PlanVsActual } from '@/components/payment-requests/PlanVsActual';
import { TravelLinesEditor } from '@/components/payment-requests/TravelLinesEditor';
import { linesTotal, newLine, type DraftLine } from '@/components/payment-requests/lines';
import { PR_ENDPOINT, formatMoney, tripDays, type PaymentRequestDetail } from '@/components/payment-requests/payment-request';

const isoDay = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : '');

function initialLines(pr: PaymentRequestDetail): DraftLine[] {
  if (pr.settlementLines.length > 0) {
    return pr.settlementLines.map((l) =>
      newLine({
        description: l.description,
        amount: Number(l.amount),
        expenseDate: isoDay(l.expenseDate),
        expenseAccountId: l.expenseAccountId,
        category: l.category,
        plannedLineId: l.plannedLineId,
      }),
    );
  }
  if (pr.type.kind === 'TRAVEL') {
    // Start from the plan: the requester edits amounts to what was really spent.
    return pr.lines.map((l) =>
      newLine({
        description: l.description,
        amount: Number(l.amount),
        expenseDate: isoDay(l.expenseDate),
        expenseAccountId: l.expenseAccountId,
        category: l.category,
        quantity: l.quantity === null ? null : Number(l.quantity),
        unitAmount: l.unitAmount === null ? null : Number(l.unitAmount),
        plannedLineId: l.id,
      }),
    );
  }
  return [newLine()];
}

export const PaymentRequestSettlementPage = () => {
  const { id } = useParams<{ id: string }>();
  const detailQuery = useQuery({
    queryKey: ['payment-requests', 'detail', id],
    queryFn: async () => (await api.get<PaymentRequestDetail>(`${PR_ENDPOINT}/${id}`)).data,
    enabled: !!id,
  });
  if (detailQuery.isLoading || !detailQuery.data) return <LoadingState label="Memuat pengajuan…" />;
  return <SettlementBody key={id} pr={detailQuery.data} />;
};

function SettlementBody({ pr }: { pr: PaymentRequestDetail }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [lines, setLines] = useState<DraftLine[]>(() => initialLines(pr));
  const [note, setNote] = useState(pr.settlementNote ?? '');
  const [deadline, setDeadline] = useState(isoDay(pr.settlementDeadline));
  const [pending, setPending] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [linesError, setLinesError] = useState('');

  const isTravel = pr.type.kind === 'TRAVEL';
  const advance = toNumber(pr.totalAmount) ?? 0;
  const realized = linesTotal(lines);
  const diff = Math.round((realized - advance) * 100) / 100;
  const days = tripDays(pr.travelStartDate, pr.travelEndDate);
  const saved = pr.attachments.filter((a) => a.scope === 'SETTLEMENT');
  const detailUrl = `${PR_ENDPOINT}/${pr.id}`;

  const removeAttachment = useMutation({
    mutationFn: (attId: string) => api.delete(`${detailUrl}/attachments/${attId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-requests', 'detail', pr.id] }),
    onError: (e) => toast.error(apiError(e, 'Gagal menghapus lampiran.')),
  });

  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      await api.put(`${detailUrl}/settlement`, {
        note: note.trim() || null,
        deadline: deadline || null,
        lines: lines
          .filter((l) => l.description.trim() && l.amount)
          .map((l) => ({
            description: l.description.trim(),
            amount: l.amount as number,
            expenseDate: l.expenseDate || null,
            category: isTravel ? l.category ?? 'OTHER' : null,
            plannedLineId: l.plannedLineId,
            expenseAccountId: l.expenseAccountId,
          })),
      });
      if (pending.length) {
        const fd = new FormData();
        pending.forEach((f) => fd.append('files', f));
        await api.post(`${detailUrl}/attachments?scope=settlement`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setPending([]);
      }
      if (submit) await api.post(`${detailUrl}/settlement/submit`);
      return submit;
    },
    onSuccess: (submit) => {
      toast.success(submit ? 'Pertanggungjawaban diajukan.' : 'Draf pertanggungjawaban disimpan.');
      qc.invalidateQueries({ queryKey: ['payment-requests'] });
      navigate(detailUrl);
    },
    onError: (e) => {
      setError(apiError(e, 'Gagal menyimpan pertanggungjawaban.'));
      qc.invalidateQueries({ queryKey: ['payment-requests'] });
    },
  });

  const onSave = (submit: boolean) => {
    setError('');
    const filled = lines.filter((l) => l.description.trim() || l.amount);
    let message = '';
    if (filled.some((l) => !l.description.trim() || !l.amount || l.amount <= 0)) message = 'Setiap baris wajib berisi uraian dan nominal lebih dari 0.';
    else if (submit && filled.length === 0) message = 'Tambahkan minimal satu rincian realisasi.';
    setLinesError(message);
    if (message) return;
    save.mutate(submit);
  };

  if (!pr.actions.settlement.edit) {
    return (
      <div className="space-y-4">
        <PageHeader title="Pertanggungjawaban" description={pr.number} />
        <p className="text-sm text-muted-foreground">
          Pertanggungjawaban hanya bisa diisi oleh pengaju saat uang muka sudah dibayar dan belum diajukan (atau diminta revisi).
        </p>
        <Button variant="outline" onClick={() => navigate(detailUrl)}>Kembali ke detail</Button>
      </div>
    );
  }

  const diffMessage =
    diff === 0
      ? 'Realisasi sama dengan uang muka. Tidak ada pengembalian maupun kekurangan.'
      : diff < 0
        ? `Sisa uang muka ${formatMoney(-diff)} dikembalikan ke kas perusahaan (dicatat Keuangan saat memposting).`
        : `Kurang bayar ${formatMoney(diff)} dibayarkan perusahaan kepada Anda (dicatat Keuangan saat memposting).`;

  return (
    <form
      className="space-y-5 pb-24"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSave(true);
      }}
    >
      <PageHeader
        title={`Pertanggungjawaban ${pr.number}`}
        description={`${pr.type.name} · ${pr.purpose}${pr.travelDestination ? ` · ${pr.travelDestination}` : ''}`}
      />

      {pr.settlementStatus === 'REVISION' && pr.settlementLastNote && (
        <div role="status" className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            <span className="font-medium">Catatan revisi:</span> {pr.settlementLastNote}
          </p>
        </div>
      )}

      <section aria-label="Ringkasan" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Uang muka diterima</p>
          <p className="num mt-1 text-xl font-semibold text-foreground">{formatMoney(advance)}</p>
          <p className="text-xs text-muted-foreground">dibayar {pr.paymentDate ? formatDate(pr.paymentDate) : '-'}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total realisasi</p>
          <p className="num mt-1 text-xl font-semibold text-foreground" aria-live="polite">{formatMoney(realized)}</p>
        </div>
        <div className="col-span-2 rounded-lg border border-border bg-card p-4 lg:col-span-1">
          <p className="text-xs text-muted-foreground">{diff < 0 ? 'Sisa uang muka' : diff > 0 ? 'Kurang bayar' : 'Selisih'}</p>
          <p className={`num mt-1 text-xl font-semibold ${diff > 0 ? 'text-danger' : 'text-foreground'}`}>{formatMoney(Math.abs(diff))}</p>
        </div>
      </section>
      <p role="status" className="rounded-lg bg-info/10 px-3 py-2 text-sm text-foreground">{diffMessage}</p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Rincian realisasi</CardTitle>
              <CardDescription>
                {isTravel ? 'Dimulai dari rencana perjalanan. Ubah nominal sesuai biaya sebenarnya, tambah atau hapus baris.' : 'Catat pengeluaran yang benar-benar terjadi.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isTravel ? (
                <TravelLinesEditor lines={lines} onChange={setLines} error={linesError} days={days} amountLabel="Realisasi" />
              ) : (
                <LinesEditor lines={lines} onChange={setLines} error={linesError} />
              )}
            </CardContent>
          </Card>

          {isTravel && (
            <Card>
              <CardHeader>
                <CardTitle>Rencana vs realisasi</CardTitle>
              </CardHeader>
              <CardContent>
                <PlanVsActual planned={pr.lines.map((l) => ({ category: l.category, amount: Number(l.amount) }))} actual={lines} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Bukti / nota</CardTitle>
              <CardDescription>Lampirkan nota, kuitansi, atau bukti transfer pengembalian (JPG, PNG, WebP, PDF).</CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentPicker
                saved={saved}
                pending={pending}
                onPendingChange={setPending}
                onRemoveSaved={(attId) => removeAttachment.mutate(attId)}
                removingId={removeAttachment.isPending ? (removeAttachment.variables ?? null) : null}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Catatan</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Catatan untuk atasan & Keuangan" hint="Opsional.">
              <Textarea rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Field label="Batas waktu pertanggungjawaban" hint="Opsional. Pengingat dikirim bila terlewat.">
              {(control) => <DateInput id={control.id} value={deadline} min={isoDay(pr.paymentDate) || undefined} onChange={setDeadline} />}
            </Field>
          </CardContent>
        </Card>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="sticky bottom-0 z-10 -mx-3 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <p className="mr-auto text-sm text-muted-foreground">
          Realisasi <span className="num ml-1 font-semibold text-foreground">{formatMoney(realized)}</span>
        </p>
        <Button type="button" variant="outline" onClick={() => navigate(detailUrl)}>
          Batal
        </Button>
        <Button type="button" variant="secondary" onClick={() => onSave(false)} loading={save.isPending && save.variables === false}>
          <Save aria-hidden />
          Simpan Draf
        </Button>
        <Button type="submit" loading={save.isPending && save.variables === true}>
          <Send aria-hidden />
          Ajukan
        </Button>
      </div>
    </form>
  );
}
