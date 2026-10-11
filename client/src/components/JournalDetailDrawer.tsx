import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileText, Calendar, User, Paperclip, Image as ImageIcon, Download } from 'lucide-react';
import api from '../lib/api';
import { formatRupiah, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { LoadingState, StatusBadge } from '@/components/shared';

interface Props {
  journalEntryId: string | null;
  onClose: () => void;
}

const JournalDetailDrawer: React.FC<Props> = ({ journalEntryId, onClose }) => {
  const { t } = useTranslation('finance');
  const { data: journal, isLoading } = useQuery({
    queryKey: ['journal-detail', journalEntryId],
    queryFn: async () => {
      const res = await api.get(`/journals/${journalEntryId}`);
      return res.data;
    },
    enabled: !!journalEntryId,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['journal-attachments', journalEntryId],
    queryFn: async () => {
      const res = await api.get(`/attachments/journal/${journalEntryId}`);
      return res.data;
    },
    enabled: !!journalEntryId,
  });

  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

  return (
    <Sheet open={!!journalEntryId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="md">
        <SheetHeader>
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle>{journal?.entryNumber ?? t('journalDetailDrawer.loadingTitle')}</SheetTitle>
            {journal && (
              <StatusBadge
                status={journal.status}
                label={journal.status === 'Submitted' ? t('journalDetailDrawer.active') : undefined}
              />
            )}
          </div>
          <SheetDescription>{t('journalDetailDrawer.description')}</SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5" role="region" aria-label={t('journalDetailDrawer.bodyLabel')} tabIndex={0}>
          {isLoading ? (
            <LoadingState label={t('journalDetailDrawer.loading')} />
          ) : !journal ? (
            <p className="py-16 text-center text-sm text-muted-foreground">{t('journalDetailDrawer.notFound')}</p>
          ) : (
            <>
              <section aria-labelledby="jd-narration" className="rounded-lg border border-border p-4">
                <h3 id="jd-narration" className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  <FileText className="size-4 text-primary" aria-hidden /> {t('journalDetailDrawer.manualJournal')}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{journal.narration || '—'}</p>
              </section>

              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoItem icon={<Calendar className="size-3.5" aria-hidden />} label={t('journalDetailDrawer.date')} value={formatDate(journal.date)} />
                <InfoItem icon={<User className="size-3.5" aria-hidden />} label={t('journalDetailDrawer.createdBy')} value={journal.user?.fullName ?? '—'} />
              </dl>

              <section aria-labelledby="jd-lines">
                <h3 id="jd-lines" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('journalDetailDrawer.lines')}
                </h3>
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable at phone width */}
                <div className="overflow-x-auto rounded-lg border border-border" role="region" aria-label={t('journalDetailDrawer.linesTable')} tabIndex={0}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th scope="col" className={cn(th, 'text-left')}>{t('journalDetailDrawer.columns.account')}</th>
                        <th scope="col" className={cn(th, 'text-right')}>{t('journalDetailDrawer.columns.debit')}</th>
                        <th scope="col" className={cn(th, 'text-right')}>{t('journalDetailDrawer.columns.credit')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journal.items?.map((ji: any) => (
                        <tr key={ji.id} className="border-t border-border">
                          <td className="px-3 py-2 text-foreground">
                            <span className="font-mono text-muted-foreground">{ji.account?.accountNumber}</span>{' '}
                            {ji.account?.name}
                          </td>
                          <td className={cn('whitespace-nowrap px-3 py-2 text-right tabular-nums', Number(ji.debit) > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                            {Number(ji.debit) > 0 ? formatRupiah(Number(ji.debit)) : '—'}
                          </td>
                          <td className={cn('whitespace-nowrap px-3 py-2 text-right tabular-nums', Number(ji.credit) > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                            {Number(ji.credit) > 0 ? formatRupiah(Number(ji.credit)) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Attachments (read-only; uploaded from the source document) */}
              <section aria-labelledby="jd-attach">
                <h3 id="jd-attach" className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Paperclip className="size-3" aria-hidden /> {t('journalDetailDrawer.attachments', { count: attachments.length })}
                </h3>
                {attachments.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">{t('journalDetailDrawer.noAttachments')}</p>
                ) : (
                  <ul className="space-y-2">
                    {attachments.map((a: any) => {
                      const Icon = a.mimeType?.startsWith('image/') ? ImageIcon : FileText;
                      return (
                        <li key={a.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-foreground">{a.originalName}</p>
                            <p className="text-xs text-muted-foreground">{(a.fileSize / 1024).toFixed(0)} KB</p>
                          </div>
                          <Button asChild variant="ghost" size="icon-touch" className="md:size-9">
                            <a
                              href={`/api/attachments/file/${a.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={t('journalDetailDrawer.download', { name: a.originalName })}
                            >
                              <Download aria-hidden />
                            </a>
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export default JournalDetailDrawer;
