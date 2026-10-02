import { useState, useRef, useEffect } from 'react';
import { Plus, Search, MoreHorizontal, Users, Loader2, Mail, Phone, MapPin, Pencil, Trash2, AlertCircle, Upload, Download, LayoutDashboard, List } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { formatRupiah } from '../lib/formatters';
import PartyFormModal from '../components/PartyFormModal';
import ImportModal from '../components/ImportModal';
import { exportToExcel } from '../lib/exportExcel';
import PartiesDashboardTab from '../components/PartiesDashboardTab';

export const PartiesPage = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'data'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editParty, setEditParty] = useState<any | null>(null);
  const [menuPartyId, setMenuPartyId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: parties, isLoading } = useQuery({
    queryKey: ['parties', filterType],
    queryFn: async () => {
      const params = filterType !== 'All' ? { type: filterType } : {};
      const response = await api.get('/parties', { params });
      return response.data.data ?? response.data;
    }
  });

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuPartyId(null);
      }
    };
    if (menuPartyId) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuPartyId]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/parties/${id}`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['parties-all'] });
      const data = res.data;
      if (data.deactivated) {
        toast.info(data.message || 'Mitra dinonaktifkan karena memiliki transaksi terkait.');
      } else {
        toast.success(data.message || 'Mitra berhasil dihapus.');
      }
      setDeleteConfirm(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal menghapus mitra.');
      setDeleteConfirm(null);
    },
  });

  const handleEdit = (party: any) => {
    setMenuPartyId(null);
    setEditParty(party);
    setIsModalOpen(true);
  };

  const handleDelete = (party: any) => {
    setMenuPartyId(null);
    setDeleteConfirm(party);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditParty(null);
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pelanggan & Vendor</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola data mitra bisnis, saldo piutang, dan hutang usaha.</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'data' && (
            <>
              <button
                className="btn-secondary flex items-center gap-1.5"
                onClick={() =>
                  exportToExcel(
                    (parties ?? []).map((p: any) => ({
                      name: p.name,
                      partyType: p.partyType,
                      phone: p.phone ?? '',
                      email: p.email ?? '',
                      address: p.address ?? '',
                      taxId: p.taxId ?? '',
                      outstandingAmount: Number(p.outstandingAmount ?? 0),
                      depositBalance: Number(p.depositBalance ?? 0),
                      customerDepositBalance: Number(p.customerDepositBalance ?? 0),
                    })),
                    'pelanggan-vendor'
                  )
                }
              >
                <Download size={14} /> Download
              </button>
              <button className="btn-secondary flex items-center gap-1.5" onClick={() => setIsImportOpen(true)}>
                <Upload size={14} /> Import
              </button>
            </>
          )}
          <button className="btn-primary" onClick={() => { setEditParty(null); setIsModalOpen(true); setActiveTab('data'); }}>
            <Plus size={15} /> Tambah Mitra Baru
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
            activeTab === 'dashboard'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          )}
        >
          <LayoutDashboard size={14} /> Dashboard
        </button>
        <button
          onClick={() => setActiveTab('data')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
            activeTab === 'data'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          )}
        >
          <List size={14} /> Data Mitra
        </button>
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && <PartiesDashboardTab />}

      {/* Data Tab */}
      {activeTab === 'data' && (
      <>
      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama, email, atau telepon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          {['All', 'Customer', 'Supplier'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                filterType === type ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              {type === 'All' ? 'Semua' : type === 'Customer' ? 'Pelanggan' : 'Vendor'}
            </button>
          ))}
        </div>
      </div>

      {/* Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full py-16 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-400">Memuat data mitra...</p>
          </div>
        ) : parties?.length === 0 ? (
          <div className="col-span-full bg-white border border-gray-200 rounded-xl py-16 text-center">
            <Users className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Belum ada data mitra bisnis.</p>
          </div>
        ) : (
          parties?.filter((p: any) =>
            !searchTerm ||
            p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.phone?.includes(searchTerm)
          ).map((party: any) => (
            <div key={party.id} className={cn(
              'bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-all group relative',
              !party.isActive && 'opacity-50'
            )}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold',
                    party.partyType === 'Customer' ? 'bg-blue-50 text-blue-600' :
                    party.partyType === 'Supplier' ? 'bg-orange-50 text-orange-600' : 'bg-purple-50 text-purple-600'
                  )}>
                    {party.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 flex-wrap leading-tight">
                      <span className="truncate">{party.name}</span>
                      {party.isWapu && (
                        <span
                          className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-amber-100 text-amber-700 border border-amber-200"
                          title="Wajib Pungut — PPN dipungut sendiri oleh customer ke kas negara"
                        >
                          WAPU
                        </span>
                      )}
                      {!party.isActive && (
                        <span className="shrink-0 text-xs text-red-400 font-normal">(Nonaktif)</span>
                      )}
                    </h3>
                    <p className={cn(
                      'text-xs font-medium uppercase tracking-wider mt-0.5',
                      party.partyType === 'Customer' ? 'text-blue-500' :
                      party.partyType === 'Supplier' ? 'text-orange-500' : 'text-purple-500'
                    )}>
                      {party.partyType === 'Customer' ? 'Pelanggan' : party.partyType === 'Supplier' ? 'Vendor' : 'Pelanggan & Vendor'}
                    </p>
                  </div>
                </div>

                {/* Action Menu */}
                <div className="relative" ref={menuPartyId === party.id ? menuRef : undefined}>
                  <button
                    onClick={() => setMenuPartyId(menuPartyId === party.id ? null : party.id)}
                    className="p-1 hover:bg-gray-100 rounded text-gray-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <MoreHorizontal size={14} />
                  </button>

                  {menuPartyId === party.id && (
                    <div className="absolute right-0 top-8 z-50 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 animate-in fade-in slide-in-from-top-1">
                      <button
                        onClick={() => handleEdit(party)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(party)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={13} /> Hapus
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 mb-4">
                {party.email && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Mail size={12} className="text-gray-400" /> {party.email}
                  </div>
                )}
                {party.phone && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Phone size={12} className="text-gray-400" /> {party.phone}
                  </div>
                )}
                {party.address && (
                  <div className="flex items-start gap-2 text-xs text-gray-500">
                    <MapPin size={12} className="text-gray-400 mt-0.5 shrink-0" />
                    <span className="line-clamp-1">{party.address}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-gray-100 space-y-1.5">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-0.5">Saldo Terutang</p>
                  <p className={cn(
                    'text-base font-semibold font-mono tabular-nums',
                    Number(party.outstandingAmount) > 0 ? 'text-red-500' :
                    Number(party.outstandingAmount) < 0 ? 'text-green-600' : 'text-gray-400'
                  )}>
                    {formatRupiah(Math.abs(Number(party.outstandingAmount)))}
                    {Number(party.outstandingAmount) !== 0 && (
                      <span className="text-xs font-normal ml-1 text-gray-400">
                        {Number(party.outstandingAmount) > 0 ? '(Tagihan)' : '(Deposit)'}
                      </span>
                    )}
                  </p>
                </div>
                {Number(party.depositBalance) > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-0.5">UM Vendor</p>
                    <p className="text-sm font-semibold font-mono tabular-nums text-amber-600">
                      {formatRupiah(Number(party.depositBalance))}
                    </p>
                  </div>
                )}
                {Number(party.customerDepositBalance) > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-0.5">UM Pelanggan</p>
                    <p className="text-sm font-semibold font-mono tabular-nums text-teal-600">
                      {formatRupiah(Number(party.customerDepositBalance))}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      </>
      )}

      {/* Form Modal (Create / Edit) */}
      <PartyFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        editParty={editParty}
      />

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleteMutation.isPending && setDeleteConfirm(null)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Hapus Mitra?</h3>
                <p className="text-xs text-gray-500">
                  {deleteConfirm.name}
                </p>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-5 flex items-start gap-2">
              <AlertCircle size={14} className="text-yellow-600 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-700">
                Jika mitra memiliki transaksi terkait (invoice/pembayaran), data akan dinonaktifkan, bukan dihapus permanen.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleteMutation.isPending}
                className="btn-secondary"
              >
                Batal
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-40"
              >
                {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        importType="parties"
      />
    </div>
  );
};
