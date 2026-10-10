import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Field, DateInput } from '@/components/shared';
import { FormDialog } from './purchase-cash/FormDialog';
import { OptionPicker } from './purchase-cash/OptionPicker';

interface Account {
  id: string;
  name: string;
  accountNumber: string;
  accountType: string;
  balance: number;
  isGroup?: boolean;
}

interface StatementItem {
  statementAmount: string;
  statementDesc: string;
  statementDate: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ReconciliationModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [statementDate, setStatementDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [statementBalance, setStatementBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [statementItems, setStatementItems] = useState<StatementItem[]>([]);

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['coa-cash-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: Account[] = Array.isArray(res.data) ? res.data : res.data.data || [];
      return all.filter(
        (a) =>
          a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1.') &&
          !a.isGroup
      );
    },
    enabled: isOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/reconciliation', data);
      const recon = res.data;

      // If statement items provided, add them
      if (statementItems.length > 0) {
        const validItems = statementItems.filter((i) => i.statementAmount !== '');
        if (validItems.length > 0) {
          await api.post(`/reconciliation/${recon.id}/items`, {
            items: validItems.map((i) => ({
              statementAmount: parseFloat(i.statementAmount),
              statementDesc: i.statementDesc || null,
              statementDate: i.statementDate || null,
            })),
          });
        }
      }

      return recon;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      toast.success('Rekonsiliasi dibuat.');
      resetForm();
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Gagal membuat rekonsiliasi.');
    },
  });

  const resetForm = () => {
    setAccountId('');
    setStatementDate(format(new Date(), 'yyyy-MM-dd'));
    setStatementBalance('');
    setNotes('');
    setStatementItems([]);
  };

  const handleAddItem = () => {
    setStatementItems([...statementItems, { statementAmount: '', statementDesc: '', statementDate: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    setStatementItems(statementItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof StatementItem, value: string) => {
    const updated = [...statementItems];
    updated[index] = { ...updated[index], [field]: value };
    setStatementItems(updated);
  };

  const handleSubmit = () => {
    if (!accountId || !statementDate || statementBalance === '') {
      toast.error('Lengkapi semua field yang wajib diisi.');
      return;
    }
    createMutation.mutate({
      accountId,
      statementDate,
      statementBalance: parseFloat(statementBalance),
      notes: notes || null,
    });
  };

  return (
    <FormDialog
      open={isOpen}
      onClose={onClose}
      title="Rekonsiliasi Baru"
      description="Cocokkan saldo buku dengan statement bank / kas."
      className="sm:max-w-2xl"
      busy={createMutation.isPending}
      submitLabel="Buat Rekonsiliasi"
      busyLabel="Menyimpan…"
      onSubmit={handleSubmit}
      submitDisabled={!accountId || !statementDate || statementBalance === ''}
    >
      <Field label="Akun Bank / Kas" required>
        <OptionPicker
          value={accountId}
          onChange={setAccountId}
          placeholder="Pilih akun..."
          options={(accounts ?? []).map((acc) => ({ value: acc.id, label: `${acc.accountNumber} - ${acc.name}` }))}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tanggal Statement" required>
          <DateInput value={statementDate} onChange={setStatementDate} />
        </Field>
        <Field label="Saldo Statement (Rp)" required>
          <NumberInput
            value={statementBalance}
            onChange={(e) => setStatementBalance(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            className="h-10 text-right md:h-9"
          />
        </Field>
      </div>

      <Field label="Catatan">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional..." />
      </Field>

      <section aria-labelledby="recon-items-title" className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 id="recon-items-title" className="text-sm font-medium text-foreground">
            Mutasi Bank (Opsional)
          </h3>
          <Button type="button" variant="outline" size="sm" className="h-11 sm:h-8" onClick={handleAddItem}>
            <Plus aria-hidden /> Tambah
          </Button>
        </div>

        {statementItems.length > 0 && (
          <ul className="space-y-3">
            {statementItems.map((item, idx) => (
              <li key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[9rem_1fr_9rem_auto] sm:items-center sm:border-0 sm:p-0">
                <Field label={`Tanggal mutasi ${idx + 1}`} hideLabel>
                  <DateInput value={item.statementDate} onChange={(v) => handleItemChange(idx, 'statementDate', v)} />
                </Field>
                <Field label={`Keterangan mutasi ${idx + 1}`} hideLabel>
                  <Input
                    value={item.statementDesc}
                    onChange={(e) => handleItemChange(idx, 'statementDesc', e.target.value)}
                    placeholder="Keterangan"
                  />
                </Field>
                <Field label={`Jumlah mutasi ${idx + 1} (Rp)`} hideLabel>
                  <NumberInput
                    value={item.statementAmount}
                    onChange={(e) => handleItemChange(idx, 'statementAmount', e.target.value)}
                    placeholder="Jumlah (Rp)"
                    inputMode="decimal"
                    className="h-10 text-right md:h-9"
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  className="text-danger-text sm:size-9"
                  aria-label={`Hapus mutasi ${idx + 1}`}
                  onClick={() => handleRemoveItem(idx)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </FormDialog>
  );
};

export default ReconciliationModal;
