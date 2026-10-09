import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { RupiahField } from './purchase-cash/RupiahField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput, Field } from '@/components/shared';
import { FormError, PinnedBody, PinnedFooter, PinnedHeader, pinnedDialogClass } from '@/components/overlays/dialog-parts';

interface Account {
  id: string;
  accountNumber: string;
  name: string;
  isGroup: boolean;
}

interface JournalItem {
  id: string;
  accountId: string;
  partyId: string | null;
  debit: number;
  credit: number;
  description: string;
}

const JournalEntryModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [narration, setNarration] = useState('');
  const [items, setItems] = useState<JournalItem[]>([
    { id: crypto.randomUUID(), accountId: '', partyId: null, debit: 0, credit: 0, description: '' },
    { id: crypto.randomUUID(), accountId: '', partyId: null, debit: 0, credit: 0, description: '' }
  ]);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const { data: accounts } = useQuery({
    queryKey: ['accounts-list'],
    queryFn: async () => {
      const response = await api.get('/coa');
      return response.data;
    },
    select: (data) => {
      const flatten = (accs: any[]): any[] =>
        accs.reduce((acc: any[], curr: any) => {
          if (!curr.isGroup) acc.push(curr);
          if (curr.children) acc.push(...flatten(curr.children));
          return acc;
        }, []);
      return flatten(data);
    }
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/journals', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      setDate(new Date().toISOString().split('T')[0]);
      setNarration('');
      setItems([
        { id: crypto.randomUUID(), accountId: '', partyId: null, debit: 0, credit: 0, description: '' },
        { id: crypto.randomUUID(), accountId: '', partyId: null, debit: 0, credit: 0, description: '' },
      ]);
      setError('');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan jurnal.')
  });

  const totalDebit = items.reduce((sum, item) => sum + (Number(item.debit) || 0), 0);
  const totalCredit = items.reduce((sum, item) => sum + (Number(item.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const addItem = () => setItems([...items, { id: crypto.randomUUID(), accountId: '', partyId: null, debit: 0, credit: 0, description: '' }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));
  const updateItem = (index: number, field: keyof JournalItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const pending = mutation.isPending;
  const canPost = isBalanced && !!narration;
  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground';
  const moneyInput =
    'h-9 w-full rounded-md border border-input bg-card px-2 text-right font-mono text-base tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent size="doc" className={pinnedDialogClass}>
        <PinnedHeader>
          <DialogTitle>Buat Jurnal Baru</DialogTitle>
          <DialogDescription>Catat transaksi keuangan secara manual.</DialogDescription>
        </PinnedHeader>

        <PinnedBody className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Tanggal">
              <DateInput value={date} onChange={setDate} />
            </Field>
            <Field label="Keterangan / Narasi" required className="md:col-span-2">
              <Input
                placeholder="Keterangan transaksi"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
              />
            </Field>
          </div>

          <section aria-labelledby="journal-lines-heading">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="journal-lines-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rincian Akun
              </h3>
              <Button type="button" variant="ghost" size="sm" onClick={addItem}>
                <Plus aria-hidden /> Tambah Baris
              </Button>
            </div>

            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable at phone width */}
            <div className="overflow-x-auto rounded-lg border border-border" role="region" aria-label="Rincian akun jurnal" tabIndex={0}>
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th scope="col" className={`${th} min-w-[220px] text-left`}>Akun</th>
                    <th scope="col" className={`${th} min-w-[140px] text-left`}>Keterangan</th>
                    <th scope="col" className={`${th} w-36 text-right`}>Debit</th>
                    <th scope="col" className={`${th} w-36 text-right`}>Kredit</th>
                    <th scope="col" className="w-12"><span className="sr-only">Aksi</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        <Select
                          value={item.accountId || '__none'}
                          onValueChange={(v) => updateItem(index, 'accountId', v === '__none' ? '' : v)}
                        >
                          <SelectTrigger aria-label={`Akun baris ${index + 1}`}>
                            <SelectValue placeholder="Pilih akun…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Pilih Akun…</SelectItem>
                            {accounts?.map((acc: Account) => (
                              <SelectItem key={acc.id} value={acc.id}>
                                {acc.accountNumber} - {acc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(index, 'description', e.target.value)}
                          placeholder={narration || 'Keterangan…'}
                          aria-label={`Keterangan baris ${index + 1}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <RupiahField
                          value={item.debit}
                          onChange={(v) => updateItem(index, 'debit', v)}
                          className={moneyInput}
                          aria-label={`Debit baris ${index + 1}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <RupiahField
                          value={item.credit}
                          onChange={(v) => updateItem(index, 'credit', v)}
                          className={moneyInput}
                          aria-label={`Kredit baris ${index + 1}`}
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-touch"
                          className="text-muted-foreground hover:text-danger-text md:size-9"
                          onClick={() => removeItem(index)}
                          aria-label={`Hapus baris ${index + 1}`}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-col justify-between gap-3 rounded-lg border border-border bg-muted/50 p-3 sm:flex-row sm:items-center">
              <div role="status">
                <p className="mb-0.5 text-xs font-medium text-muted-foreground">Status</p>
                {isBalanced ? (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-success-text">
                    <CheckCircle2 className="size-4" aria-hidden /> Jurnal Seimbang
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-danger-text">
                    <AlertCircle className="size-4" aria-hidden /> Selisih: {formatRupiah(Math.abs(totalDebit - totalCredit))}
                  </span>
                )}
              </div>
              <div className="flex gap-6">
                <div className="text-right">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Debit</p>
                  <p className="font-mono text-sm font-semibold tabular-nums text-foreground">{formatRupiah(totalDebit)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Kredit</p>
                  <p className="font-mono text-sm font-semibold tabular-nums text-foreground">{formatRupiah(totalCredit)}</p>
                </div>
              </div>
            </div>
          </section>

          <FormError message={error} />
        </PinnedBody>

        <PinnedFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate({ date, narration, items })}
            disabled={!canPost}
            loading={pending}
          >
            {pending ? 'Memposting…' : 'Posting ke Buku Besar'}
          </Button>
        </PinnedFooter>
      </DialogContent>
    </Dialog>
  );
};

export default JournalEntryModal;
