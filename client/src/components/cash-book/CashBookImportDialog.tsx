/**
 * "Buat dari Tempel/CSV": enter a cash book page by hand. Paste rows copied from Excel
 * (tab separated) or choose a CSV file with the columns tanggal, keterangan, masuk, keluar.
 * Creates a draft (source = manual); nothing is posted. Excel files: copy the cells and
 * paste, or save the sheet as CSV.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateInput, Field } from '@/components/shared';
import { ComboField } from '@/components/fixed-assets/ComboField';
import { MoneyInput } from '@/components/payment-requests/MoneyInput';
import { OverlayBody, OverlayFooter, OverlayHeader, ScrollRegion } from '@/components/sales/dialog-parts-b';
import { dialogShellClass } from '@/components/sales/dialog-classes-b';
import { CB_ENDPOINT, CB_ROW_LIMIT, errorLines, type AccountsResponse, type DraftDetail } from './cash-book';
import { hasBlockingProblems, parseCashBookText, toCreateRows } from './cash-book-parse';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (draftId: string) => void;
}

const today = () => new Date().toLocaleDateString('en-CA');
const PREVIEW_LIMIT = 8;
const MAX_FILE_BYTES = 512 * 1024;

/** The form mounts only while the dialog is open, so every opening starts from a clean state. */
export function CashBookImportDialog({ open, onOpenChange, onCreated }: Props) {
  return <Dialog open={open} onOpenChange={onOpenChange}>{open && <ImportForm onOpenChange={onOpenChange} onCreated={onCreated} />}</Dialog>;
}

function ImportForm({ onOpenChange, onCreated }: Omit<Props, 'open'>) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [entryDate, setEntryDate] = useState(today);
  const [pickedCash, setPickedCash] = useState('');
  const [opening, setOpening] = useState<number | null>(null);
  const [closing, setClosing] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const accountsQuery = useQuery({
    queryKey: ['cash-book-drafts', 'accounts'],
    queryFn: async () => (await api.get<AccountsResponse>(`${CB_ENDPOINT}/accounts`)).data,
    staleTime: 60_000,
  });
  const cashOptions = useMemo(
    () => (accountsQuery.data?.cashAccounts ?? []).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [accountsQuery.data],
  );

  const cashAccountId = pickedCash || cashOptions[0]?.value || '';

  const parsed = useMemo(() => parseCashBookText(text), [text]);
  const blocked = hasBlockingProblems(parsed);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post<DraftDetail>(CB_ENDPOINT, {
          title: title.trim() || undefined,
          entryDate,
          cashAccountId,
          openingBalance: opening,
          closingBalance: closing,
          rows: toCreateRows(parsed.rows),
        })
      ).data,
    onSuccess: (draft) => {
      toast.success(`Draft ${draft.draftNumber} dibuat (${draft.rows.length} baris). Tinjau sebelum posting.`);
      void qc.invalidateQueries({ queryKey: ['cash-book-drafts'] });
      onOpenChange(false);
      onCreated(draft.id);
    },
    onError: (err) => setErrors(errorLines(err, 'Gagal membuat draft buku kas.')),
  });

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setErrors(['Berkas terlalu besar (maksimal 512 KB). Pecah menjadi beberapa berkas.']);
      return;
    }
    if (/\.xlsx?$/i.test(file.name)) {
      setErrors(['Berkas Excel belum dibaca langsung. Salin sel dari Excel lalu tempel di kotak, atau simpan sebagai CSV.']);
      return;
    }
    setErrors([]);
    setText(await file.text());
  };

  const canSubmit = !blocked && !!cashAccountId && !!entryDate && !create.isPending;

  return (
    <>
      <DialogContent size="lg" className={dialogShellClass} aria-describedby="cb-import-desc">
        <OverlayHeader>
          <DialogTitle>Buat Draft dari Tempel / CSV</DialogTitle>
          <DialogDescription id="cb-import-desc">
            Kolom: tanggal, keterangan, masuk, keluar (maksimal {CB_ROW_LIMIT} baris). Draft belum menjadi jurnal; Anda meninjau akun tiap baris di langkah berikutnya.
          </DialogDescription>
        </OverlayHeader>
        <OverlayBody className="grid-cols-[minmax(0,1fr)]">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            <ComboField
              label="Akun kas / bank"
              required
              value={cashAccountId}
              onChange={setPickedCash}
              options={cashOptions}
              loading={accountsQuery.isLoading}
              placeholder="Pilih akun kas…"
              searchPlaceholder="Cari akun kas…"
            />
            <Field label="Tanggal halaman" required hint="Dipakai untuk baris tanpa tanggal.">
              {(c) => <DateInput id={c.id} required={c.required} value={entryDate} onChange={setEntryDate} />}
            </Field>
            <Field label="Judul (opsional)">
              <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Buku kas Oktober minggu 1" />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <Field label="Saldo awal">{(c) => <MoneyInput id={c.id} value={opening} onChange={setOpening} />}</Field>
              <Field label="Saldo akhir">{(c) => <MoneyInput id={c.id} value={closing} onChange={setClosing} />}</Field>
            </div>
          </div>

          <Field
            label="Tempel baris atau isi CSV"
            hint="Dari Excel: blok sel (dengan baris judul Tanggal, Keterangan, Masuk, Keluar), salin, lalu tempel di sini."
          >
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              spellCheck={false}
              className="field-sizing-fixed font-mono text-xs"
              placeholder={'Tanggal\tKeterangan\tMasuk\tKeluar\n05/10/2026\tBeli ATK\t\t125.000'}
            />
          </Field>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              className="sr-only"
              aria-label="Pilih berkas CSV"
              onChange={(e) => {
                void readFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp aria-hidden />
              Pilih berkas CSV
            </Button>
          </div>

          {text.trim() !== '' && (
            <section aria-label="Pratinjau baris" className="space-y-2">
              <p role="status" className="text-sm text-muted-foreground">
                {parsed.rows.length} baris terbaca
                {parsed.rows.filter((r) => r.error).length > 0 && (
                  <span className="font-medium text-danger-text"> · {parsed.rows.filter((r) => r.error).length} baris bermasalah</span>
                )}
                .
              </p>
              {parsed.problems.map((p) => (
                <p key={p} role="alert" className="text-sm font-medium text-danger-text">{p}</p>
              ))}
              {parsed.rows.length > 0 && (
                <ScrollRegion label="Pratinjau baris tempel" className="border border-border">
                  <table className="w-full min-w-[34rem] text-sm">
                    <caption className="sr-only">Pratinjau {Math.min(parsed.rows.length, PREVIEW_LIMIT)} baris pertama</caption>
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="px-3 py-2 text-left font-medium">Baris</th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">Tanggal</th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">Keterangan</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Masuk</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Keluar</th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[...parsed.rows.filter((r) => r.error), ...parsed.rows.filter((r) => !r.error)].slice(0, PREVIEW_LIMIT).map((r) => (
                        <tr key={r.line}>
                          <td className="num px-3 py-1.5 text-muted-foreground">{r.line}</td>
                          <td className="num px-3 py-1.5">{r.date || '-'}</td>
                          <td className="max-w-64 truncate px-3 py-1.5" title={r.description}>{r.description || '-'}</td>
                          <td className="num px-3 py-1.5 text-right">{r.masuk || '-'}</td>
                          <td className="num px-3 py-1.5 text-right">{r.keluar || '-'}</td>
                          <td className="px-3 py-1.5 font-medium text-danger-text">{r.error ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollRegion>
              )}
            </section>
          )}

          {errors.length > 0 && (
            <ul role="alert" className="space-y-1 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
              {errors.slice(0, 8).map((e) => (
                <li key={e}>{e}</li>
              ))}
              {errors.length > 8 && <li>… dan {errors.length - 8} kesalahan lain.</li>}
            </ul>
          )}
        </OverlayBody>
        <OverlayFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" onClick={() => create.mutate()} loading={create.isPending} disabled={!canSubmit}>
            Buat Draft{parsed.rows.length > 0 && !blocked ? ` (${parsed.rows.length} baris)` : ''}
          </Button>
        </OverlayFooter>
      </DialogContent>
    </>
  );
}
