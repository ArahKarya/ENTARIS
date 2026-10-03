import { useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Mail, MessageCircle, X } from 'lucide-react';
import { mailtoHref, whatsappHref } from './login-helpers';

export interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tenant contact from /api/public/branding; each button hides when empty. */
  email: string | null;
  phone: string | null;
  /** 'forgot' from the password link, 'help' from the footer. */
  reason?: 'forgot' | 'help';
}

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 focus-visible:ring-offset-(--surface)';

const contactButton =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-(--input) bg-(--surface) px-4 text-sm font-medium text-(--text) transition-colors hover:bg-(--surface-sunken) sm:w-auto sm:flex-1 ' +
  focusRing;

/**
 * "Lupa kata sandi?" / "Bantuan" dialog (Radix). Passwords are reset by the
 * tenant administrator; this only offers ways to reach them.
 */
export function HelpDialog({ open, onOpenChange, email, phone, reason = 'forgot' }: HelpDialogProps) {
  const mail = mailtoHref(email);
  const wa = whatsappHref(phone);
  const hasContact = Boolean(mail || wa);
  // The dialog is opened from plain buttons (no Dialog.Trigger), so Radix has no
  // trigger to refocus on close. Remember the opener and return focus to it.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="auth-root fixed inset-0 z-50 bg-(--overlay) motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={() => {
            returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            const opener = returnFocusRef.current;
            returnFocusRef.current = null;
            if (opener && opener.isConnected) {
              event.preventDefault();
              opener.focus();
            }
          }}
          className={
            'auth-root fixed left-1/2 top-1/2 z-[60] grid w-[calc(100vw-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 gap-4 ' +
            'rounded-xl border border-(--border) bg-(--surface) p-6 text-(--text) shadow-(--shadow-3) ' +
            'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:duration-200'
          }
        >
          <div className="flex flex-col gap-1.5 pr-8">
            <DialogPrimitive.Title className="text-lg font-semibold leading-7 text-(--text)">
              {reason === 'forgot' ? 'Lupa kata sandi?' : 'Bantuan masuk'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm leading-5 text-(--text-secondary)">
              Kata sandi hanya dapat direset oleh administrator perusahaan Anda.
              {hasContact ? ' Hubungi mereka lewat salah satu kanal di bawah.' : ' Hubungi mereka secara langsung.'}
            </DialogPrimitive.Description>
          </div>

          {hasContact && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {mail && (
                <a href={mail} className={contactButton}>
                  <Mail className="size-4" aria-hidden />
                  Email
                </a>
              )}
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className={contactButton}>
                  <MessageCircle className="size-4" aria-hidden />
                  WhatsApp
                </a>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <DialogPrimitive.Close
              className={
                'inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-(--primary) hover:bg-(--surface-sunken) ' +
                focusRing
              }
            >
              Tutup
            </DialogPrimitive.Close>
          </div>

          <DialogPrimitive.Close
            className={
              'absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-(--text-muted) hover:bg-(--surface-sunken) hover:text-(--text) ' +
              focusRing
            }
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">Tutup dialog</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
