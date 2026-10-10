/**
 * Buat / ubah Pengajuan Pembayaran (/payment-requests/new, /payment-requests/:id/edit).
 * Save = create or update the draft, upload picked files, then (for "Ajukan")
 * submit. Editable only by the requester while DRAFT or REVISION (server-enforced).
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, Paperclip, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput, Field, LoadingState, PageHeader } from '@/components/shared';
import { ComboField } from '@/components/fixed-assets/ComboField';
import { apiError } from '@/components/fixed-assets/errors';
import { AttachmentPicker } from '@/components/payment-requests/AttachmentPicker';
import { LinesEditor } from '@/components/payment-requests/LinesEditor';
import { TravelLinesEditor } from '@/components/payment-requests/TravelLinesEditor';
import { TravelSection } from '@/components/payment-requests/TravelSection';
import { EMPTY_TRAVEL, validateTravelValue, type TravelErrors, type TravelValue } from '@/components/payment-requests/travel';
import { linesTotal, newLine, type DraftLine } from '@/components/payment-requests/lines';
import { useSelectedPartyOption } from '@/hooks/useSelectedPartyOption';
import {
  KIND_LABEL,
  PR_ENDPOINT,
  formatMoney,
  isAdvanceKind,
  tripDays,
  type PaymentRequestDetail,
  type PaymentRequestMeta,
  type PaymentRequestType,
} from '@/components/payment-requests/payment-request';

type PayeeKind = 'EMPLOYEE' | 'VENDOR';

interface FormState {
  typeId: string;
  payeeKind: PayeeKind;
  partyId: string;
  payeeName: string;
  bankName: string;
  bankAccountNo: string;
  bankAccountHolder: string;
  department: string;
  purpose: string;
  neededBy: string;
}

const EMPTY: FormState = {
  typeId: '',
  payeeKind: 'EMPLOYEE',
  partyId: '',
  payeeName: '',
  bankName: '',
  bankAccountNo: '',
  bankAccountHolder: '',
  department: '',
  purpose: '',
  neededBy: '',
};

const isoDay = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : '');

type Errors = Partial<Record<keyof FormState | 'lines' | 'attachments', string>>;

function initialForm(detail: PaymentRequestDetail | undefined, meta: PaymentRequestMeta | undefined): FormState {
  if (detail) {
    return {
      typeId: detail.type.id,
      payeeKind: detail.payeeKind,
      partyId: detail.party?.id ?? '',
      payeeName: detail.payeeName,
      bankName: detail.bankName ?? '',
      bankAccountNo: detail.bankAccountNo ?? '',
      bankAccountHolder: detail.bankAccountHolder ?? '',
      department: detail.department ?? '',
      purpose: detail.purpose,
      neededBy: isoDay(detail.neededBy),
    };
  }
  // New request: the requester by default, with the bank details they used last time.
  return {
    ...EMPTY,
    payeeName: meta?.me?.fullName ?? '',
    bankName: meta?.lastPayee?.bankName ?? '',
    bankAccountNo: meta?.lastPayee?.bankAccountNo ?? '',
    bankAccountHolder: meta?.lastPayee?.bankAccountHolder ?? meta?.me?.fullName ?? '',
    department: meta?.lastPayee?.department ?? '',
  };
}

function initialLines(detail: PaymentRequestDetail | undefined): DraftLine[] {
  if (!detail?.lines.length) return [newLine()];
  return detail.lines.map((l) =>
    newLine({
      description: l.description,
      amount: Number(l.amount),
      expenseDate: isoDay(l.expenseDate),
      expenseAccountId: l.expenseAccountId,
      category: l.category,
      quantity: l.quantity === null ? null : Number(l.quantity),
      unitAmount: l.unitAmount === null ? null : Number(l.unitAmount),
    }),
  );
}

function initialTravel(detail: PaymentRequestDetail | undefined): TravelValue {
  if (!detail) return EMPTY_TRAVEL;
  return {
    destination: detail.travelDestination ?? '',
    startDate: isoDay(detail.travelStartDate),
    endDate: isoDay(detail.travelEndDate),
    participants: detail.travelParticipants ?? '',
  };
}

const metaQueryOptions = {
  queryKey: ['payment-requests', 'meta'],
  queryFn: async () => (await api.get<PaymentRequestMeta>(`${PR_ENDPOINT}/meta`)).data,
};
const detailQueryOptions = (id: string | undefined) => ({
  queryKey: ['payment-requests', 'detail', id],
  queryFn: async () => (await api.get<PaymentRequestDetail>(`${PR_ENDPOINT}/${id}`)).data,
  enabled: !!id,
});

/** Loads the request (edit) / user context (new), then mounts the form with its initial state. */
export const PaymentRequestForm = () => {
  const { id } = useParams<{ id: string }>();
  const metaQuery = useQuery(metaQueryOptions);
  const detailQuery = useQuery(detailQueryOptions(id));
  if ((id && detailQuery.isLoading) || metaQuery.isLoading) return <LoadingState label="Memuat formulir…" />;
  return <PaymentRequestFormBody key={id ?? 'new'} id={id} initialDetail={detailQuery.data} initialMeta={metaQuery.data} />;
};

function PaymentRequestFormBody({
  id,
  initialDetail,
  initialMeta,
}: {
  id: string | undefined;
  initialDetail: PaymentRequestDetail | undefined;
  initialMeta: PaymentRequestMeta | undefined;
}) {
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialForm(initialDetail, initialMeta));
  const [lines, setLines] = useState<DraftLine[]>(() => initialLines(initialDetail));
  const [travel, setTravel] = useState<TravelValue>(() => initialTravel(initialDetail));
  const [travelErrors, setTravelErrors] = useState<TravelErrors>({});
  const [pending, setPending] = useState<File[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState('');
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const metaQuery = useQuery(metaQueryOptions);
  const typesQuery = useQuery({
    queryKey: ['payment-request-types', 'active'],
    queryFn: async () => (await api.get<PaymentRequestType[]>('/payment-request-types')).data,
  });
  const detailQuery = useQuery(detailQueryOptions(id));
  const vendorsQuery = useQuery({
    queryKey: ['parties', 'payment-request-vendors'],
    queryFn: async () => {
      const res = await api.get('/parties', { params: { sort: 'name', limit: 500 } });
      return (res.data.data ?? res.data) as Array<{ id: string; name: string }>;
    },
    enabled: form.payeeKind === 'VENDOR',
    staleTime: 5 * 60_000,
  });


  const types = typesQuery.data ?? [];
  const selectedType = types.find((t) => t.id === form.typeId) ?? (detailQuery.data?.type.id === form.typeId ? detailQuery.data?.type : undefined);
  const isTravel = selectedType?.kind === 'TRAVEL';
  const days = tripDays(travel.startDate, travel.endDate);
  const savedAttachments = (detailQuery.data?.attachments ?? []).filter((a) => a.scope !== 'SETTLEMENT');
  const vendorOptions = useSelectedPartyOption(
    useMemo(() => (vendorsQuery.data ?? []).map((v) => ({ value: v.id, label: v.name })), [vendorsQuery.data]),
    form.payeeKind === 'VENDOR' ? form.partyId : null,
    detailQuery.data?.party,
  );

  const removeAttachment = useMutation({
    mutationFn: (attId: string) => api.delete(`${PR_ENDPOINT}/${id}/attachments/${attId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-requests', 'detail', id] }),
    onError: (e) => toast.error(apiError(e, 'Gagal menghapus lampiran.')),
  });

  const validate = (forSubmit: boolean): Errors => {
    const e: Errors = {};
    if (!form.typeId) e.typeId = 'Pilih jenis pengajuan.';
    if (form.purpose.trim().length < 3) e.purpose = 'Jelaskan keperluan (minimal 3 karakter).';
    if (!form.payeeName.trim()) e.payeeName = 'Nama penerima wajib diisi.';
    if (form.payeeKind === 'VENDOR' && !form.partyId) e.partyId = 'Pilih vendor.';
    const filled = lines.filter((l) => l.description.trim() || l.amount);
    if (filled.some((l) => !l.description.trim() || !l.amount || l.amount <= 0)) e.lines = 'Setiap baris wajib berisi uraian dan nominal lebih dari 0.';
    else if (forSubmit && filled.length === 0) e.lines = 'Tambahkan minimal satu rincian biaya.';
    if (isTravel) setTravelErrors(validateTravelValue(travel, forSubmit));
    if (forSubmit && selectedType?.requiresAttachment && savedAttachments.length + pending.length === 0) {
      e.attachments = 'Jenis pengajuan ini wajib melampirkan bukti.';
    }
    return e;
  };
  const travelInvalid = () => isTravel && Object.keys(validateTravelValue(travel, false)).length > 0;

  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      const payload = {
        typeId: form.typeId,
        payeeKind: form.payeeKind,
        partyId: form.payeeKind === 'VENDOR' ? form.partyId : null,
        payeeName: form.payeeName.trim(),
        bankName: form.bankName.trim() || null,
        bankAccountNo: form.bankAccountNo.trim() || null,
        bankAccountHolder: form.bankAccountHolder.trim() || null,
        department: form.department.trim() || null,
        purpose: form.purpose.trim(),
        neededBy: form.neededBy || null,
        ...(isTravel
          ? {
              travelDestination: travel.destination.trim() || null,
              travelStartDate: travel.startDate || null,
              travelEndDate: travel.endDate || null,
              travelParticipants: travel.participants.trim() || null,
            }
          : {}),
        lines: lines
          .filter((l) => l.description.trim() && l.amount)
          .map((l) => ({
            description: l.description.trim(),
            amount: l.amount as number,
            expenseDate: l.expenseDate || null,
            expenseAccountId: l.expenseAccountId,
            ...(isTravel
              ? {
                  category: l.category ?? 'OTHER',
                  quantity: l.quantity && l.unitAmount ? l.quantity : null,
                  unitAmount: l.quantity && l.unitAmount ? l.unitAmount : null,
                }
              : {}),
          })),
      };
      const res = isEdit ? await api.put(`${PR_ENDPOINT}/${id}`, payload) : await api.post(PR_ENDPOINT, payload);
      const requestId: string = res.data.id;
      if (pending.length) {
        const fd = new FormData();
        pending.forEach((f) => fd.append('files', f));
        await api.post(`${PR_ENDPOINT}/${requestId}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setPending([]);
      }
      if (submit) await api.post(`${PR_ENDPOINT}/${requestId}/submit`);
      return { requestId, submit };
    },
    onSuccess: ({ requestId, submit }) => {
      toast.success(submit ? 'Pengajuan berhasil diajukan.' : 'Draf pengajuan disimpan.');
      qc.invalidateQueries({ queryKey: ['payment-requests'] });
      navigate(`${PR_ENDPOINT}/${requestId}`);
    },
    onError: (e) => {
      setServerError(apiError(e, 'Gagal menyimpan pengajuan.'));
      qc.invalidateQueries({ queryKey: ['payment-requests'] });
    },
  });

  const onSave = (submit: boolean) => {
    setServerError('');
    const e = validate(submit);
    setErrors(e);
    const tErrors = isTravel ? validateTravelValue(travel, submit) : {};
    if (Object.keys(e).length || Object.keys(tErrors).length || (!submit && travelInvalid())) return;
    save.mutate(submit);
  };

  if (isEdit && detailQuery.data && !detailQuery.data.actions.edit) {
    return (
      <div className="space-y-4">
        <PageHeader title="Ubah Pengajuan" description={detailQuery.data.number} />
        <p className="text-sm text-muted-foreground">Pengajuan ini tidak bisa diubah lagi (hanya saat Draf atau Perlu Revisi).</p>
        <Button variant="outline" onClick={() => navigate(`${PR_ENDPOINT}/${id}`)}>Kembali ke detail</Button>
      </div>
    );
  }

  const title = isEdit ? `Ubah ${detailQuery.data?.number ?? 'Pengajuan'}` : 'Buat Pengajuan';
  const supervisor = metaQuery.data?.me?.supervisor;

  return (
    <form
      className="space-y-5 pb-24"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(true);
      }}
      noValidate
    >
      <PageHeader
        title={title}
        description={
          supervisor?.isActive
            ? `Setelah diajukan, pengajuan menunggu persetujuan atasan Anda (${supervisor.fullName}), lalu Keuangan.`
            : 'Setelah diajukan, pengajuan langsung diverifikasi Keuangan (atasan langsung belum diatur).'
        }
      />

      {!isEdit && (metaQuery.data?.openAdvances.overdueCount ?? 0) > 0 && (
        <div role="status" className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            Anda masih punya <span className="font-medium">{metaQuery.data?.openAdvances.overdueCount} uang muka</span> yang belum
            dipertanggungjawabkan lebih dari {metaQuery.data?.overdueDays} hari ({formatMoney(metaQuery.data?.openAdvances.overdueAmount ?? 0)}).
            Pengajuan baru tetap bisa dibuat, tetapi mohon segera selesaikan pertanggungjawaban.
          </p>
        </div>
      )}

      {detailQuery.data?.status === 'REVISION' && detailQuery.data.lastNote && (
        <div role="status" className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            <span className="font-medium">Catatan revisi:</span> {detailQuery.data.lastNote}
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Informasi pengajuan</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Jenis pengajuan" required error={errors.typeId} className="sm:col-span-2">
                {(control) => (
                  <Select value={form.typeId} onValueChange={(v) => set('typeId', v)}>
                    <SelectTrigger {...control}>
                      <SelectValue placeholder="Pilih jenis…" />
                    </SelectTrigger>
                    <SelectContent>
                      {types.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              {selectedType && (
                <div className="space-y-1 rounded-lg bg-muted/60 p-3 text-sm sm:col-span-2">
                  <p className="font-medium text-foreground">
                    {selectedType.name}
                    {KIND_LABEL[selectedType.kind] !== selectedType.name && (
                      <span className="font-normal text-muted-foreground"> · {KIND_LABEL[selectedType.kind]}</span>
                    )}
                  </p>
                  {selectedType.description && <p className="text-muted-foreground">{selectedType.description}</p>}
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <li className="inline-flex items-center gap-1">
                      <Paperclip className="size-3.5" aria-hidden />
                      {selectedType.requiresAttachment ? 'Wajib lampiran' : 'Lampiran opsional'}
                    </li>
                    {(selectedType.requiresSettlement || isAdvanceKind(selectedType.kind)) && <li>Wajib dipertanggungjawabkan setelah dipakai</li>}
                  </ul>
                </div>
              )}
              <Field label={isTravel ? 'Keperluan perjalanan' : 'Keperluan'} required error={errors.purpose} className="sm:col-span-2">
                <Textarea
                  rows={3}
                  maxLength={1000}
                  placeholder="Tujuan dan tanggal kegiatan"
                  value={form.purpose}
                  onChange={(e) => set('purpose', e.target.value)}
                />
              </Field>
              <Field label="Dibutuhkan tanggal" hint="Opsional: kapan dana dibutuhkan.">
                {(control) => <DateInput id={control.id} value={form.neededBy} onChange={(v) => set('neededBy', v)} />}
              </Field>
              <Field label="Departemen / bagian" hint="Opsional.">
                <Input maxLength={100} value={form.department} onChange={(e) => set('department', e.target.value)} />
              </Field>
            </CardContent>
          </Card>

          {isTravel && <TravelSection value={travel} onChange={setTravel} errors={travelErrors} />}

          <Card>
            <CardHeader>
              <CardTitle>{isTravel ? 'Rencana biaya perjalanan' : 'Rincian biaya'}</CardTitle>
              <CardDescription>
                {isTravel
                  ? 'Perkiraan biaya per kategori, dipakai sebagai pembanding saat pertanggungjawaban. Akun biaya dipilih Keuangan.'
                  : 'Akun biaya dipilih oleh Keuangan saat verifikasi.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isTravel ? (
                <TravelLinesEditor lines={lines} onChange={setLines} error={errors.lines} days={days} />
              ) : (
                <LinesEditor lines={lines} onChange={setLines} error={errors.lines} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lampiran</CardTitle>
              <CardDescription>Nota, kuitansi, invoice vendor, atau dokumen pendukung lain.</CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentPicker
                saved={savedAttachments}
                pending={pending}
                onPendingChange={setPending}
                onRemoveSaved={isEdit ? (attId) => removeAttachment.mutate(attId) : undefined}
                removingId={removeAttachment.isPending ? (removeAttachment.variables ?? null) : null}
                required={selectedType?.requiresAttachment}
                error={errors.attachments}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Penerima pembayaran</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Dibayarkan ke" required>
              {(control) => (
                <Select
                  value={form.payeeKind}
                  onValueChange={(v) => {
                    const kind = v as PayeeKind;
                    setForm((f) => ({
                      ...f,
                      payeeKind: kind,
                      partyId: '',
                      payeeName: kind === 'EMPLOYEE' ? metaQuery.data?.me?.fullName ?? f.payeeName : '',
                    }));
                  }}
                >
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE">Karyawan (saya)</SelectItem>
                    <SelectItem value="VENDOR">Vendor / pemasok</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>
            {form.payeeKind === 'VENDOR' && (
              <ComboField
                label="Vendor"
                required
                value={form.partyId}
                onChange={(v) => {
                  const name = vendorOptions.find((o) => o.value === v)?.label ?? '';
                  setForm((f) => ({ ...f, partyId: v, payeeName: name || f.payeeName }));
                }}
                options={vendorOptions}
                loading={vendorsQuery.isLoading}
                placeholder="Pilih vendor…"
                searchPlaceholder="Cari vendor…"
                error={errors.partyId}
              />
            )}
            <Field label="Nama penerima" required error={errors.payeeName}>
              <Input maxLength={200} value={form.payeeName} onChange={(e) => set('payeeName', e.target.value)} />
            </Field>
            <Field label="Bank">
              <Input maxLength={100} placeholder="mis. BCA" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} />
            </Field>
            <Field label="Nomor rekening">
              <Input maxLength={50} inputMode="numeric" className="num" value={form.bankAccountNo} onChange={(e) => set('bankAccountNo', e.target.value)} />
            </Field>
            <Field label="Atas nama rekening">
              <Input maxLength={200} value={form.bankAccountHolder} onChange={(e) => set('bankAccountHolder', e.target.value)} />
            </Field>
          </CardContent>
        </Card>
      </div>

      {serverError && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {serverError}
        </p>
      )}

      <div className="sticky bottom-0 z-10 -mx-3 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <p className="mr-auto text-sm text-muted-foreground">
          Total <span className="num ml-1 font-semibold text-foreground">{formatMoney(linesTotal(lines))}</span>
        </p>
        <Button type="button" variant="outline" onClick={() => navigate(isEdit ? `${PR_ENDPOINT}/${id}` : PR_ENDPOINT)}>
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
