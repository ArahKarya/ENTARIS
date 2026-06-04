import { useState, useRef, useEffect } from 'react';
import { Plus, Search, MoreHorizontal, Users, Loader2, Shield, ShieldCheck, Eye, Pencil, ToggleLeft, ToggleRight, Send, Link2Off, X, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { formatDate } from '../lib/formatters';
import UserFormModal from '../components/UserFormModal';

interface UserData {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  telegramLinked?: boolean;
}

export const UserManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserData | null>(null);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [linkInfo, setLinkInfo] = useState<{ user: UserData; code: string; deepLink: string | null; botUsername: string | null } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', searchTerm],
    queryFn: async () => {
      const params: any = { limit: 200 };
      if (searchTerm.trim()) params.search = searchTerm;
      const response = await api.get('/users', { params });
      return response.data;
    },
    // Saat modal tautan terbuka, refresh berkala utk deteksi status "Tertaut".
    refetchInterval: linkInfo ? 4000 : false,
  });

  const users: UserData[] = data?.data ?? [];

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuUserId(null);
      }
    };
    if (menuUserId) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuUserId]);

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/toggle`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      const user = res.data;
      toast.success(`User ${user.fullName} ${user.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal mengubah status user.');
    },
  });

  const handleEdit = (user: UserData) => {
    setMenuUserId(null);
    setEditUser(user);
    setIsModalOpen(true);
  };

  const handleToggle = (user: UserData) => {
    setMenuUserId(null);
    toggleMutation.mutate(user.id);
  };

  const linkMutation = useMutation({
    mutationFn: (user: UserData) => api.post(`/users/${user.id}/telegram-link`).then(r => ({ user, ...r.data })),
    onSuccess: (d: any) => {
      setLinkInfo({ user: d.user, code: d.code, deepLink: d.deepLink, botUsername: d.botUsername });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membuat kode tautan.'),
  });

  const unlinkMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}/telegram`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('Tautan Telegram diputus.'); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal memutus tautan.'),
  });

  const handleTelegramLink = (user: UserData) => { setMenuUserId(null); linkMutation.mutate(user); };

  const testMutation = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/telegram-test`),
    onSuccess: (res: any) => toast.success(res.data?.message || 'Pesan uji terkirim.'),
    onError: (err: any) => toast.error(err.response?.data?.error || 'Tes gagal.'),
  });

  // Status tertaut terkini utk user di modal (dari refetch berkala).
  const linkUserLive = linkInfo ? users.find(u => u.id === linkInfo.user.id) : null;

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditUser(null);
  };

  // Stats
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.isActive).length;
  const adminUsers = users.filter(u => u.role === 'Admin').length;

  const roleBadge = (role: string) => {
    switch (role) {
      case 'Admin':
        return <span className="badge badge-blue gap-1 rounded-full text-xs font-semibold"><ShieldCheck size={10} /> Admin</span>;
      case 'Accountant':
        return <span className="badge badge-green gap-1 rounded-full text-xs font-semibold"><Shield size={10} /> Accountant</span>;
      case 'StaffProduksi':
        return <span className="badge badge-orange gap-1 rounded-full text-xs font-semibold"><Shield size={10} /> Staff Produksi</span>;
      default:
        return <span className="badge badge-gray gap-1 rounded-full text-xs font-semibold"><Eye size={10} /> Viewer</span>;
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Manajemen User</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Kelola akun pengguna aplikasi.</p>
        </div>
        <button className="btn-primary self-start" onClick={() => { setEditUser(null); setIsModalOpen(true); }}>
          <Plus size={15} /> Tambah User
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total User', value: totalUsers, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'User Aktif', value: activeUsers, color: 'text-green-600 dark:text-green-400' },
          { label: 'Admin', value: adminUsers, color: 'text-purple-600 dark:text-purple-400' },
        ].map(stat => (
          <div
            key={stat.label}
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
          >
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</p>
            <p className={cn('text-2xl font-bold mt-1 tabular-nums', stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder="Cari nama, username, atau email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          />
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
      >
        <div className="table-responsive">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Nama Lengkap</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Username</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Login Terakhir</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Telegram</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Memuat data user...</p>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Users className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Belum ada data user.</p>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className={cn(
                      'border-b transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/30',
                      !user.isActive && 'opacity-50'
                    )}
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 font-semibold text-xs flex-shrink-0">
                          {user.fullName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{user.fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>{user.username}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>{user.email}</td>
                    <td className="px-4 py-3">{roleBadge(user.role)}</td>
                    <td className="px-4 py-3">
                      {user.isActive ? (
                        <span className="badge badge-green rounded-full text-xs font-semibold">Aktif</span>
                      ) : (
                        <span className="badge badge-red rounded-full text-xs font-semibold">Nonaktif</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {user.lastLoginAt ? formatDate(user.lastLoginAt) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {user.telegramLinked
                        ? <span className="badge badge-green rounded-full text-xs font-semibold">Tertaut</span>
                        : <span className="badge badge-gray rounded-full text-xs font-semibold">Belum</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block" ref={menuUserId === user.id ? menuRef : undefined}>
                        <button
                          onClick={() => setMenuUserId(menuUserId === user.id ? null : user.id)}
                          className="p-1.5 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {menuUserId === user.id && (
                          <div
                            className="absolute right-0 top-8 z-50 w-44 border rounded-lg shadow-lg py-1 animate-in fade-in slide-in-from-top-1"
                            style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
                          >
                            <button
                              onClick={() => handleEdit(user)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                              style={{ color: 'var(--color-text-primary)' }}
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            <button
                              onClick={() => handleToggle(user)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                              style={{ color: user.isActive ? '#dc2626' : '#16a34a' }}
                            >
                              {user.isActive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                              {user.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                            <button
                              onClick={() => handleTelegramLink(user)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                              style={{ color: 'var(--color-text-primary)' }}
                            >
                              <Send size={13} /> {user.telegramLinked ? 'Tautkan Ulang Telegram' : 'Hubungkan Telegram'}
                            </button>
                            {user.telegramLinked && (
                              <button
                                onClick={() => { setMenuUserId(null); testMutation.mutate(user.id); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                                style={{ color: 'var(--color-text-primary)' }}
                              >
                                <Send size={13} /> Tes Telegram
                              </button>
                            )}
                            {user.telegramLinked && (
                              <button
                                onClick={() => { setMenuUserId(null); unlinkMutation.mutate(user.id); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                                style={{ color: '#dc2626' }}
                              >
                                <Link2Off size={13} /> Putuskan Telegram
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      <UserFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        editUser={editUser}
      />

      {/* Modal Tautan Telegram */}
      {linkInfo && (
        <div className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLinkInfo(null)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold flex items-center gap-2"><Send className="w-4 h-4 text-blue-600" /> Hubungkan Telegram — {linkInfo.user.fullName}</h2>
              <button onClick={() => setLinkInfo(null)} className="p-1.5 rounded-lg hover:bg-accent"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              {linkUserLive?.telegramLinked ? (
                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 font-medium">
                    ✅ Telegram <b>{linkInfo.user.fullName}</b> sudah tertaut. Notifikasi akan dikirim ke japri-nya.
                  </div>
                  <button onClick={() => testMutation.mutate(linkInfo.user.id)} disabled={testMutation.isPending} className="btn-secondary text-sm">
                    <Send className="w-3.5 h-3.5" /> {testMutation.isPending ? 'Mengirim…' : 'Kirim Pesan Uji'}
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-muted-foreground">Minta <b>{linkInfo.user.fullName}</b> melakukan langkah berikut di HP-nya:</p>
                  <ol className="list-decimal ml-5 space-y-1 text-xs text-muted-foreground">
                    <li>Buka link bot di bawah lalu tekan <b>Start</b> (atau kirim <code>/start {linkInfo.code}</code> ke bot).</li>
                    <li>Status akan otomatis berubah <b>Tertaut</b> dalam &lt; 1 menit.</li>
                  </ol>
                  {linkInfo.deepLink ? (
                    <div className="flex items-center gap-2">
                      <input readOnly value={linkInfo.deepLink} className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs bg-background font-mono" />
                      <button onClick={() => { navigator.clipboard.writeText(linkInfo.deepLink!); toast.success('Link disalin.'); }} className="btn-secondary text-xs"><Copy className="w-3.5 h-3.5" /> Salin</button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                      Bot belum terkonfigurasi / token belum diisi. Atur dulu di <b>Pengaturan → Notifikasi</b>. Kode tautan: <code className="font-mono">{linkInfo.code}</code>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Menunggu staf menekan Start… (jendela ini akan memperbarui status otomatis)</p>
                </>
              )}
            </div>
            <div className="flex justify-end px-5 py-3 border-t border-border">
              <button onClick={() => setLinkInfo(null)} className="btn-secondary text-sm">Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
