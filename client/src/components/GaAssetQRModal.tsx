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
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

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
    // Asset code/name are user-entered: escape before writing into the print window.
    const code = escapeHtml(asset?.code ?? '');
    const name = escapeHtml(asset?.name ?? '');
    w.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>QR ${code}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;margin:0;padding:24px;color:#1B2B48;background:#fff;display:flex;justify-content:center}
        .label{width:300px;border:1px solid #CBD5E1;border-radius:12px;padding:16px 16px 14px;text-align:center}
        img{display:block;width:240px;height:240px;margin:0 auto}
        .code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:17px;font-weight:700;letter-spacing:.02em;margin-top:12px}
        .name{font-size:12px;color:#46546B;margin-top:4px;line-height:1.35;overflow-wrap:anywhere}
        .hint{font-size:10px;color:#46546B;margin-top:10px;padding-top:8px;border-top:1px solid #E2E8F0}
        @media print{@page{margin:8mm}body{padding:0}.label{break-inside:avoid}}
      </style></head><body>
      <div class="label">
        <img src="${dataUrl}" alt="QR ${code}" />
        <div class="code">${code}</div>
        <div class="name">${name}</div>
        <div class="hint">Pindai untuk melihat info aset</div>
      </div>
      </body></html>`);
    w.document.close();
    // Print from the opener: an inline <script> in the popup is blocked by the
    // production CSP (script-src 'self'). The QR is a data: URL, so it is ready
    // once the image has decoded.
    const img = w.document.querySelector('img');
    const print = () => {
      w.focus();
      w.print();
    };
    if (img && !img.complete) img.addEventListener('load', print, { once: true });
    else print();
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
