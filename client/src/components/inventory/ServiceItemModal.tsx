/**
 * Add / edit a service item (layanan). Moved unchanged from InventoryPage;
 * restyling is Phase 4.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import Select from '@/components/Select';
import { errorMessage, type ServiceItemRow } from './inventory-rows';

interface ServiceItemModalProps {
  /** null = create. */
  editService: ServiceItemRow | null;
  onClose: () => void;
}

interface RevenueAccount {
  id: string;
  accountNumber: string;
  name: string;
  rootType: string;
  isGroup: boolean;
}

const initialForm = (svc: ServiceItemRow | null) =>
  svc
    ? {
        code: svc.code,
        name: svc.name,
        unit: svc.unit || 'Jasa',
        defaultRate: svc.defaultRate ? String(Number(svc.defaultRate)) : '',
        accountId: svc.accountId || svc.account?.id || '',
        description: svc.description || '',
      }
    : { code: '', name: '', unit: 'Jasa', defaultRate: '', accountId: '', description: '' };

export function ServiceItemModal({ editService, onClose }: ServiceItemModalProps) {
  const queryClient = useQueryClient();
  const [serviceForm, setServiceForm] = useState(() => initialForm(editService));
  const [serviceSaving, setServiceSaving] = useState(false);

  const { data: revenueAccounts } = useQuery({
    queryKey: ['revenue-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: RevenueAccount[] = res.data.data ?? res.data;
      return all.filter((a) => a.rootType === 'REVENUE' && !a.isGroup);
    },
  });

  const handleSaveService = async () => {
    if (!serviceForm.code || !serviceForm.name || !serviceForm.accountId) {
      toast.error('Kode, nama, dan akun pendapatan wajib diisi.');
      return;
    }
    setServiceSaving(true);
    try {
      const payload = {
        ...serviceForm,
        defaultRate: serviceForm.defaultRate ? Number(serviceForm.defaultRate) : undefined,
      };
      if (editService) {
        await api.patch(`/service-items/${editService.id}`, payload);
        toast.success('Layanan berhasil diubah.');
      } else {
        await api.post('/service-items', payload);
        toast.success('Layanan berhasil ditambahkan.');
      }
      queryClient.invalidateQueries({ queryKey: ['service-items'] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menyimpan layanan.'));
    } finally {
      setServiceSaving(false);
    }
  };

  const inputClass =
    'w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" role="dialog" aria-modal="true" aria-labelledby="svc-modal-title">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 id="svc-modal-title" className="text-sm font-semibold text-gray-900">
            {editService ? 'Edit Layanan' : 'Tambah Layanan'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400" aria-label="Tutup">
            <XCircle size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="svc-code" className="block text-xs font-semibold text-gray-500 mb-1">Kode</label>
              <input id="svc-code" type="text" value={serviceForm.code} onChange={(e) => setServiceForm({ ...serviceForm, code: e.target.value })}
                className={inputClass} placeholder="JSG-001" />
            </div>
            <div>
              <label htmlFor="svc-unit" className="block text-xs font-semibold text-gray-500 mb-1">Satuan</label>
              <input id="svc-unit" type="text" value={serviceForm.unit} onChange={(e) => setServiceForm({ ...serviceForm, unit: e.target.value })}
                className={inputClass} placeholder="Jasa" />
            </div>
          </div>
          <div>
            <label htmlFor="svc-name" className="block text-xs font-semibold text-gray-500 mb-1">Nama Layanan</label>
            <input id="svc-name" type="text" value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
              className={inputClass} placeholder="Jasa Maklon Produksi" />
          </div>
          <div>
            <label htmlFor="svc-rate" className="block text-xs font-semibold text-gray-500 mb-1">Tarif Default (Rp)</label>
            <input id="svc-rate" type="number" value={serviceForm.defaultRate} onChange={(e) => setServiceForm({ ...serviceForm, defaultRate: e.target.value })}
              className={`${inputClass} font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`} placeholder="500000" />
          </div>
          <div>
            <label htmlFor="svc-account" className="block text-xs font-semibold text-gray-500 mb-1">Akun Pendapatan</label>
            <Select id="svc-account" value={serviceForm.accountId} onChange={(e) => setServiceForm({ ...serviceForm, accountId: e.target.value })}
              className="w-full">
              <option value="">— Pilih Akun —</option>
              {revenueAccounts?.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.accountNumber} — {acc.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="svc-desc" className="block text-xs font-semibold text-gray-500 mb-1">Deskripsi</label>
            <input id="svc-desc" type="text" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
              className={inputClass} placeholder="Opsional" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={handleSaveService} disabled={serviceSaving} className="btn-primary disabled:opacity-50">
            {serviceSaving ? <Loader2 size={15} className="animate-spin" /> : editService ? 'Simpan Perubahan' : 'Tambah Layanan'}
          </button>
        </div>
      </div>
    </div>
  );
}
