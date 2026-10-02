import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { X, Truck, User, Loader2, XCircle, FileDown, Pencil, Link2 } from 'lucide-react';
import api from '../lib/api';
import { formatDate } from '../lib/formatters';
import { ConfirmDialog } from './ConfirmDialog';
import DeliveryOrderPDF from '../lib/pdf/DeliveryOrderPDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';
import TemporaryDeliveryNoteModal from './TemporaryDeliveryNoteModal';
import { can, cap } from '../lib/permissions';

interface Props { noteId: string | null; onClose: () => void }

export const SJS_STATUS: Record<string, { label: string; badge: string }> = {
  Open: { label: 'Terbuka', badge: 'badge badge-amber' },
  Linked: { label: 'Tertaut', badge: 'badge badge-green' },
  Cancelled: { label: 'Dibatalkan', badge: 'badge badge-red' },
};

const TemporaryDeliveryNoteDrawer: React.FC<Props> = ({ noteId, onClose }) => {
  const company = useCompanyPDF();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDoId, setLinkDoId] = useState('');
  const canCancel = cap('doc.cancel');
  const canEdit = can('delivery_order', 'edit');

  const { data: note, isLoading } = useQuery({
    queryKey: ['temporary-delivery-note-detail', noteId],
    queryFn: async () => (await api.get(`/temporary-delivery-notes/${noteId}`)).data,
    enabled: !!noteId,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/temporary-delivery-notes/${noteId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-notes'] });
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-notes-summary'] });
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-note-detail', noteId] });
      toast.success('Surat jalan sementara dibatalkan.');
      setConfirmCancel(false);
    },
    onError: (e: any) => { toast.error(e?.response?.data?.error || 'Gagal membatalkan.'); setConfirmCancel(false); },
  });

  // DO resmi aktif (Submitted, belum Cancelled) milik pelanggan yang sama
  const { data: doCandidates } = useQuery({
    queryKey: ['sjs-link-do-candidates', note?.partyId],
    queryFn: async () => {
      const res = await api.get(`/delivery-orders?partyId=${note.partyId}&status=Submitted&limit=100`);
      return (res.data.data ?? []) as any[];
    },
    enabled: linkOpen && !!note?.partyId,
  });

  const linkMutation = useMutation({
    mutationFn: () => api.post(`/temporary-delivery-notes/${noteId}/link`, { deliveryOrderId: linkDoId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-notes'] });
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-notes-summary'] });
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-note-detail', noteId] });
      toast.success('Surat jalan sementara ditautkan ke surat jalan resmi.');
      setLinkOpen(false); setLinkDoId('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Gagal menautkan.'),
  });

  if (!noteId) return null;
  const sc = SJS_STATUS[note?.status] ?? SJS_STATUS.Open;
  const isOpen = note?.status === 'Open';

  const pdfDoc = note ? (
    <DeliveryOrderPDF
      title="SURAT JALAN SEMENTARA"
      footnote="Dokumen sementara — bukan dokumen resmi penagihan. Akan ditautkan ke surat jalan resmi."
      doNumber={note.number}
      date={note.date}
      status={note.status}
      customer={{ name: note.customerName ?? '—' }}
      nomorMobil={note.nomorMobil}
      driverName={note.driverName}
      recipientName={note.recipientName}
      notes={note.notes}
      items={(note.items ?? []).map((it: any) => ({ code: null, name: it.itemName, qty: Number(it.quantity), unit: it.unit, description: it.description }))}
      company={{ name: company.name, address: company.address, phone: company.phone, email: company.email, taxId: company.taxId, logoUrl: company.logoUrl }}
    />
  ) : null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <Truck size={16} className="text-amber-600" />
              <h2 className="text-base font-semibold text-gray-900">{note?.number ?? 'Surat Jalan Sementara'}</h2>
              {note && <span className={sc.badge}>{sc.label}</span>}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Dokumen sementara — tanpa stok, tanpa jurnal</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100" aria-label="Tutup"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>
          ) : !note ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Surat jalan sementara tidak ditemukan.</div>
          ) : (
            <>
              <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-100">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><User size={10} /> Pelanggan</p>
                  <p className="text-sm font-semibold text-gray-900">{note.customerName}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-gray-400">Tanggal</p><p className="text-xs font-medium text-gray-800">{formatDate(note.date)}</p></div>
                  <div><p className="text-xs text-gray-400">No. Mobil</p><p className="text-xs font-medium font-mono uppercase text-gray-800">{note.nomorMobil || '—'}</p></div>
                  <div><p className="text-xs text-gray-400">Supir</p><p className="text-xs font-medium text-gray-800">{note.driverName || '—'}</p></div>
                  <div><p className="text-xs text-gray-400">Penerima</p><p className="text-xs font-medium text-gray-800">{note.recipientName || '—'}</p></div>
                </div>
              </div>

              {note.status === 'Linked' && (
                <div className="px-6 py-3 border-b border-gray-100 bg-green-50/40 flex items-center gap-2 text-xs text-gray-700">
                  <Link2 size={14} className="text-green-600" />
                  Sudah ditautkan ke surat jalan resmi <b className="font-mono">{note.doNumber}</b>
                  {note.linkedAt && <span className="text-gray-400"> · {formatDate(note.linkedAt)}</span>}
                </div>
              )}
              {isOpen && (
                <div className="px-6 py-3 border-b border-gray-100 bg-amber-50/60 text-xs text-amber-800">
                  Belum ditautkan. Setelah produksi diinput, buat surat jalan resmi dan pilih surat jalan sementara ini di bagian <b>Tautkan Surat Jalan Sementara</b>.
                </div>
              )}

              <div className="px-6 py-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Barang</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-gray-400 border-b"><th className="text-left py-1.5">Nama</th><th className="text-right">Qty</th><th className="text-left pl-2">Sat</th></tr></thead>
                  <tbody>
                    {note.items.map((it: any) => (
                      <tr key={it.id} className="border-b border-gray-50">
                        <td className="py-1.5">{it.itemName}{it.description ? <span className="block text-xs text-gray-400">{it.description}</span> : null}</td>
                        <td className="text-right font-medium">{Number(it.quantity).toLocaleString('id-ID', { maximumFractionDigits: 3 })}</td>
                        <td className="pl-2 text-gray-500">{it.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {note.notes && <p className="text-xs text-gray-500 mt-3"><b>Catatan:</b> {note.notes}</p>}
              </div>
            </>
          )}
        </div>

        {note && (
          <div className="flex flex-wrap items-center gap-2 px-6 py-4 border-t border-gray-100">
            {pdfDoc && (
              <PDFDownloadLink document={pdfDoc} fileName={`${note.number}.pdf`}>
                {({ loading }: { loading: boolean }) => (
                  <span className="btn-secondary cursor-pointer inline-flex items-center gap-1.5">
                    <FileDown size={14} /> {loading ? 'Membuat...' : 'Cetak PDF'}
                  </span>
                )}
              </PDFDownloadLink>
            )}
            {isOpen && canEdit && (
              <button className="btn-secondary inline-flex items-center gap-1.5" onClick={() => setLinkOpen(true)}><Link2 size={14} /> Tautkan ke DO</button>
            )}
            {isOpen && canEdit && (
              <button className="btn-secondary inline-flex items-center gap-1.5" onClick={() => setEditOpen(true)}><Pencil size={14} /> Ubah</button>
            )}
            {isOpen && canCancel && (
              <button className="btn-secondary text-red-600 inline-flex items-center gap-1.5" onClick={() => setConfirmCancel(true)}><XCircle size={14} /> Batalkan</button>
            )}
          </div>
        )}
      </aside>

      {linkOpen && note && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-3">
            <h3 className="text-base font-semibold text-gray-900">Tautkan {note.number} ke surat jalan resmi</h3>
            <p className="text-xs text-gray-500">
              Pilih surat jalan resmi milik <b>{note.customerName}</b> yang sudah dibuat. Hanya mengubah status SJS, tidak menyentuh stok atau jurnal.
            </p>
            <select
              value={linkDoId} onChange={(e) => setLinkDoId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— pilih surat jalan resmi —</option>
              {(doCandidates ?? []).map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.doNumber} · {formatDate(d.date)}{d.nomorMobil ? ` · ${String(d.nomorMobil).toUpperCase()}` : ''}
                </option>
              ))}
            </select>
            {doCandidates && doCandidates.length === 0 && (
              <p className="text-xs text-amber-700">Belum ada surat jalan resmi aktif untuk pelanggan ini.</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-secondary" onClick={() => { setLinkOpen(false); setLinkDoId(''); }}>Batal</button>
              <button className="btn-primary" disabled={!linkDoId || linkMutation.isPending} onClick={() => linkMutation.mutate()}>
                {linkMutation.isPending && <Loader2 size={14} className="animate-spin" />} Tautkan
              </button>
            </div>
          </div>
        </div>
      )}
      {editOpen && note && <TemporaryDeliveryNoteModal editNote={note} onClose={() => { setEditOpen(false); queryClient.invalidateQueries({ queryKey: ['temporary-delivery-note-detail', noteId] }); }} />}
      <ConfirmDialog
        open={confirmCancel}
        title="Batalkan surat jalan sementara?"
        message="Dokumen akan ditandai Dibatalkan. Tidak ada stok atau jurnal yang terpengaruh."
        confirmLabel="Batalkan"
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  );
};

export default TemporaryDeliveryNoteDrawer;
