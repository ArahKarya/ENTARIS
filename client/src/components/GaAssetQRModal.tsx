import React, { useMemo, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { X, Copy, Download, Printer, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface AssetForQr {
  code: string;
  name: string;
  qr?: { qrCode?: string | null } | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  asset: AssetForQr | null;
}

// QR per-aset GA. QR meng-encode URL publik info aset
// (/aset/<qrCode>) yang resolve ke endpoint publik /api/ga/public/<qrCode>.
const GaAssetQRModal: React.FC<Props> = ({ isOpen, onClose, asset }) => {
  useBodyScrollLock(isOpen);
  const [copied, setCopied] = React.useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const qrCode = asset?.qr?.qrCode ?? null;

  const url = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return qrCode ? `${origin}/aset/${qrCode}` : '';
  }, [qrCode]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link disalin.');
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
    link.download = `qr-${asset?.code ?? 'aset'}.png`;
    link.href = dataUrl;
    link.click();
  };

  const handlePrint = () => {
    const canvas = canvasRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      toast.error('QR belum siap. Coba lagi.');
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    const w = window.open('', '_blank', 'width=420,height=560');
    if (!w) {
      toast.error('Popup diblokir. Izinkan popup untuk mencetak.');
      return;
    }
    w.document.write(`<!DOCTYPE html><html><head><title>QR ${asset?.code ?? ''}</title>
      <style>
        body{font-family:system-ui,sans-serif;text-align:center;margin:0;padding:24px;color:#111}
        .code{font-size:18px;font-weight:700;margin-top:12px}
        .name{font-size:13px;color:#555;margin-top:4px;max-width:300px;margin-left:auto;margin-right:auto}
        img{width:260px;height:260px;margin-top:8px}
        @media print{@page{margin:8mm}}
      </style></head><body>
      <img src="${dataUrl}" alt="QR ${asset?.code ?? ''}" />
      <div class="code">${asset?.code ?? ''}</div>
      <div class="name">${asset?.name ?? ''}</div>
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`);
    w.document.close();
  };

  if (!isOpen || !asset) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ga-qr-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rounded-xl shadow-2xl w-full max-w-md overflow-hidden bg-card border border-border">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 id="ga-qr-modal-title" className="font-semibold text-foreground">QR Aset — {asset.code}</h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!qrCode ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
              Aset ini belum punya kode QR. Hubungi admin untuk generate ulang.
            </div>
          ) : (
            <>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{asset.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Scan untuk lihat info aset</p>
              </div>

              <div className="flex flex-col items-center gap-3 py-4 bg-white rounded-lg border border-border">
                <div ref={canvasRef} className="bg-white p-3 rounded">
                  <QRCodeCanvas
                    value={url}
                    size={240}
                    level="M"
                    includeMargin={false}
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                  />
                </div>
                <p className="text-[11px] text-gray-500 text-center px-4 break-all font-mono">{url}</p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-foreground bg-card border border-border hover:bg-accent rounded-lg transition-colors"
                >
                  {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  {copied ? 'Tersalin' : 'Salin'}
                </button>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-foreground bg-card border border-border hover:bg-accent rounded-lg transition-colors"
                >
                  <Download size={14} /> PNG
                </button>
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
                >
                  <Printer size={14} /> Cetak
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[11px] text-blue-900 leading-relaxed">
                <strong>Tip:</strong> Cetak QR lalu tempel di aset fisik. Scan dengan HP untuk lihat kode, nama, kategori, status & kondisi aset.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GaAssetQRModal;
