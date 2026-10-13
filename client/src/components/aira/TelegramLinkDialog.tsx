import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { LOCALE } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CopyButton } from '@/pages/settings/aira/CopyButton';
import { useReturnFocus } from '@/hooks/useReturnFocus';

interface TelegramLink {
  linkCode: string;
  expiresAt: string;
  bot: string | null;
  deepLink: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** One-time code that ties the user's Telegram account to the AIRA bot; opened from the user menu. */
export function TelegramLinkDialog({ isOpen, onClose }: Props) {
  const returnFocus = useReturnFocus();
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm" onOpenAutoFocus={returnFocus.capture} onCloseAutoFocus={returnFocus.onCloseAutoFocus}>
        {/* Unmounts when closed: every opening asks for a fresh code. */}
        <LinkBody onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

/** Server message: `{ error: <sentence> }` from handleRouteError, `{ error: code, message }` from 429. */
function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.error === 'string' && data.error.includes(' ')) return data.error;
  return fallback;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function LinkBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('shell');
  const now = useNow(5_000);
  const create = useMutation({
    mutationFn: async () => (await api.post<TelegramLink>('/ai/chat/telegram-link')).data,
  });
  const { mutate } = create;
  useEffect(() => {
    mutate();
  }, [mutate]);

  const link = create.data;
  const expired = !!link && new Date(link.expiresAt).getTime() <= now;
  const until = link ? new Date(link.expiresAt).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : '';
  const command = link ? `/link ${link.linkCode}` : '';

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('telegramLink.title')}</DialogTitle>
        <DialogDescription>{t('telegramLink.description')}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4" aria-live="polite">
        {create.isPending && <p className="text-sm text-muted-foreground">{t('telegramLink.creating')}</p>}
        {create.isError && (
          <p role="alert" className="text-sm text-danger-text">
            {errorMessage(create.error, t('telegramLink.failed'))}
          </p>
        )}
        {link && (
          <>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-4 py-3">
              <span
                className={`font-mono text-2xl font-semibold tracking-[0.2em] ${expired ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                aria-label={t('telegramLink.codeLabel', { code: link.linkCode.split('').join(' ') })}
              >
                {link.linkCode}
              </span>
              {!expired && <CopyButton value={command} what={t('telegramLink.command')} size="icon-sm" />}
            </div>
            <p className={`text-xs ${expired ? 'text-danger-text' : 'text-muted-foreground'}`}>
              {expired ? t('telegramLink.expired') : t('telegramLink.validUntil', { time: until })}
            </p>
            {!expired && (
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground">
                <li>{link.bot ? t('telegramLink.stepOpenBot', { bot: link.bot }) : t('telegramLink.stepOpenAnyBot')}</li>
                <li>{t('telegramLink.stepSend', { command })}</li>
              </ol>
            )}
          </>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('telegramLink.close')}
        </Button>
        {link && !expired && link.deepLink ? (
          <Button asChild>
            <a href={link.deepLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden />
              {t('telegramLink.openTelegram')}
            </a>
          </Button>
        ) : (
          (expired || create.isError) && (
            <Button type="button" onClick={() => mutate()} loading={create.isPending}>
              <RefreshCw aria-hidden />
              {t('telegramLink.newCode')}
            </Button>
          )
        )}
      </DialogFooter>
    </>
  );
}
