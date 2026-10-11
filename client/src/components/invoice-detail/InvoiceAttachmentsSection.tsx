/** Invoice attachments + read-only payment attachments for InvoiceDetailDrawer. */
import { FileText, Image as ImageIcon, Paperclip, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export interface InvoiceAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface PaymentAttachmentRef extends InvoiceAttachment {
  payment: { id: string; paymentNumber: string; paymentType: string; date: string; status: string } | null;
}

interface InvoiceAttachmentsSectionProps {
  attachments: InvoiceAttachment[];
  paymentAttachments: PaymentAttachmentRef[];
  cancelled: boolean;
  onUpload: (files: File[]) => void;
  onDelete: (id: string) => void;
}

const sectionTitle = 'flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

function FileIcon({ mimeType }: { mimeType: string }) {
  return mimeType === 'application/pdf' ? (
    <FileText size={14} className="shrink-0 text-danger-text" aria-hidden />
  ) : (
    <ImageIcon size={14} className="shrink-0 text-info-text" aria-hidden />
  );
}

export function InvoiceAttachmentsSection({
  attachments,
  paymentAttachments,
  cancelled,
  onUpload,
  onDelete,
}: InvoiceAttachmentsSectionProps) {
  const { t } = useTranslation('sales');
  return (
    <div className="border-b border-border px-6 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className={sectionTitle}>
          <Paperclip size={10} aria-hidden /> {t('invoiceAttachmentsSection.title', { count: attachments.length })}
        </h3>
        {!cancelled && (
          <label className="relative flex cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-accent focus-within:ring-2 focus-within:ring-ring max-sm:min-h-11">
            + {t('invoiceAttachmentsSection.addFile')}
            <input
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              className="sr-only"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) onUpload(files);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      {attachments.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">{t('invoiceAttachmentsSection.empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2 text-xs">
              <FileIcon mimeType={a.mimeType} />
              <a
                href={`/api/attachments/file/${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate text-foreground hover:text-primary hover:underline"
              >
                {a.fileName}
              </a>
              <span className="text-muted-foreground">{(a.fileSize / 1024).toFixed(0)} KB</span>
              {!cancelled && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="max-sm:size-11"
                  aria-label={t('invoiceAttachmentsSection.remove', { name: a.fileName })}
                  onClick={() => onDelete(a.id)}
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Related: attachments from payments/deposit applications linked to this invoice */}
      {paymentAttachments.length > 0 && (
        <div className="mt-4">
          <h4 className={`${sectionTitle} mb-2 text-[11px]`}>
            <Paperclip size={10} aria-hidden /> {t('invoiceAttachmentsSection.fromPayments', { count: paymentAttachments.length })}
          </h4>
          <ul className="space-y-1.5">
            {paymentAttachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary-subtle/40 p-2 text-xs">
                <FileIcon mimeType={a.mimeType} />
                <a
                  href={`/api/attachments/file/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate text-foreground hover:text-primary hover:underline"
                  title={a.fileName}
                >
                  {a.fileName}
                </a>
                {a.payment && (
                  <span className="whitespace-nowrap rounded bg-primary-subtle px-1.5 py-0.5 text-xs font-medium text-primary-subtle-foreground">
                    {a.payment.paymentNumber}
                  </span>
                )}
                <span className="whitespace-nowrap text-muted-foreground">{(a.fileSize / 1024).toFixed(0)} KB</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs italic text-muted-foreground">
            {t('invoiceAttachmentsSection.paymentNote')}
          </p>
        </div>
      )}
    </div>
  );
}
