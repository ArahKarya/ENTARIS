// Satu pesan di panel chat: gelembung pengguna (+lampiran) atau balasan AIRA (chip tool, kartu, Markdown,
// status galat/dihentikan dengan "Coba lagi", salin).

import { useState } from 'react';
import { AlertTriangle, Check, Copy, FileText, Loader2, OctagonX, RotateCcw, User } from 'lucide-react';
import { AiraIcon } from '@/components/shell/AiraIcon';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CardPartView } from './CardParts';
import { Markdown } from './Markdown';
import { ToolChips } from './ToolChips';
import { attachmentUrl } from './chatApi';
import type { ViewMessage } from './types';

interface MessageItemProps {
  message: ViewMessage;
  /** pesan pengguna terakhir yang gagal dijawab → tombol Coba lagi di sana */
  canRetry: boolean;
  onRetry: (userMessageId: string) => void;
  /** id pesan pengguna yang memicu jawaban ini (untuk Coba lagi) */
  retryTargetId?: string;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <SimpleTooltip content={done ? 'Tersalin' : 'Salin jawaban'}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-7 text-muted-foreground"
        aria-label="Salin jawaban"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
      >
        {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </Button>
    </SimpleTooltip>
  );
}

function UserBubble({ message }: { message: ViewMessage }) {
  const att = message.attachments[0];
  const local = message.localAttachment;
  const isImage = (att?.mimeType ?? '').startsWith('image/') || !!local?.previewUrl;
  const placeholder = message.content.startsWith('Lampiran: ') && (att || local);
  return (
    <div className="flex max-w-[85%] flex-col items-end gap-1.5">
      {(att || local) && (
        <div className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-card p-1.5 text-xs text-foreground-secondary">
          {isImage ? (
            <img
              src={local?.previewUrl ?? attachmentUrl(att!.id)}
              alt={`Lampiran ${att?.fileName ?? local?.name}`}
              className="size-14 rounded-md object-cover"
            />
          ) : (
            <FileText className="size-5 shrink-0" aria-hidden />
          )}
          <span className="max-w-[10rem] truncate">{att?.fileName ?? local?.name}</span>
        </div>
      )}
      {!placeholder && (
        <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
      )}
    </div>
  );
}

export function MessageItem({ message, canRetry, onRetry, retryTargetId }: MessageItemProps) {
  if (message.role === 'user') {
    return (
      <article aria-label="Pesan Anda" className="flex justify-end gap-2.5 sm:gap-3">
        <UserBubble message={message} />
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-subtle text-neutral-text">
          <User className="size-4" aria-hidden />
        </span>
      </article>
    );
  }
  const streaming = message.status === 'streaming';
  const failed = message.status === 'error';
  const aborted = message.status === 'aborted';
  return (
    <article aria-label="Balasan AIRA" aria-busy={streaming} className="flex justify-start gap-2.5 sm:gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card">
        <AiraIcon size={18} />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <ToolChips chips={message.tools} />
        {message.content && (
          <div className="w-fit max-w-full rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2 text-sm text-card-foreground">
            <Markdown text={message.content} />
          </div>
        )}
        {streaming && !message.content && message.tools.length === 0 && (
          <div className="inline-flex rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2.5">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
            <span className="sr-only">AIRA sedang mengetik…</span>
          </div>
        )}
        {message.cards.map((c, i) => <CardPartView key={`${c.href}-${i}`} card={c} />)}
        {(failed || aborted) && (
          <div
            role={failed ? 'alert' : 'status'}
            className={cn(
              'flex w-fit max-w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm',
              failed ? 'border-danger/30 bg-danger-subtle text-danger-text' : 'border-border bg-neutral-subtle text-neutral-text',
            )}
          >
            {failed ? <AlertTriangle className="size-4 shrink-0" aria-hidden /> : <OctagonX className="size-4 shrink-0" aria-hidden />}
            <span className="break-words">{failed ? message.error || 'Jawaban gagal dibuat.' : 'Dihentikan. Teks yang sudah diterima tetap tersimpan.'}</span>
            {canRetry && retryTargetId && (
              <Button type="button" size="sm" variant="outline" onClick={() => onRetry(retryTargetId)}>
                <RotateCcw className="size-3.5" aria-hidden />
                Coba lagi
              </Button>
            )}
          </div>
        )}
        {!streaming && message.content && <div className="-ml-1"><CopyButton text={message.content} /></div>}
      </div>
    </article>
  );
}
