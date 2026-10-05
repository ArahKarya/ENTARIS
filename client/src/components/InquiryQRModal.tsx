import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Copy, Download, Share2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/shared';
import { OverlayBody, OverlayFooter, OverlayHeader } from './sales/dialog-parts-b';
import { dialogShellClass } from './sales/dialog-classes-b';

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

const NO_SRC = '__none';

const InquiryQRModal: React.FC<Props> = ({ isOpen, onClose }) => {
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" className={dialogShellClass}>
        <OverlayHeader>
          <DialogTitle>QR Form Inquiry</DialogTitle>
          <DialogDescription>Bagikan form tanya harga agar calon pelanggan bisa mengirim inquiry sendiri.</DialogDescription>
        </OverlayHeader>

        <OverlayBody>
          <Field label="Tracking sumber (opsional)" hint="Setiap inquiry yang masuk dari QR ini akan otomatis di-tag dengan channel terkait.">
            {(control) => (
              <Select value={src || NO_SRC} onValueChange={(v) => setSrc(v === NO_SRC ? '' : v)}>
                <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SRC_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value || NO_SRC} value={opt.value || NO_SRC}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          {/* QR codes need a light, high-contrast surface to scan reliably in dark mode too. */}
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-white py-4">
            <div ref={canvasRef} className="rounded bg-white p-3">
              <QRCodeCanvas
                value={url}
                size={240}
                level="M"
                includeMargin={false}
                bgColor="#ffffff"
                fgColor="#374151"
                role="img"
                aria-label={`Kode QR menuju ${url}`}
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </div>
            <p className="break-all px-4 text-center font-mono text-[11px] text-neutral-600">{url}</p>
          </div>

          <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            <Button type="button" variant="outline" onClick={handleCopy} className="min-h-11 sm:min-h-9">
              {copied ? <Check className="text-success-text" aria-hidden /> : <Copy aria-hidden />}
              {copied ? 'Tersalin' : 'Salin Link'}
            </Button>
            <Button type="button" variant="outline" onClick={handleDownload} className="min-h-11 sm:min-h-9">
              <Download aria-hidden /> Unduh PNG
            </Button>
            <Button type="button" variant="outline" onClick={handleShareWA} className="min-h-11 sm:min-h-9">
              <Share2 aria-hidden /> Kirim via WA
            </Button>
            <Button type="button" onClick={handleNativeShare} className="min-h-11 sm:min-h-9">
              <Share2 aria-hidden /> Bagikan
            </Button>
          </div>

          <div className="rounded-lg bg-info-subtle p-3 text-xs leading-relaxed text-info-text">
            <strong>Tip:</strong> Cetak QR untuk display di toko, kartu nama, atau brosur. Untuk WA/IG bio, salin link saja. Customer scan/klik → buka form, tim sales langsung dapat notifikasi inquiry baru.
          </div>
        </OverlayBody>

        <OverlayFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Tutup</Button>
        </OverlayFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InquiryQRModal;
