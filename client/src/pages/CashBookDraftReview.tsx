/**
 * Tinjau Draft Buku Kas (/cash-book-drafts/:id) — a person checks what AIRA (or a paste/CSV)
 * proposed: cash account, page date, opening/closing balance with a live balance check, then
 * each row's type and counter-account. Saving only edits the draft; "Posting semua" creates one
 * balanced journal per row (server rules, see utils/cashBookRules.ts). Read-only once posted.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ListChecks, Save, SendHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { can } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ComboboxFilter, ConfirmDialog, DateInput, EmptyState, Field, LoadingState, PageHeader, StatCard, StatusBadge, type ComboboxOption } from '@/components/shared';
import { ComboField } from '@/components/fixed-assets/ComboField';
import { MoneyInput } from '@/components/payment-requests/MoneyInput';
import { ReviewTable } from '@/components/cash-book/ReviewTable';
import { SourceChip } from '@/components/cash-book/SourceChip';
import {
  CB_ENDPOINT,
  errorLines,
  isEditableStatus,
  isRowLocked,
  liveBalance,
  liveTotals,
  mergeEdit,
  pendingRows,
  toPatches,
  withEdit,
  type AccountsResponse,
  type DraftDetail,
  type RowEdit,
  type RowEdits,
} from '@/components/cash-book/cash-book';

interface HeaderEdit {
  title?: string;
  entryDate?: string;
  cashAccountId?: string;
  openingBalance?: number | null;
  closingBalance?: number | null;
}

interface PostResponse {
  status: 'Posted' | 'PartiallyPosted';
  postedCount: number;
  totalAmount: number;
  failed: Array<{ idx: number; error: string }>;
  learned: number;
}

const rupiah = (n: number) => formatRupiah(n);
const rupiahCompact = (n: number) => formatRupiah(n, { compact: true });

export const CashBookDraftReview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canEdit = can('journal', 'edit');

  const [edits, setEdits] = useState<RowEdits>({});
  const [header, setHeader] = useState<HeaderEdit>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [onlyReview, setOnlyReview] = useState(false);
  const [bulkAccount, setBulkAccount] = useState('');
  const [dialog, setDialog] = useState<'post' | 'discard' | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [offerPartial, setOfferPartial] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['cash-book-drafts', 'detail', id],
    queryFn: async () => (await api.get<DraftDetail>(`${CB_ENDPOINT}/${id}`)).data,
  });
  const accountsQuery = useQuery({
    queryKey: ['cash-book-drafts', 'accounts'],
    queryFn: async () => (await api.get<AccountsResponse>(`${CB_ENDPOINT}/accounts`)).data,
    staleTime: 60_000,
  });
  const draft = detailQuery.data;
  const accounts = accountsQuery.data;
  const editable = canEdit && !!draft && isEditableStatus(draft.status);

  const accountOptions = useMemo<ComboboxOption[]>(
    () => (accounts?.accounts ?? []).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
    [accounts],
  );
  const cashOptions = useMemo(
    () => (accounts?.cashAccounts ?? []).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
    [accounts],
  );
  const labelOf = useCallback(
    (accId: string) => accountOptions.find((o) => o.value === accId)?.label.replace(' · ', ' ') ?? null,
    [accountOptions],
  );
  const advanceId = accounts?.rules.advanceAccountId ?? null;

  const rows = useMemo(
    () => (draft?.rows ?? []).map((r) => withEdit(r, edits[r.id], advanceId, labelOf)),
    [draft, edits, advanceId, labelOf],
  );
  const visible = useMemo(() => (onlyReview ? rows.filter((r) => r.needsReview && !r.skip && !isRowLocked(r)) : rows), [rows, onlyReview]);
  const totals = useMemo(() => liveTotals(rows), [rows]);
  const opening = header.openingBalance !== undefined ? header.openingBalance : draft?.openingBalance ?? null;
  const closing = header.closingBalance !== undefined ? header.closingBalance : draft?.closingBalance ?? null;
  const balance = useMemo(() => liveBalance(opening, closing, totals), [opening, closing, totals]);
  const reviewCount = useMemo(() => pendingRows(rows).filter((r) => r.needsReview).length, [rows]);
  const duplicateCount = useMemo(() => pendingRows(rows).filter((r) => r.isDuplicate).length, [rows]);
  const toPost = useMemo(() => pendingRows(rows), [rows]);
  const postTotals = useMemo(() => liveTotals(toPost), [toPost]);

  const dirty = Object.keys(edits).length > 0 || Object.keys(header).length > 0;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const onEdit = useCallback((rowId: string, change: RowEdit) => setEdits((prev) => mergeEdit(prev, rowId, change)), []);
  const onSelect = useCallback((rowId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  }, []);
  const selectableIds = useMemo(() => visible.filter((r) => !isRowLocked(r)).map((r) => r.id), [visible]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((rid) => selected.has(rid));
  const onSelectAll = (checked: boolean) => setSelected(checked ? new Set(selectableIds) : new Set());

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['cash-book-drafts'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (Object.keys(header).length > 0) await api.put(`${CB_ENDPOINT}/${id}`, header);
      const patches = toPatches(edits);
      if (patches.length > 0) await api.put(`${CB_ENDPOINT}/${id}/rows`, { rows: patches });
    },
    onSuccess: async () => {
      await refresh();
      setEdits({});
      setHeader({});
      setProblems([]);
      toast.success('Perubahan draft disimpan.');
    },
    onError: (err) => setProblems(errorLines(err, 'Gagal menyimpan perubahan.')),
  });

  const post = useMutation({
    mutationFn: async (partial: boolean) => (await api.post<PostResponse>(`${CB_ENDPOINT}/${id}/post`, { partial })).data,
    onSuccess: async (res) => {
      await refresh();
      void qc.invalidateQueries({ queryKey: ['journals'] });
      void qc.invalidateQueries({ queryKey: ['coa'] });
      void qc.invalidateQueries({ queryKey: ['payments'] });
      setProblems(res.failed.map((f) => `Baris ${f.idx}: ${f.error}`));
      setOfferPartial(false);
      if (res.status === 'Posted') toast.success(`${res.postedCount} jurnal dibuat (${rupiah(res.totalAmount)}).`);
      else toast.warning(`${res.postedCount} jurnal dibuat; ${res.failed.length} baris belum diposting.`);
    },
    onError: (err) => {
      setProblems(errorLines(err, 'Gagal memposting draft.'));
      setOfferPartial(true);
      throw err;
    },
  });

  const discard = useMutation({
    mutationFn: async () => api.post(`${CB_ENDPOINT}/${id}/discard`),
    onSuccess: async () => {
      await refresh();
      toast.success('Draft dibuang.');
      navigate(CB_ENDPOINT);
    },
    onError: (err) => {
      toast.error(errorLines(err, 'Gagal membuang draft.')[0]);
      throw err;
    },
  });

  const applyBulk = () => {
    if (!bulkAccount) return;
    for (const rowId of selected) {
      const r = rows.find((x) => x.id === rowId);
      if (r && !isRowLocked(r)) setEdits((prev) => mergeEdit(prev, rowId, { accountId: bulkAccount }));
    }
    toast.success(`Akun diterapkan ke ${selected.size} baris. Simpan perubahan untuk menyimpan.`);
    setSelected(new Set());
  };

  if (detailQuery.isLoading) return <LoadingState label="Memuat draf buku kas…" />;
  if (detailQuery.isError || !draft) {
    return (
      <div className="space-y-5 pb-8">
        <PageHeader title="Draft Buku Kas" />
        <EmptyState
          kind="error"
          title="Draft tidak ditemukan"
          description="Draft mungkin sudah dibuang atau tautannya salah."
          action={<Button size="sm" onClick={() => navigate(CB_ENDPOINT)}>Kembali ke daftar</Button>}
        />
      </div>
    );
  }

  const postWarnings: string[] = [];
  if (reviewCount > 0) postWarnings.push(`${formatNumber(reviewCount)} baris masih ditandai Ragu / perlu ditinjau.`);
  if (duplicateCount > 0) postWarnings.push(`${formatNumber(duplicateCount)} baris ditandai kemungkinan duplikat.`);
  if (balance.checked && !balance.ok) postWarnings.push(`Saldo akhir tidak cocok (selisih ${rupiah(balance.difference ?? 0)}).`);
  const cashLabel = draft.cashAccount ? `${draft.cashAccount.accountNumber} ${draft.cashAccount.name}` : '—';

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Draft ${draft.draftNumber}`}
        description={`${draft.title} · halaman ${formatDate(draft.entryDate)} · kas ${cashLabel}`}
        actions={
          <Button variant="outline" onClick={() => navigate(CB_ENDPOINT)}>
            Kembali ke daftar
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={draft.status} docType="cash_book_draft" />
          <SourceChip source={draft.source} />
          {draft.createdBy && <span className="text-xs text-muted-foreground">dibuat {draft.createdBy.fullName}{draft.createdVia === 'mcp' ? ' via AIRA' : ''}</span>}
        </div>
      </PageHeader>

      {draft.source === 'aira' && editable && (
        <p className="rounded-md bg-info-subtle px-3 py-2 text-sm text-info-text">
          Baris dibaca AIRA{draft.sourceNote ? ` (${draft.sourceNote})` : ''}. Periksa baris bertanda <strong>Ragu</strong>; posting baru membuat jurnal.
        </p>
      )}
      {!editable && draft.status !== 'Discarded' && (
        <p className="rounded-md bg-success-subtle px-3 py-2 text-sm text-success-text" role="status">
          Draft sudah diposting{draft.postedAt ? ` pada ${formatDate(draft.postedAt)}` : ''}; tampilan hanya-baca. Nomor jurnal ada di tiap baris.
        </p>
      )}
      {draft.lastError && editable && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">{draft.lastError}</p>
      )}

      <section aria-label="Data halaman buku kas" className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Judul" className="sm:col-span-2 lg:col-span-1">
          <Input
            value={header.title ?? draft.title}
            disabled={!editable}
            maxLength={200}
            onChange={(e) => setHeader((h) => ({ ...h, title: e.target.value }))}
          />
        </Field>
        <ComboField
          label="Akun kas / bank"
          value={header.cashAccountId ?? draft.cashAccountId}
          onChange={(v) => v && setHeader((h) => ({ ...h, cashAccountId: v }))}
          options={cashOptions}
          placeholder="Pilih akun kas…"
          searchPlaceholder="Cari akun kas…"
          hint={draft.status === 'PartiallyPosted' ? 'Tidak bisa diganti setelah ada baris diposting.' : undefined}
        />
        <Field label="Tanggal halaman" hint="Untuk baris tanpa tanggal sendiri.">
          {(c) => (
            <DateInput
              id={c.id}
              value={header.entryDate ?? draft.entryDate}
              disabled={!editable}
              onChange={(v) => v && setHeader((h) => ({ ...h, entryDate: v }))}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Saldo awal">
            {(c) => <MoneyInput id={c.id} value={opening} disabled={!editable} onChange={(v) => setHeader((h) => ({ ...h, openingBalance: v }))} />}
          </Field>
          <Field label="Saldo akhir">
            {(c) => <MoneyInput id={c.id} value={closing} disabled={!editable} onChange={(v) => setHeader((h) => ({ ...h, closingBalance: v }))} />}
          </Field>
        </div>
        <p
          role="status"
          className={`sm:col-span-2 lg:col-span-4 flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
            !balance.checked ? 'bg-muted text-muted-foreground' : balance.ok ? 'bg-success-subtle text-success-text' : 'bg-warning-subtle text-warning-text'
          }`}
        >
          {!balance.checked ? (
            <span>Isi saldo awal dan saldo akhir halaman untuk memeriksa kecocokan.</span>
          ) : balance.ok ? (
            <>
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Saldo cocok: saldo awal + masuk − keluar = {rupiah(balance.expectedClosing ?? 0)}.</span>
            </>
          ) : (
            <>
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <strong>Saldo akhir tidak cocok.</strong> Seharusnya {rupiah(balance.expectedClosing ?? 0)}, tertulis {rupiah(closing ?? 0)} (selisih {rupiah(balance.difference ?? 0)}).
                Periksa baris yang terlewat atau salah baca. Ini peringatan, bukan penghalang posting.
              </span>
            </>
          )}
        </p>
      </section>

      <section aria-label="Ringkasan draft" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Masuk" icon={ArrowDownToLine} value={rupiahCompact(totals.masuk)} valueTitle={rupiah(totals.masuk)} hint="baris tidak dilewati" />
        <StatCard label="Total Keluar" icon={ArrowUpFromLine} value={rupiahCompact(totals.keluar)} valueTitle={rupiah(totals.keluar)} hint="baris tidak dilewati" />
        <StatCard label="Jumlah Baris" icon={ListChecks} value={formatNumber(totals.rowCount)} hint={`${formatNumber(totals.activeCount)} akan diposting`} />
        <StatCard label="Perlu Ditinjau" icon={AlertTriangle} value={formatNumber(reviewCount)} hint={duplicateCount > 0 ? `${formatNumber(duplicateCount)} duplikat?` : 'baris Ragu'} />
      </section>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Switch id="cb-only-review" checked={onlyReview} onCheckedChange={setOnlyReview} />
          <label htmlFor="cb-only-review">Hanya yang perlu ditinjau</label>
        </div>
        {editable && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Aksi massal">
            <span className="text-sm text-muted-foreground" role="status">{formatNumber(selected.size)} baris dipilih</span>
            <div className="w-64">
              <ComboboxFilter
                label="Akun untuk baris terpilih"
                value={bulkAccount}
                onChange={setBulkAccount}
                options={accountOptions}
                allLabel="Pilih akun massal…"
                searchPlaceholder="Cari nomor atau nama akun…"
              />
            </div>
            <Button size="sm" variant="secondary" disabled={!bulkAccount} onClick={applyBulk}>Terapkan akun</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Batal pilih</Button>
          </div>
        )}
      </div>

      {problems.length > 0 && (
        <div role="alert" className="space-y-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          <ul className="space-y-1">
            {problems.slice(0, 10).map((p) => <li key={p}>{p}</li>)}
            {problems.length > 10 && <li>… dan {problems.length - 10} lainnya.</li>}
          </ul>
          {offerPartial && editable && !dirty && (
            <Button size="sm" variant="outline" loading={post.isPending} onClick={() => post.mutate(true)}>
              Posting baris yang valid saja
            </Button>
          )}
        </div>
      )}

      <ReviewTable
        rows={visible}
        editable={editable}
        options={accountOptions}
        selected={selected}
        allSelected={allSelected}
        onSelect={onSelect}
        onSelectAll={onSelectAll}
        onEdit={onEdit}
      />

      {editable && (
        <div className="sticky bottom-0 z-20 -mx-3 border-t border-border bg-card/95 px-3 py-3 shadow-[var(--shadow-2)] backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="w-full text-sm text-muted-foreground sm:mr-auto sm:w-auto" role="status">
              {dirty ? 'Ada perubahan yang belum disimpan.' : `${formatNumber(toPost.length)} baris siap diposting.`}
            </p>
            <Button variant="danger" className="px-3 sm:px-4" onClick={() => setDialog('discard')} disabled={draft.status !== 'Draft'}>
              <Trash2 aria-hidden />
              Buang<span className="hidden sm:inline">&nbsp;draft</span>
            </Button>
            <Button variant="outline" className="px-3 sm:px-4" onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
              <Save aria-hidden />
              Simpan<span className="hidden sm:inline">&nbsp;perubahan</span>
            </Button>
            <Button className="px-3 sm:px-4" onClick={() => setDialog('post')} disabled={dirty || toPost.length === 0} title={dirty ? 'Simpan perubahan dulu' : undefined}>
              <SendHorizontal aria-hidden />
              Posting semua
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={dialog === 'post'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Posting ${formatNumber(toPost.length)} baris?`}
        confirmLabel="Posting"
        loading={post.isPending}
        onConfirm={() => post.mutateAsync(false)}
        description={`Akan dibuat ${formatNumber(toPost.length)} jurnal seimbang (satu per baris) di ${cashLabel}: masuk ${rupiah(postTotals.masuk)}, keluar ${rupiah(postTotals.keluar)}. Jurnal tidak dapat dihapus; koreksi lewat pembatalan di Jurnal Umum.`}
      >
        {postWarnings.length > 0 && (
          <ul className="space-y-1 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning-text" aria-label="Peringatan sebelum posting">
            {postWarnings.map((w) => (
              <li key={w} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'discard'}
        onOpenChange={(o) => !o && setDialog(null)}
        tone="danger"
        title="Buang draft ini?"
        description={`Draft ${draft.draftNumber} (${formatNumber(draft.rows.length)} baris) dibuang dan tidak dapat diposting. Belum ada jurnal yang terdampak.`}
        confirmLabel="Buang draft"
        loading={discard.isPending}
        onConfirm={() => discard.mutateAsync()}
      />
    </div>
  );
};
