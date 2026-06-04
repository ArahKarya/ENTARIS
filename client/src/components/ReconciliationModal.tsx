import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { format } from 'date-fns';
import Select from './Select';

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
      // Create reconciliation
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
      toast.success('Rekonsiliasi berhasil dibuat.');
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

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recon-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className="rounded-xl border shadow-xl p-4 sm:p-6 w-full max-w-[calc(100vw-1rem)] sm:max-w-md lg:max-w-2xl max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="recon-modal-title" className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Rekonsiliasi Baru
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X size={18} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Account Selection */}
          <div>
            <label htmlFor="recon-account" className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Akun Bank / Kas *
            </label>
            <Select
              id="recon-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              <option value="">Pilih akun...</option>
              {accounts?.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.accountNumber} - {acc.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="recon-date" className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Tanggal Statement *
              </label>
              <input
                id="recon-date"
                type="date"
                value={statementDate}
                onChange={(e) => setStatementDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
            <div>
              <label htmlFor="recon-balance" className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Saldo Statement (Rp) *
              </label>
              <input
                id="recon-balance"
                type="number"
                value={statementBalance}
                onChange={(e) => setStatementBalance(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="recon-notes" className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Catatan
            </label>
            <input
              id="recon-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opsional..."
              className="w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          {/* Statement Items */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                Mutasi Bank (Opsional)
              </h3>
              <button onClick={handleAddItem} className="btn-secondary text-xs py-1 px-2">
                <Plus size={13} /> Tambah
              </button>
            </div>

            {statementItems.length > 0 && (
              <div className="space-y-2">
                {statementItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="date"
                      value={item.statementDate}
                      onChange={(e) => handleItemChange(idx, 'statementDate', e.target.value)}
                      placeholder="Tanggal"
                      className="w-32 px-2 py-1.5 text-xs rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                      style={{
                        backgroundColor: 'var(--color-bg-primary)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                    <input
                      type="text"
                      value={item.statementDesc}
                      onChange={(e) => handleItemChange(idx, 'statementDesc', e.target.value)}
                      placeholder="Keterangan"
                      className="flex-1 px-2 py-1.5 text-xs rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                      style={{
                        backgroundColor: 'var(--color-bg-primary)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                    <input
                      type="number"
                      value={item.statementAmount}
                      onChange={(e) => handleItemChange(idx, 'statementAmount', e.target.value)}
                      placeholder="Jumlah (Rp)"
                      className="w-36 px-2 py-1.5 text-xs rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none"
                      style={{
                        backgroundColor: 'var(--color-bg-primary)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                    <button
                      onClick={() => handleRemoveItem(idx)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 btn-secondary justify-center">
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={!accountId || !statementDate || statementBalance === '' || createMutation.isPending}
            className="flex-1 btn-primary justify-center disabled:opacity-50"
          >
            {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            {createMutation.isPending ? 'Menyimpan...' : 'Buat Rekonsiliasi'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReconciliationModal;
