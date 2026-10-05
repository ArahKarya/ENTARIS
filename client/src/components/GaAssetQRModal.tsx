import React, { useMemo, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Copy, Download, Printer, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

  if (!asset) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>QR Aset — {asset.code}</DialogTitle>
          <DialogDescription>{asset.name}. Pindai untuk melihat info aset.</DialogDescription>
        </DialogHeader>

        {!qrCode ? (
          <div role="status" className="rounded-lg border border-warning/40 bg-warning-subtle p-4 text-sm text-warning-text">
            Aset ini belum punya kode QR. Hubungi admin untuk generate ulang.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* The QR keeps a literal white card + dark modules in both themes: scanners need the contrast. */}
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-white py-4">
              <div ref={canvasRef} className="rounded bg-white p-3">
                <QRCodeCanvas
                  value={url}
                  size={240}
                  level="M"
                  includeMargin={false}
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                  role="img"
                  aria-label={`Kode QR aset ${asset.code}`}
                />
              </div>
              <p className="break-all px-4 text-center font-mono text-[11px] text-slate-600">{url}</p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button variant="outline" onClick={handleCopy}>
                {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
                {copied ? 'Tersalin' : 'Salin'}
              </Button>
              <Button variant="outline" onClick={handleDownload}>
                <Download aria-hidden /> PNG
              </Button>
              <Button onClick={handlePrint}>
                <Printer aria-hidden /> Cetak
              </Button>
            </div>

            <div className="rounded-lg border border-info/30 bg-info-subtle p-3 text-xs leading-relaxed text-info-text">
              <strong>Tip:</strong> Cetak QR lalu tempel di aset fisik. Scan dengan HP untuk lihat kode, nama, kategori, status & kondisi aset.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GaAssetQRModal;
