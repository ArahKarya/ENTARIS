import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle, User, Mail, Lock, Shield } from 'lucide-react';
import { cn } from '../lib/utils';
import Select from './Select';

type UserRole = 'Admin' | 'Accountant' | 'StaffProduksi' | 'Viewer';

interface UserFormData {
  username: string;
  email: string;
  fullName: string;
  password: string;
  role: UserRole;
}

const defaultForm = (): UserFormData => ({
  username: '',
  email: '',
  fullName: '',
  password: '',
  role: 'Accountant',
});

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editUser?: any | null;
}

const UserFormModal: React.FC<UserFormModalProps> = ({ isOpen, onClose, editUser }) => {
  const [form, setForm] = useState<UserFormData>(defaultForm());
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const isEdit = !!editUser;

  useEffect(() => {
    if (isOpen && editUser) {
      setForm({
        username: editUser.username || '',
        email: editUser.email || '',
        fullName: editUser.fullName || '',
        password: '',
        role: editUser.role || 'Accountant',
      });
      setError('');
    } else if (isOpen) {
      setForm(defaultForm());
      setError('');
    }
  }, [isOpen, editUser]);

  const set = (field: keyof UserFormData, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }));

  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit ? api.put(`/users/${editUser.id}`, data) : api.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setForm(defaultForm());
      setError('');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan data user.'),
  });

  const handleSubmit = () => {
    if (!form.fullName.trim()) { setError('Nama lengkap wajib diisi.'); return; }
    if (!form.username.trim()) { setError('Username wajib diisi.'); return; }
    if (!form.email.trim()) { setError('Email wajib diisi.'); return; }
    if (!isEdit && !form.password) { setError('Password wajib diisi untuk user baru.'); return; }
    if (form.password && form.password.length < 8) { setError('Password minimal 8 karakter.'); return; }

    const payload: any = {
      username: form.username,
      email: form.email,
      fullName: form.fullName,
      role: form.role,
    };
    if (form.password) payload.password = form.password;

    mutation.mutate(payload);
  };

  if (!isOpen) return null;

  const inputCls = 'w-full border rounded-lg py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400';
  const iconCls = 'absolute left-3 top-1/2 -translate-y-1/2';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}
    >
      <div
        className="rounded-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-lg shadow-2xl flex flex-col max-h-[95vh] overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h2 id="user-modal-title" className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {isEdit ? 'Edit User' : 'Tambah User Baru'}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {isEdit ? `Mengubah data ${editUser.fullName}` : 'Buat akun pengguna baru'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" style={{ color: 'var(--color-text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Nama Lengkap */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Nama Lengkap <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <User size={14} className={iconCls} style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                value={form.fullName}
                onChange={e => set('fullName', e.target.value)}
                placeholder="Nama lengkap pengguna"
                className={inputCls}
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Username <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <User size={14} className={iconCls} style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                value={form.username}
                onChange={e => set('username', e.target.value)}
                placeholder="username"
                className={inputCls}
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Email <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Mail size={14} className={iconCls} style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="user@email.com"
                className={inputCls}
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Role <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Shield size={14} className={iconCls} style={{ color: 'var(--color-text-muted)' }} />
              <Select
                value={form.role}
                onChange={e => set('role', e.target.value)}
                className={cn(inputCls, 'appearance-none')}
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <option value="Admin">Admin</option>
                <option value="Accountant">Accountant</option>
                <option value="StaffProduksi">Staff Produksi</option>
                <option value="Viewer">Viewer</option>
              </Select>
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Password {!isEdit && <span className="text-red-400">*</span>}
              {isEdit && <span className="text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}> (kosongkan jika tidak diubah)</span>}
            </label>
            <div className="relative">
              <Lock size={14} className={iconCls} style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder={isEdit ? 'Kosongkan jika tidak diubah' : 'Minimal 8 karakter'}
                className={inputCls}
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button
            onClick={handleSubmit}
            disabled={!form.fullName.trim() || !form.username.trim() || !form.email.trim() || mutation.isPending}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : isEdit ? 'Simpan Perubahan' : 'Tambah User'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserFormModal;
