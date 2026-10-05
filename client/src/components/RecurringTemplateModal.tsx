import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput, Field } from '@/components/shared';
import { PinnedBody, PinnedFooter, PinnedHeader, pinnedDialogClass } from '@/components/overlays/dialog-parts';

interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

interface RecurringTemplate {
  id: string;
  name: string;
  templateType: string;
  frequency: string;
  dayOfMonth?: number | null;
  nextRunDate: string;
  lastRunDate?: string | null;
  isActive: boolean;
  templateData: any;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editTemplate?: RecurringTemplate | null;
}

const defaultLine = (): JournalLine => ({ accountId: '', debit: 0, credit: 0, description: '' });

const RecurringTemplateModal = ({ isOpen, onClose, editTemplate }: Props) => {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [templateType, setTemplateType] = useState('journal');
  const [frequency, setFrequency] = useState('monthly');
  const [dayOfMonth, setDayOfMonth] = useState<number | ''>('');
  const [nextRunDate, setNextRunDate] = useState('');
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([defaultLine(), defaultLine()]);
  const [showErrors, setShowErrors] = useState(false);

  // Fetch accounts for journal type
  const { data: accountsData } = useQuery({
    queryKey: ['coa-all'],
    queryFn: async () => {
      const res = await api.get('/coa', { params: { limit: 200 } });
      return res.data.data ?? res.data;
    },
    enabled: isOpen && templateType === 'journal',
  });

  const accounts = (accountsData || []).filter((a: any) => !a.isGroup && a.isActive);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) setShowErrors(false);
    if (isOpen && editTemplate) {
      setName(editTemplate.name);
      setTemplateType(editTemplate.templateType);
      setFrequency(editTemplate.frequency);
      setDayOfMonth(editTemplate.dayOfMonth || '');
      setNextRunDate(editTemplate.nextRunDate ? editTemplate.nextRunDate.substring(0, 10) : '');
      const td = editTemplate.templateData as any;
      setNarration(td?.narration || '');
      setLines(td?.items?.length > 0 ? td.items : [defaultLine(), defaultLine()]);
    } else if (isOpen) {
      setName('');
      setTemplateType('journal');
      setFrequency('monthly');
      setDayOfMonth('');
      setNextRunDate('');
      setNarration('');
      setLines([defaultLine(), defaultLine()]);
    }
  }, [isOpen, editTemplate]);

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      editTemplate ? api.put(`/recurring/${editTemplate.id}`, data) : api.post('/recurring', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      toast.success(editTemplate ? 'Template diperbarui.' : 'Template berhasil dibuat.');
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal menyimpan template.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);

    if (!name.trim()) { toast.error('Nama template wajib diisi.'); return; }
    if (!nextRunDate) { toast.error('Tanggal berikutnya wajib diisi.'); return; }

    let templateData: any = {};

    if (templateType === 'journal') {
      if (!narration.trim()) { toast.error('Keterangan jurnal wajib diisi.'); return; }
      const validLines = lines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
      if (validLines.length < 2) { toast.error('Minimal 2 baris jurnal.'); return; }

      const totalDebit = validLines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = validLines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        toast.error('Debit dan Kredit harus seimbang.');
        return;
      }

      templateData = { narration, items: validLines };
    }

    createMutation.mutate({
      name: name.trim(),
      templateType,
      frequency,
      dayOfMonth: dayOfMonth || null,
      nextRunDate,
      templateData,
    });
  };

  const updateLine = (index: number, field: keyof JournalLine, value: any) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addLine = () => setLines((prev) => [...prev, defaultLine()]);
  const removeLine = (index: number) => setLines((prev) => prev.filter((_, i) => i !== index));

  const pending = createMutation.isPending;
  const monthly = frequency === 'monthly' || frequency === 'quarterly';
  const req = (ok: boolean) => (showErrors && !ok ? 'Wajib diisi.' : undefined);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent size="lg" className={pinnedDialogClass}>
        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <PinnedHeader>
            <DialogTitle>{editTemplate ? 'Edit Template Berulang' : 'Buat Template Berulang'}</DialogTitle>
            <DialogDescription>Transaksi yang dibuat otomatis sesuai jadwal.</DialogDescription>
          </PinnedHeader>

          <PinnedBody className="space-y-4">
            <Field label="Nama Template" required error={req(!!name.trim())}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="contoh: Beban Sewa Bulanan" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipe Transaksi" required>
                {(control) => (
                  <Select value={templateType} onValueChange={setTemplateType}>
                    <SelectTrigger {...control}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="journal">Jurnal Umum</SelectItem>
                      <SelectItem value="sales_invoice">Invoice Penjualan</SelectItem>
                      <SelectItem value="purchase_invoice">Invoice Pembelian</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field label="Frekuensi" required>
                {(control) => (
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger {...control}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Harian</SelectItem>
                      <SelectItem value="weekly">Mingguan</SelectItem>
                      <SelectItem value="monthly">Bulanan</SelectItem>
                      <SelectItem value="quarterly">Triwulan</SelectItem>
                      <SelectItem value="yearly">Tahunan</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {monthly && (
                <Field label="Tanggal dalam Bulan">
                  <NumberInput
                    min={1}
                    max={31}
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value ? Number(e.target.value) : '')}
                    placeholder="1-31"
                    className="h-10"
                  />
                </Field>
              )}
              <Field
                label="Jadwal Berikutnya"
                required
                error={req(!!nextRunDate)}
                className={monthly ? undefined : 'sm:col-span-2'}
              >
                <DateInput value={nextRunDate} onChange={setNextRunDate} />
              </Field>
            </div>

            {templateType === 'journal' && (
              <section aria-labelledby="rt-journal" className="space-y-3 border-t border-border pt-4">
                <h3 id="rt-journal" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Data Jurnal
                </h3>

                <Field label="Keterangan" required error={req(!!narration.trim())}>
                  <Input
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    placeholder="contoh: Beban sewa gedung bulan ..."
                  />
                </Field>

                <ul className="space-y-3">
                  {lines.map((line, idx) => (
                    <li
                      key={idx}
                      className="grid grid-cols-2 items-center gap-2 rounded-lg border border-border p-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto] sm:border-0 sm:p-0"
                    >
                      <div className="col-span-2 sm:col-span-1">
                        <Select
                          value={line.accountId || '__none'}
                          onValueChange={(v) => updateLine(idx, 'accountId', v === '__none' ? '' : v)}
                        >
                          <SelectTrigger aria-label={`Akun baris ${idx + 1}`}>
                            <SelectValue placeholder="Pilih akun…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Pilih Akun…</SelectItem>
                            {accounts.map((acc: any) => (
                              <SelectItem key={acc.id} value={acc.id}>
                                {acc.accountNumber} - {acc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <NumberInput
                        min={0}
                        value={line.debit || ''}
                        onChange={(e) => updateLine(idx, 'debit', parseFloat(e.target.value) || 0)}
                        className="h-10 text-right tabular-nums md:h-9"
                        placeholder="Debit"
                        aria-label={`Debit baris ${idx + 1}`}
                      />
                      <NumberInput
                        min={0}
                        value={line.credit || ''}
                        onChange={(e) => updateLine(idx, 'credit', parseFloat(e.target.value) || 0)}
                        className="h-10 text-right tabular-nums md:h-9"
                        placeholder="Kredit"
                        aria-label={`Kredit baris ${idx + 1}`}
                      />
                      <div className="col-span-2 flex justify-end sm:col-span-1 sm:w-9">
                        {lines.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-touch"
                            className="text-danger-text md:size-9"
                            onClick={() => removeLine(idx)}
                            aria-label={`Hapus baris ${idx + 1}`}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <Button type="button" variant="ghost" size="sm" onClick={addLine}>
                  <Plus aria-hidden /> Tambah Baris
                </Button>
              </section>
            )}

            {templateType !== 'journal' && (
              <p role="note" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                Untuk tipe invoice penjualan/pembelian, eksekusi otomatis akan segera didukung. Saat ini Anda dapat
                menggunakan tipe Jurnal Umum untuk transaksi berulang.
              </p>
            )}
          </PinnedBody>

          <PinnedFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" loading={pending}>
              {pending ? 'Menyimpan…' : editTemplate ? 'Simpan Perubahan' : 'Buat Template'}
            </Button>
          </PinnedFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RecurringTemplateModal;
