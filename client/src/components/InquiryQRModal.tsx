import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Copy, Download, Share2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
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

/** `value` is the ?src= tag stored with the inquiry; `labelKey` names its label under inquiryQRModal.sources. */
const SRC_OPTIONS = [
  { value: '', labelKey: 'none' },
  { value: 'qr-cetak', labelKey: 'print' },
  { value: 'qr-toko', labelKey: 'store' },
  { value: 'qr-kartu-nama', labelKey: 'businessCard' },
  { value: 'wa', labelKey: 'whatsapp' },
  { value: 'ig', labelKey: 'instagram' },
  { value: 'ref', labelKey: 'referral' },
] as const;

const NO_SRC = '__none';

const InquiryQRModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('sales');
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
      toast.success(t('inquiryQRModal.toast.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('inquiryQRModal.errors.copyFailed'));
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      toast.error(t('inquiryQRModal.errors.qrNotReady'));
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
      t('inquiryQRModal.share.whatsappMessage', { url }),
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
        title: t('inquiryQRModal.share.title'),
        text: t('inquiryQRModal.share.text'),
        url,
      });
    } catch { /* user cancelled */ }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" className={dialogShellClass}>
        <OverlayHeader>
          <DialogTitle>{t('inquiryQRModal.title')}</DialogTitle>
          <DialogDescription>{t('inquiryQRModal.description')}</DialogDescription>
        </OverlayHeader>

        <OverlayBody>
          <Field label={t('inquiryQRModal.sourceLabel')} hint={t('inquiryQRModal.sourceHint')}>
            {(control) => (
              <Select value={src || NO_SRC} onValueChange={(v) => setSrc(v === NO_SRC ? '' : v)}>
                <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SRC_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value || NO_SRC} value={opt.value || NO_SRC}>{t(`inquiryQRModal.sources.${opt.labelKey}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          {/* QR codes need a light, high-contrast surface to scan reliably in dark mode too. */}
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-[#fff] py-4">
            <div ref={canvasRef} className="rounded bg-[#fff] p-3">
              <QRCodeCanvas
                value={url}
                size={240}
                level="M"
                includeMargin={false}
                bgColor="#ffffff"
                fgColor="#374151"
                role="img"
                aria-label={t('inquiryQRModal.qrAria', { url })}
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </div>
            <p className="break-all px-4 text-center font-mono text-[11px] text-[#525252]">{url}</p>
          </div>

          <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            <Button type="button" variant="outline" onClick={handleCopy} className="min-h-11 sm:min-h-9">
              {copied ? <Check className="text-success-text" aria-hidden /> : <Copy aria-hidden />}
              {copied ? t('inquiryQRModal.actions.copied') : t('inquiryQRModal.actions.copyLink')}
            </Button>
            <Button type="button" variant="outline" onClick={handleDownload} className="min-h-11 sm:min-h-9">
              <Download aria-hidden /> {t('inquiryQRModal.actions.downloadPng')}
            </Button>
            <Button type="button" variant="outline" onClick={handleShareWA} className="min-h-11 sm:min-h-9">
              <Share2 aria-hidden /> {t('inquiryQRModal.actions.sendWhatsapp')}
            </Button>
            <Button type="button" onClick={handleNativeShare} className="min-h-11 sm:min-h-9">
              <Share2 aria-hidden /> {t('inquiryQRModal.actions.share')}
            </Button>
          </div>

          <div className="rounded-lg bg-info-subtle p-3 text-xs leading-relaxed text-info-text">
            <Trans t={t} i18nKey="inquiryQRModal.tip" components={{ strong: <strong /> }} />
          </div>
        </OverlayBody>

        <OverlayFooter>
          <Button type="button" variant="ghost" onClick={onClose}>{t('inquiryQRModal.actions.close')}</Button>
        </OverlayFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InquiryQRModal;
