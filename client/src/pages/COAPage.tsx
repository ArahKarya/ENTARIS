import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  ChevronRight, ChevronDown, Plus, Folder, FileText,
  Search, PlusCircle, Pencil, X, Loader2, AlertCircle, Trash2, Wallet, Upload, Download
} from 'lucide-react';
import { cn } from '../lib/utils';
import { formatRupiah } from '../lib/formatters';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import ImportModal from '../components/ImportModal';
import { exportToExcel } from '../lib/exportExcel';
import Select from '../components/Select';

// --- Types ---
interface Account {
  id: string;
  accountNumber: string;
  name: string;
  accountType: string;
  rootType: string;
  isGroup: boolean;
  isActive: boolean;
  balance: number;
  parentId: string | null;
  children?: Account[];
}

// --- Add Account Modal ---
const AddAccountModal: React.FC<{ isOpen: boolean; onClose: () => void; parent?: Account | null }> = ({ isOpen, onClose, parent }) => {
  const [formData, setFormData] = useState({
    accountNumber: parent ? `${parent.accountNumber}.` : '',
    name: '',
    accountType: parent?.accountType || 'ASSET',
    rootType: parent?.rootType || 'ASSET',
    isGroup: false,
    description: ''
  });
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/coa', { ...data, parentId: parent?.id || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      onClose();
      setFormData({ accountNumber: '', name: '', accountType: 'ASSET', rootType: 'ASSET', isGroup: false, description: '' });
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal membuat akun.')
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-lg shadow-xl">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Tambah Akun Baru</h3>
            {parent && <p className="text-xs text-gray-500 mt-0.5">Sub-akun dari: <span className="text-blue-600 font-mono">{parent.accountNumber} - {parent.name}</span></p>}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(formData); }} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nomor Akun</label>
              <input
                type="text"
                value={formData.accountNumber}
                onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="1.1.1"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipe Root</label>
              <Select
                value={formData.rootType}
                onChange={(e) => setFormData({ ...formData, rootType: e.target.value, accountType: e.target.value })}
                disabled={!!parent}
                className="w-full"
              >
                {[
                  { value: 'ASSET',     label: 'Asset' },
                  { value: 'LIABILITY', label: 'Liability' },
                  { value: 'EQUITY',    label: 'Equity' },
                  { value: 'REVENUE',   label: 'Revenue / Pendapatan' },
                  { value: 'EXPENSE',   label: 'Expense / Beban' },
                ].map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nama Akun</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Masukkan nama akun"
              required
            />
          </div>

          <label className="flex items-center gap-2.5 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
            <input
              type="checkbox"
              id="isGroup"
              checked={formData.isGroup}
              onChange={(e) => setFormData({ ...formData, isGroup: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-600 font-medium">
              Jadikan Akun Grup (hanya untuk mengelompokkan sub-akun)
            </span>
          </label>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary justify-center">Batal</button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 btn-primary justify-center"
            >
              {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan Akun'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Edit Account Modal ---
const EditAccountModal: React.FC<{ isOpen: boolean; onClose: () => void; account: Account | null }> = ({ isOpen, onClose, account }) => {
  const [accountNumber, setAccountNumber] = useState('');
  const [name, setName] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  // Sync form when account changes
  React.useEffect(() => {
    if (account) {
      setAccountNumber(account.accountNumber);
      setName(account.name);
      setIsGroup(account.isGroup);
      setIsActive(account.isActive);
      setError('');
    }
  }, [account]);

  const mutation = useMutation({
    mutationFn: (data: any) => api.put(`/coa/${account!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      toast.success('Akun berhasil diperbarui.');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal mengupdate akun.')
  });

  if (!isOpen || !account) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    mutation.mutate({ accountNumber, name, isGroup, isActive });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-lg shadow-xl">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Edit Akun</h3>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{account.rootType} · {account.isGroup ? 'Grup' : 'Detail'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nomor Akun</label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipe Root</label>
              <input
                type="text"
                value={account.rootType}
                disabled
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-400 bg-gray-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nama Akun</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex gap-3">
            <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={isGroup}
                onChange={(e) => setIsGroup(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-600 font-medium">Akun Grup</span>
            </label>
            <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-600 font-medium">Akun Aktif</span>
            </label>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary justify-center">Batal</button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 btn-primary justify-center"
            >
              {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Set Balance Modal ---
const SetBalanceModal: React.FC<{ isOpen: boolean; onClose: () => void; account: Account | null }> = ({ isOpen, onClose, account }) => {
  const [balance, setBalance] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (account) {
      setBalance(String(Number(account.balance) || 0));
      setError('');
    }
  }, [account]);

  const mutation = useMutation({
    mutationFn: (data: { balance: number }) => api.patch(`/coa/${account!.id}/balance`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      toast.success('Saldo awal berhasil diatur.');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal mengatur saldo awal.')
  });

  if (!isOpen || !account) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const numBalance = parseFloat(balance.replace(/[^0-9.-]/g, ''));
    if (isNaN(numBalance)) {
      setError('Masukkan angka yang valid.');
      return;
    }
    mutation.mutate({ balance: numBalance });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md shadow-xl">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Set Saldo Awal</h3>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{account.accountNumber} - {account.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Saldo Saat Ini</label>
            <div className="text-sm font-mono text-gray-500 bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 flex items-center gap-2">
              {formatRupiah(Math.abs(account.balance))}
              {account.balance !== 0 && (() => {
                const isDebitNature = account.rootType === 'ASSET' || account.rootType === 'EXPENSE';
                const isDebitBalance = account.balance > 0 ? isDebitNature : !isDebitNature;
                return <span className={cn('text-xs font-bold px-1 py-0.5 rounded', isDebitBalance ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50')}>{isDebitBalance ? 'D' : 'K'}</span>;
              })()}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Saldo Baru</label>
            <input
              type="text"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="0"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">Jurnal saldo awal akan otomatis dibuat terhadap akun Saldo Laba Ditahan.</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary justify-center">Batal</button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 btn-primary justify-center"
            >
              {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Simpan Saldo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Account Node Component ---
const AccountNode: React.FC<{
  account: Account;
  level: number;
  onAddSub: (acc: Account) => void;
  onEdit: (acc: Account) => void;
  onDelete: (acc: Account) => void;
  onSetBalance: (acc: Account) => void;
}> = React.memo(function AccountNode({ account, level, onAddSub, onEdit, onDelete, onSetBalance }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = account.children && account.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-2 py-2 px-3 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-50',
          isOpen && hasChildren ? 'bg-gray-50/60' : '',
          !account.isActive && 'opacity-50'
        )}
        onClick={() => setIsOpen(!isOpen)}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
      >
        <div className="flex items-center gap-1.5">
          {hasChildren ? (
            <span className="text-gray-400">
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          ) : (
            <span className="w-3.5" />
          )}
          {account.isGroup ? (
            <Folder className={cn('w-4 h-4', isOpen ? 'text-blue-500' : 'text-gray-400')} />
          ) : (
            <FileText className="w-4 h-4 text-gray-400" />
          )}
        </div>

        <div className="flex-1 flex items-center justify-between min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs text-gray-400 shrink-0">{account.accountNumber}</span>
            <span className={cn('text-sm truncate', account.isGroup ? 'font-semibold text-gray-800' : 'text-gray-600')}>
              {account.name}
            </span>
            {!account.isActive && (
              <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Nonaktif</span>
            )}
          </div>

          <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
            {!account.isGroup && account.balance !== 0 && (() => {
              const isDebitNature = account.rootType === 'ASSET' || account.rootType === 'EXPENSE';
              const isDebitBalance = account.balance > 0 ? isDebitNature : !isDebitNature;
              return (
                <span className="text-xs font-mono tabular-nums flex items-center gap-1">
                  <span style={{ color: 'var(--color-text-muted)' }}>{formatRupiah(Math.abs(account.balance))}</span>
                  <span className={cn('text-xs font-bold px-1 py-0.5 rounded', isDebitBalance ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50')}>
                    {isDebitBalance ? 'D' : 'K'}
                  </span>
                </span>
              );
            })()}
            <div className="flex items-center gap-0.5">
              {account.isGroup && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAddSub(account); }}
                  className="p-1 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600 transition-colors"
                  title="Tambah Sub-akun"
                >
                  <PlusCircle size={13} />
                </button>
              )}
              {!account.isGroup && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSetBalance(account); }}
                  className="p-1 hover:bg-green-50 rounded text-gray-400 hover:text-green-600 transition-colors"
                  title="Set Saldo Awal"
                >
                  <Wallet size={13} />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(account); }}
                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
                title="Edit akun"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(account); }}
                className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                title="Hapus akun"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {isOpen && hasChildren && (
        <div>
          {account.children?.map(child => (
            <AccountNode key={child.id} account={child} level={level + 1} onAddSub={onAddSub} onEdit={onEdit} onDelete={onDelete} onSetBalance={onSetBalance} />
          ))}
        </div>
      )}
    </div>
  );
});

// --- Page Component ---
export const COAPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [modalState, setModalState] = useState<{ isVisible: boolean; parent: Account | null }>({ isVisible: false, parent: null });
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [balanceTarget, setBalanceTarget] = useState<Account | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['coa'],
    queryFn: async () => {
      const response = await api.get('/coa');
      return response.data;
    }
  });

  // Flatten tree for search
  const flattenTree = (nodes: Account[]): Account[] => {
    return nodes.flatMap(node => [node, ...flattenTree(node.children ?? [])]);
  };

  const filteredAccounts = searchTerm.trim()
    ? flattenTree(accounts ?? []).filter(acc =>
        acc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        acc.accountNumber.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : null;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/coa/${deleteTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      toast.success(`Akun "${deleteTarget.name}" berhasil dihapus.`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menghapus akun.');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Bagan Akun</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola struktur Chart of Accounts secara hierarkis.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary flex items-center gap-1.5"
            onClick={() => {
              const flat = flattenTree(accounts ?? []);
              exportToExcel(
                flat.map(a => ({
                  accountNumber: a.accountNumber,
                  name: a.name,
                  rootType: a.rootType,
                  accountType: a.accountType,
                  isGroup: a.isGroup ? 'Ya' : 'Tidak',
                  balance: a.balance,
                })),
                'bagan-akun'
              );
            }}
          >
            <Download size={14} /> Download
          </button>
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => setIsImportOpen(true)}>
            <Upload size={14} /> Import
          </button>
          <button
            onClick={() => setModalState({ isVisible: true, parent: null })}
            className="btn-primary"
          >
            <Plus size={15} /> Tambah Akun Root
          </button>
        </div>
      </div>

      {/* Search & Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-gray-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari akun atau nomor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Struktur Hierarki</span>
        </div>

        <div className="min-h-[400px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 text-gray-300 animate-spin" />
              <p className="text-sm text-gray-400">Memuat bagan akun...</p>
            </div>
          ) : accounts?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Folder className="w-10 h-10 text-gray-200" />
              <p className="text-sm text-gray-400 text-center">Belum ada akun terdaftar.<br />Klik tombol di atas untuk membuat akun pertama.</p>
            </div>
          ) : filteredAccounts !== null ? (
            // Search results: flat list
            <div>
              {filteredAccounts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Search className="w-8 h-8 text-gray-200" />
                  <p className="text-sm text-gray-400">Tidak ada akun yang cocok dengan "{searchTerm}".</p>
                </div>
              ) : (
                filteredAccounts.map((account: Account) => (
                  <AccountNode
                    key={account.id}
                    account={account}
                    level={0}
                    onAddSub={(parent) => setModalState({ isVisible: true, parent })}
                    onEdit={setEditTarget}
                    onDelete={setDeleteTarget}
                    onSetBalance={setBalanceTarget}
                  />
                ))
              )}
            </div>
          ) : (
            // Normal tree view
            <div>
              {accounts?.map((account: Account) => (
                <AccountNode
                  key={account.id}
                  account={account}
                  level={0}
                  onAddSub={(parent) => setModalState({ isVisible: true, parent })}
                  onEdit={setEditTarget}
                  onDelete={setDeleteTarget}
                  onSetBalance={setBalanceTarget}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AddAccountModal
        isOpen={modalState.isVisible}
        onClose={() => setModalState({ isVisible: false, parent: null })}
        parent={modalState.parent}
      />

      <EditAccountModal
        isOpen={editTarget !== null}
        onClose={() => setEditTarget(null)}
        account={editTarget}
      />

      <SetBalanceModal
        isOpen={balanceTarget !== null}
        onClose={() => setBalanceTarget(null)}
        account={balanceTarget}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Akun"
        message={`Hapus akun "${deleteTarget?.accountNumber} - ${deleteTarget?.name}"? Akun hanya bisa dihapus jika tidak memiliki sub-akun, tidak memiliki transaksi, dan saldo nol.`}
        confirmLabel={isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
        cancelLabel="Batal"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Import Modal */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        importType="coa"
      />
    </div>
  );
};

export default COAPage;
