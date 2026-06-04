import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Plus, Trash2, Loader2, AlertCircle, Save } from 'lucide-react';
import { formatRupiah } from '../lib/formatters';
import RupiahInput from './RupiahInput';
import Select from './Select';

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

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="journal-modal-title" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30" onKeyDown={(e: React.KeyboardEvent) => e.key === "Escape" && onClose()}>
      <div className="rounded-xl border w-full max-w-[calc(100vw-1rem)] lg:max-w-5xl shadow-xl flex flex-col max-h-[90vh]" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
        {/* Header */}
        <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h3 id="journal-modal-title" className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Buat Jurnal Baru</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Catat transaksi keuangan secara manual</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5">
          {/* Date & Narration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan / Narasi</label>
              <input
                type="text"
                placeholder="Misal: Pembayaran Listrik Bulan Maret 2024"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Items Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Rincian Akun</h4>
              <button onClick={addItem} className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors">
                <Plus size={13} /> Tambah Baris
              </button>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2.5 min-w-[200px]">Akun</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2.5 min-w-[140px]">Keterangan</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2.5 w-28">Debit</th>
                    <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2.5 w-28">Kredit</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item, index) => (
                    <tr key={item.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2">
                        <Select
                          value={item.accountId}
                          onChange={(e) => updateItem(index, 'accountId', e.target.value)}
                          className="w-full"
                        >
                          <option value="" className="text-gray-400">Pilih Akun...</option>
                          {accounts?.map((acc: Account) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.accountNumber} - {acc.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(index, 'description', e.target.value)}
                          placeholder={narration || 'Keterangan...'}
                          className="w-full border-none bg-transparent text-sm text-gray-800 focus:ring-0 focus:outline-none p-0 placeholder:text-gray-400"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <RupiahInput
                          value={item.debit}
                          onChange={(v) => updateItem(index, 'debit', v)}
                          className="w-full border-none bg-transparent text-sm text-gray-800 font-mono text-right focus:ring-0 focus:outline-none p-0"
                          aria-label="Debit"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <RupiahInput
                          value={item.credit}
                          onChange={(v) => updateItem(index, 'credit', v)}
                          className="w-full border-none bg-transparent text-sm text-gray-800 font-mono text-right focus:ring-0 focus:outline-none p-0"
                          aria-label="Kredit"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => removeItem(index)}
                          className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Balance Summary */}
            <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Status</p>
                {isBalanced ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
                    <Save size={13} /> Jurnal Seimbang
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-red-500">
                    <AlertCircle size={13} /> Selisih: {formatRupiah(Math.abs(totalDebit - totalCredit))}
                  </span>
                )}
              </div>
              <div className="flex gap-6">
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Total Debit</p>
                  <p className="text-sm font-semibold text-gray-900 font-mono tabular-nums">{formatRupiah(totalDebit)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Total Kredit</p>
                  <p className="text-sm font-semibold text-gray-900 font-mono tabular-nums">{formatRupiah(totalCredit)}</p>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button
            onClick={() => mutation.mutate({ date, narration, items })}
            disabled={mutation.isPending || !isBalanced || !narration}
            className="btn-primary"
          >
            {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Posting ke Buku Besar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JournalEntryModal;
