import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';

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

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="recurring-template-modal-title" className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 p-4 pt-12 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-[calc(100vw-1rem)] sm:max-w-md lg:max-w-2xl rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {editTemplate ? 'Edit Template Berulang' : 'Buat Template Berulang'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Nama Template *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="contoh: Beban Sewa Bulanan"
            />
          </div>

          {/* Type + Frequency Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Tipe Transaksi *
              </label>
              <select
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value)}
                className="input-field"
              >
                <option value="journal">Jurnal Umum</option>
                <option value="sales_invoice">Invoice Penjualan</option>
                <option value="purchase_invoice">Invoice Pembelian</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Frekuensi *
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="input-field"
              >
                <option value="daily">Harian</option>
                <option value="weekly">Mingguan</option>
                <option value="monthly">Bulanan</option>
                <option value="quarterly">Triwulan</option>
                <option value="yearly">Tahunan</option>
              </select>
            </div>
          </div>

          {/* Day of Month + Next Run Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(frequency === 'monthly' || frequency === 'quarterly') && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Tanggal dalam Bulan
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value ? Number(e.target.value) : '')}
                  className="input-field"
                  placeholder="1-31"
                />
              </div>
            )}
            <div className={frequency !== 'monthly' && frequency !== 'quarterly' ? 'col-span-2' : ''}>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                Jadwal Berikutnya *
              </label>
              <input
                type="date"
                value={nextRunDate}
                onChange={(e) => setNextRunDate(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          {/* Journal Template Data */}
          {templateType === 'journal' && (
            <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Data Jurnal
              </h3>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Keterangan *
                </label>
                <input
                  type="text"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  className="input-field"
                  placeholder="contoh: Beban sewa gedung bulan ..."
                />
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={line.accountId}
                      onChange={(e) => updateLine(idx, 'accountId', e.target.value)}
                      className="input-field flex-1 text-xs"
                    >
                      <option value="">Pilih Akun...</option>
                      {accounts.map((acc: any) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.accountNumber} - {acc.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={line.debit || ''}
                      onChange={(e) => updateLine(idx, 'debit', parseFloat(e.target.value) || 0)}
                      className="input-field w-28 text-xs"
                      placeholder="Debit"
                    />
                    <input
                      type="number"
                      min={0}
                      value={line.credit || ''}
                      onChange={(e) => updateLine(idx, 'credit', parseFloat(e.target.value) || 0)}
                      className="input-field w-28 text-xs"
                      placeholder="Kredit"
                    />
                    {lines.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="p-1 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addLine}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus size={12} /> Tambah Baris
                </button>
              </div>
            </div>
          )}

          {/* Non-journal info */}
          {templateType !== 'journal' && (
            <div
              className="rounded-lg p-3 text-xs"
              style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}
            >
              Untuk tipe invoice penjualan/pembelian, eksekusi otomatis akan segera didukung.
              Saat ini Anda dapat menggunakan tipe Jurnal Umum untuk transaksi berulang.
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <button type="button" onClick={onClose} className="btn-secondary">
              Batal
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn-primary"
            >
              {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {editTemplate ? 'Simpan Perubahan' : 'Buat Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RecurringTemplateModal;
