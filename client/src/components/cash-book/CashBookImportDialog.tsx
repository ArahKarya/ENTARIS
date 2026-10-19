/**
 * "Buat dari Tempel/CSV": enter a cash book page by hand. Paste rows copied from Excel
 * (tab separated) or choose a CSV file with the columns tanggal, keterangan, masuk, keluar.
 * Creates a draft (source = manual); nothing is posted. Excel files: copy the cells and
 * paste, or save the sheet as CSV.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('finance');
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
    () => (accountsQuery.data?.cashAccounts ?? []).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
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
      toast.success(t('cashBookImportDialog.created', { number: draft.draftNumber, count: draft.rows.length }));
      void qc.invalidateQueries({ queryKey: ['cash-book-drafts'] });
      onOpenChange(false);
      onCreated(draft.id);
    },
    onError: (err) => setErrors(errorLines(err, t('cashBookImportDialog.createFailed'))),
  });

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setErrors([t('cashBookImportDialog.fileTooLarge')]);
      return;
    }
    if (/\.xlsx?$/i.test(file.name)) {
      setErrors([t('cashBookImportDialog.excelNotSupported')]);
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
          <DialogTitle>{t('cashBookImportDialog.title')}</DialogTitle>
          <DialogDescription id="cb-import-desc">
            {t('cashBookImportDialog.description', { max: CB_ROW_LIMIT })}
          </DialogDescription>
        </OverlayHeader>
        <OverlayBody className="grid-cols-[minmax(0,1fr)]">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            <ComboField
              label={t('cashBookImportDialog.cashAccount')}
              required
              value={cashAccountId}
              onChange={setPickedCash}
              options={cashOptions}
              loading={accountsQuery.isLoading}
              placeholder={t('cashBookImportDialog.cashPlaceholder')}
              searchPlaceholder={t('cashBookImportDialog.cashSearch')}
            />
            <Field label={t('cashBookImportDialog.pageDate')} required hint={t('cashBookImportDialog.pageDateHint')}>
              {(c) => <DateInput id={c.id} required={c.required} value={entryDate} onChange={setEntryDate} />}
            </Field>
            <Field label={t('cashBookImportDialog.titleField')}>
              <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t('cashBookImportDialog.titlePlaceholder')} />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <Field label={t('cashBookImportDialog.opening')}>{(c) => <MoneyInput id={c.id} value={opening} onChange={setOpening} />}</Field>
              <Field label={t('cashBookImportDialog.closing')}>{(c) => <MoneyInput id={c.id} value={closing} onChange={setClosing} />}</Field>
            </div>
          </div>

          <Field
            label={t('cashBookImportDialog.paste')}
            hint={t('cashBookImportDialog.pasteHint')}
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
              aria-label={t('cashBookImportDialog.chooseFile')}
              onChange={(e) => {
                void readFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp aria-hidden />
              {t('cashBookImportDialog.chooseFile')}
            </Button>
          </div>

          {text.trim() !== '' && (
            <section aria-label={t('cashBookImportDialog.preview')} className="space-y-2">
              <p role="status" className="text-sm text-muted-foreground">
                {t('cashBookImportDialog.rowsRead', { count: parsed.rows.length })}
                {parsed.rows.filter((r) => r.error).length > 0 && (
                  <span className="font-medium text-danger-text">
                    {' · '}
                    {t('cashBookImportDialog.rowsWithErrors', { count: parsed.rows.filter((r) => r.error).length })}
                  </span>
                )}
                .
              </p>
              {parsed.problems.map((p) => (
                <p key={p} role="alert" className="text-sm font-medium text-danger-text">{p}</p>
              ))}
              {parsed.rows.length > 0 && (
                <ScrollRegion label={t('cashBookImportDialog.previewTable')} className="border border-border">
                  <table className="w-full min-w-[34rem] text-sm">
                    <caption className="sr-only">{t('cashBookImportDialog.previewCaption', { count: Math.min(parsed.rows.length, PREVIEW_LIMIT) })}</caption>
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="px-3 py-2 text-left font-medium">{t('cashBookImportDialog.columns.line')}</th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">{t('cashBookImportDialog.columns.date')}</th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">{t('cashBookImportDialog.columns.description')}</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">{t('cashBookImportDialog.columns.in')}</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">{t('cashBookImportDialog.columns.out')}</th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">{t('cashBookImportDialog.columns.note')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[...parsed.rows.filter((r) => r.error), ...parsed.rows.filter((r) => !r.error)].slice(0, PREVIEW_LIMIT).map((r) => (
                        <tr key={r.line}>
                          <td className="num px-3 py-1.5 text-muted-foreground">{r.line}</td>
                          <td className="num px-3 py-1.5">{r.date || '—'}</td>
                          <td className="max-w-64 truncate px-3 py-1.5" title={r.description}>{r.description || '—'}</td>
                          <td className="num px-3 py-1.5 text-right">{r.masuk || '—'}</td>
                          <td className="num px-3 py-1.5 text-right">{r.keluar || '—'}</td>
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
              {errors.length > 8 && <li>{t('cashBookImportDialog.moreErrors', { count: errors.length - 8 })}</li>}
            </ul>
          )}
        </OverlayBody>
        <OverlayFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cashBookImportDialog.cancel')}
          </Button>
          <Button type="button" onClick={() => create.mutate()} loading={create.isPending} disabled={!canSubmit}>
            {parsed.rows.length > 0 && !blocked ? t('cashBookImportDialog.submitCount', { count: parsed.rows.length }) : t('cashBookImportDialog.submit')}
          </Button>
        </OverlayFooter>
      </DialogContent>
    </>
  );
}
