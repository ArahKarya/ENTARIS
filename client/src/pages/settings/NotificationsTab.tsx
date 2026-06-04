import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../../lib/api';
import { Loader2, Send, Save, ToggleLeft, ToggleRight } from 'lucide-react';

interface TelegramConfig {
  enabled: boolean;
  chatId: string;
  hasToken: boolean;
  notifyApproval: boolean;
  notifyInvoiceOverdue: boolean;
  notifyLowStock: boolean;
}

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }> = ({ checked, onChange, label, desc }) => (
  <button type="button" onClick={() => onChange(!checked)} className="flex items-start gap-3 w-full text-left py-2">
    {checked ? <ToggleRight className="w-9 h-9 text-blue-600 flex-shrink-0" /> : <ToggleLeft className="w-9 h-9 text-gray-300 flex-shrink-0" />}
    <span>
      <span className="block text-sm font-medium text-gray-800">{label}</span>
      {desc && <span className="block text-xs text-gray-500">{desc}</span>}
    </span>
  </button>
);

export const NotificationsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<TelegramConfig>({
    queryKey: ['telegram-config'],
    queryFn: async () => { const r = await api.get('/telegram/config'); return r.data; },
  });

  const [form, setForm] = useState<TelegramConfig & { botToken: string }>({
    enabled: false, chatId: '', hasToken: false, botToken: '',
    notifyApproval: true, notifyInvoiceOverdue: true, notifyLowStock: true,
  });

  useEffect(() => {
    if (data) setForm((f) => ({ ...f, ...data, botToken: '' }));
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        enabled: form.enabled,
        chatId: form.chatId,
        notifyApproval: form.notifyApproval,
        notifyInvoiceOverdue: form.notifyInvoiceOverdue,
        notifyLowStock: form.notifyLowStock,
      };
      if (form.botToken.trim()) payload.botToken = form.botToken.trim();
      return api.put('/telegram/config', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-config'] });
      setForm((f) => ({ ...f, botToken: '' }));
      toast.success('Konfigurasi Telegram disimpan.');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal menyimpan.'),
  });

  const testMut = useMutation({
    mutationFn: async () => api.post('/telegram/test', {
      ...(form.botToken.trim() ? { botToken: form.botToken.trim() } : {}),
      ...(form.chatId.trim() ? { chatId: form.chatId.trim() } : {}),
    }),
    onSuccess: () => toast.success('Pesan uji terkirim ke Telegram. Cek grup Anda.'),
    onError: (e: any) => toast.error(e.response?.data?.error || 'Tes gagal.'),
  });

  if (isLoading) {
    return <div className="py-16 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Send className="w-5 h-5 text-blue-600" /> Notifikasi Telegram
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Kirim notifikasi sistem (approval, invoice jatuh tempo, stok rendah) ke satu grup Telegram.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <Toggle
          checked={form.enabled}
          onChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
          label="Aktifkan notifikasi Telegram"
          desc="Master switch. Jika mati, tidak ada pesan yang dikirim."
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bot Token</label>
          <input
            type="password"
            autoComplete="off"
            value={form.botToken}
            onChange={(e) => setForm((f) => ({ ...f, botToken: e.target.value }))}
            placeholder={form.hasToken ? '•••••••• (tersimpan — isi untuk ganti)' : 'mis. 123456789:ABC-DEF...'}
            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">Token tidak pernah ditampilkan kembali demi keamanan.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chat ID (grup)</label>
          <input
            type="text"
            value={form.chatId}
            onChange={(e) => setForm((f) => ({ ...f, chatId: e.target.value }))}
            placeholder="mis. -1001234567890"
            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Jenis notifikasi</p>
          <Toggle checked={form.notifyApproval} onChange={(v) => setForm((f) => ({ ...f, notifyApproval: v }))} label="Approval / Pengajuan menunggu" />
          <Toggle checked={form.notifyInvoiceOverdue} onChange={(v) => setForm((f) => ({ ...f, notifyInvoiceOverdue: v }))} label="Invoice jatuh tempo" />
          <Toggle checked={form.notifyLowStock} onChange={(v) => setForm((f) => ({ ...f, notifyLowStock: v }))} label="Stok rendah" />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-primary text-sm">
            <Save className="w-4 h-4" /> {saveMut.isPending ? 'Menyimpan…' : 'Simpan'}
          </button>
          <button onClick={() => testMut.mutate()} disabled={testMut.isPending} className="btn-secondary text-sm">
            <Send className="w-4 h-4" /> {testMut.isPending ? 'Mengirim…' : 'Tes Koneksi'}
          </button>
        </div>
      </div>

      <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 text-sm text-gray-600 space-y-1.5">
        <p className="font-medium text-gray-800">Cara setup singkat:</p>
        <ol className="list-decimal ml-5 space-y-1 text-xs">
          <li>Buka <b>@BotFather</b> di Telegram → <code>/newbot</code> → ikuti langkah → dapat <b>Bot Token</b>.</li>
          <li>Buat grup, tambahkan bot tadi ke grup (jadikan admin agar bisa kirim).</li>
          <li>Kirim 1 pesan di grup, lalu dapatkan <b>Chat ID</b> grup (mis. via <b>@userinfobot</b> / <b>@getidsbot</b>, atau buka <code>https://api.telegram.org/bot&lt;token&gt;/getUpdates</code> dan ambil <code>chat.id</code> yang diawali <code>-100…</code>).</li>
          <li>Isi Token &amp; Chat ID di atas → <b>Simpan</b> → <b>Tes Koneksi</b>.</li>
        </ol>
      </div>
    </div>
  );
};

export default NotificationsTab;
