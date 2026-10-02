import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { X, Loader2, AlertCircle, Lock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.put('/users/me/password', data),
    onSuccess: () => {
      toast.success('Password berhasil diubah.');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal mengubah password.'),
  });

  const handleSubmit = () => {
    setError('');
    if (!currentPassword) { setError('Password saat ini wajib diisi.'); return; }
    if (!newPassword) { setError('Password baru wajib diisi.'); return; }
    if (newPassword.length < 8) { setError('Password baru minimal 8 karakter.'); return; }
    if (newPassword !== confirmPassword) { setError('Konfirmasi password tidak cocok.'); return; }

    mutation.mutate({ currentPassword, newPassword });
  };

  if (!isOpen) return null;

  const inputCls = 'w-full border rounded-lg py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400';
  const iconCls = 'absolute left-3 top-1/2 -translate-y-1/2';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}
    >
      <div
        className="rounded-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-md shadow-2xl flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h2 id="password-modal-title" className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Ganti Password
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Ubah password akun Anda
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" style={{ color: 'var(--color-text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Current Password */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Password Saat Ini <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Lock size={14} className={iconCls} style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Masukkan password saat ini"
                className={inputCls}
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Password Baru <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Lock size={14} className={iconCls} style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                className={inputCls}
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Konfirmasi Password Baru <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              {confirmPassword && confirmPassword === newPassword ? (
                <CheckCircle2 size={14} className={iconCls} style={{ color: '#22c55e' }} />
              ) : (
                <Lock size={14} className={iconCls} style={{ color: 'var(--color-text-muted)' }} />
              )}
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password baru"
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
            disabled={!currentPassword || !newPassword || !confirmPassword || mutation.isPending}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Ubah Password'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangePasswordModal;
