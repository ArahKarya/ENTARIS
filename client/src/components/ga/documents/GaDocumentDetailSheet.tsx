/**
 * Detail sheet of one GA document (?doc=<id>): fields, expiry state and the
 * full version history (GET /ga/documents/:id) with a download per version.
 * Write actions are passed in by the page, which owns the permission checks.
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, FileUp, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EmptyState, StatusBadge } from '@/components/shared';
import { ExpiryStateLine } from './ExpiryDate';
import { useTranslation } from 'react-i18next';
import {
  DOCUMENTS_ENDPOINT,
  GA_DOCUMENTS_KEY,
  deriveExpiryState,
  downloadVersion,
  formatFileSize,
  type GaDocumentRow,
} from './ga-document-model';

interface GaDocumentDetailSheetProps {
  docId: string | null;
  onClose: () => void;
  onEdit?: (doc: GaDocumentRow) => void;
  onUpload?: (doc: GaDocumentRow) => void;
  onDelete?: (doc: GaDocumentRow) => void;
}

function Detail({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 min-w-0' : 'min-w-0'}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function GaDocumentDetailSheet({ docId, onClose, onEdit, onUpload, onDelete }: GaDocumentDetailSheetProps) {
  const { t } = useTranslation('eam');
  const q = useQuery({
    queryKey: [GA_DOCUMENTS_KEY, 'detail', docId],
    queryFn: async () => (await api.get<GaDocumentRow>(`${DOCUMENTS_ENDPOINT}/${docId}`)).data,
    enabled: !!docId,
  });
  const doc = q.data;
  const versions = doc?.versions ?? [];
  const latestNo = versions[0]?.versionNo;

  return (
    <Sheet open={docId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="md">
        {q.isLoading && (
          <>
            <SheetHeader>
              <SheetTitle>{t('gaDocuments.detail.loading')}</SheetTitle>
              <SheetDescription className="sr-only">{t('gaDocuments.detail.loadingSr')}</SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-3" aria-busy>
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </SheetBody>
          </>
        )}

        {q.isError && (
          <>
            <SheetHeader>
              <SheetTitle>{t('gaDocuments.detail.document')}</SheetTitle>
              <SheetDescription className="sr-only">{t('gaDocuments.detail.errorSr')}</SheetDescription>
            </SheetHeader>
            <SheetBody>
              <EmptyState
                kind="error"
                title={
                  (q.error as { response?: { status?: number } })?.response?.status === 404
                    ? t('gaDocuments.detail.notFound')
                    : undefined
                }
                action={
                  <Button variant="outline" size="sm" onClick={() => q.refetch()}>
                    <RotateCcw aria-hidden />
                    {t('gaDocuments.detail.retry')}
                  </Button>
                }
              />
            </SheetBody>
          </>
        )}

        {doc && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="num font-mono">{doc.code}</SheetTitle>
                <StatusBadge status={doc.status} docType="ga_document" />
              </div>
              <SheetDescription>{doc.title}</SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-6">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Detail label={t('gaDocuments.detail.type')}>{doc.type?.name ?? '—'}</Detail>
                <Detail label={t('gaDocuments.detail.asset')}>{doc.asset ? `${doc.asset.code} · ${doc.asset.name}` : '—'}</Detail>
                <Detail label={t('gaDocuments.detail.issuedBy')}>{doc.issuedBy || '—'}</Detail>
                <Detail label={t('gaDocuments.detail.issuedNumber')}>
                  {doc.issuedNumber ? <span className="num font-mono">{doc.issuedNumber}</span> : '—'}
                </Detail>
                <Detail label={t('gaDocuments.detail.effectiveDate')}>
                  <span className="num">{doc.effectiveDate ? formatDate(doc.effectiveDate) : '—'}</span>
                </Detail>
                <Detail label={t('gaDocuments.detail.expiryDate')}>
                  <span className="num">{doc.expiryDate ? formatDate(doc.expiryDate) : t('gaDocuments.detail.noLimit')}</span>
                </Detail>
                <Detail label={t('gaDocuments.detail.validity')} wide>
                  <ExpiryStateLine date={doc.expiryDate} state={deriveExpiryState(doc)} />
                </Detail>
              </dl>

              <section aria-labelledby="ga-doc-versions">
                <div className="flex items-center justify-between gap-2">
                  <h3 id="ga-doc-versions" className="text-sm font-semibold text-foreground">
                    {t('gaDocuments.detail.versions')}
                  </h3>
                  {onUpload && (
                    <Button variant="outline" size="sm" onClick={() => onUpload(doc)}>
                      <FileUp aria-hidden />
                      {t('gaDocuments.detail.uploadVersion')}
                    </Button>
                  )}
                </div>
                {versions.length === 0 ? (
                  <EmptyState
                    compact
                    icon={FileText}
                    title={t('gaDocuments.detail.noFile')}
                    description={t('gaDocuments.detail.noFileDescription')}
                    className="mt-2"
                  />
                ) : (
                  <ol className="mt-2 space-y-2">
                    {versions.map((v) => (
                      <li key={v.id} className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
                        <div className="min-w-0 space-y-0.5 text-sm">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="num font-medium text-foreground">{t('gaDocuments.detail.version', { version: v.versionNo })}</span>
                            {v.versionNo === latestNo && <StatusBadge status="latest" label={t('gaDocuments.detail.latest')} tone="primary" dot={false} />}
                          </p>
                          <p className="num text-xs text-muted-foreground">
                            {v.createdAt ? formatDateTime(v.createdAt) : '—'} · {formatFileSize(v.fileSize)}
                          </p>
                          {v.notes && <p className="text-xs break-words text-muted-foreground">{v.notes}</p>}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground"
                          aria-label={t('gaDocuments.detail.downloadVersion', { version: v.versionNo })}
                          onClick={() => downloadVersion(doc, v)}
                        >
                          <Download aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </SheetBody>

            {(onEdit || onDelete) && (
              <SheetFooter>
                {onDelete && (
                  <Button variant="outline" className="text-danger-text" onClick={() => onDelete(doc)}>
                    <Trash2 aria-hidden />
                    {t('shared.delete')}
                  </Button>
                )}
                {onEdit && (
                  <Button onClick={() => onEdit(doc)}>
                    <Pencil aria-hidden />
                    {t('gaDocuments.detail.edit')}
                  </Button>
                )}
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
