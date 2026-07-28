import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { X, Copy, Download, Share2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import Select from './Select';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SRC_OPTIONS = [
  { value: '', label: 'Tanpa tracking' },
  { value: 'qr-cetak', label: 'QR Cetak / Brosur' },
  { value: 'qr-toko', label: 'QR di Toko / Display' },
  { value: 'qr-kartu-nama', label: 'QR Kartu Nama' },
  { value: 'wa', label: 'WhatsApp' },
  { value: 'ig', label: 'Instagram' },
  { value: 'ref', label: 'Referral' },
];

const InquiryQRModal: React.FC<Props> = ({ isOpen, onClose }) => {
  useBodyScrollLock(isOpen);

  const [src, setSrc] = useState('qr-cetak');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Build URL: use current origin so dev and prod both work without config.
  const url = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const base = `${origin}/tanya`;
    return src ? `${base}?src=${encodeURIComponent(src)}` : base;
  }, [src]);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setSrc('qr-cetak');
    }
  }, [isOpen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link disalin ke clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Gagal menyalin. Salin manual dari kotak URL.');
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      toast.error('QR belum siap. Coba lagi.');
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `qr-tanya-${src || 'umum'}.png`;
    link.href = dataUrl;
    link.click();
  };

  const handleShareWA = () => {
    const text = encodeURIComponent(
      `Halo, untuk pertanyaan harga & ketersediaan stok, silakan isi form di:\n${url}\n\nKami akan respons dalam 1×24 jam. Terima kasih!`,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleNativeShare = async () => {
    if (!('share' in navigator)) {
      handleCopy();
      return;
    }
    try {
      await (navigator as any).share({
        title: 'Tanya Harga / Pemesanan',
        text: 'Silakan isi form pertanyaan harga di sini.',
        url,
      });
    } catch { /* user cancelled */ }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rounded-xl shadow-2xl w-full max-w-md overflow-hidden bg-card border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 id="qr-modal-title" className="font-semibold text-foreground">QR Form Inquiry</h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Tracking source */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tracking sumber (opsional)</label>
            <Select
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              className="w-full mt-1"
            >
              {SRC_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Setiap inquiry yang masuk dari QR ini akan otomatis di-tag dengan channel terkait.
            </p>
          </div>

          {/* QR canvas */}
          <div className="flex flex-col items-center gap-3 py-4 bg-white rounded-lg border border-border">
            <div ref={canvasRef} className="bg-white p-3 rounded">
              <QRCodeCanvas
                value={url}
                size={240}
                level="M"
                includeMargin={false}
                bgColor="#ffffff"
                fgColor="#374151"
              />
            </div>
            <p className="text-[11px] text-gray-500 text-center px-4 break-all font-mono">{url}</p>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-foreground bg-card border border-border hover:bg-accent rounded-lg transition-colors"
            >
              {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              {copied ? 'Tersalin' : 'Salin Link'}
            </button>
            <button
              onClick={handleDownload}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-foreground bg-card border border-border hover:bg-accent rounded-lg transition-colors"
            >
              <Download size={14} /> Unduh PNG
            </button>
            <button
              onClick={handleShareWA}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              <Share2 size={14} /> Kirim via WA
            </button>
            <button
              onClick={handleNativeShare}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Share2 size={14} /> Bagikan
            </button>
          </div>

          {/* Tip */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[11px] text-blue-900 leading-relaxed">
            <strong>Tip:</strong> Cetak QR untuk display di toko, kartu nama, atau brosur. Untuk WA/IG bio, salin link saja. Customer scan/klik → buka form, tim sales langsung dapat notifikasi inquiry baru.
          </div>
        </div>
      </div>
    </div>
  );
};

export default InquiryQRModal;
