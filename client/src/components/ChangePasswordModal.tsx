import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared/field';
import { useReturnFocus } from '@/hooks/useReturnFocus';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Change password dialog opened from the user menu; focus returns to the menu trigger. */
const ChangePasswordModal = ({ isOpen, onClose }: ChangePasswordModalProps) => {
  const returnFocus = useReturnFocus();
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm" onOpenAutoFocus={returnFocus.capture} onCloseAutoFocus={returnFocus.onCloseAutoFocus}>
        {/* Content unmounts when closed, so the fields start empty every time. */}
        <PasswordForm onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
};

function PasswordForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(['shell', 'common']);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // The message shows under the field it is about (server errors: current password).
  const [error, setError] = useState<{ field: 'current' | 'new' | 'confirm'; message: string } | null>(null);
  const errorFor = (field: 'current' | 'new' | 'confirm') => (error?.field === field ? error.message : undefined);

  const mutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) => api.put('/users/me/password', data),
    onSuccess: () => {
      toast.success(t('changePassword.changed'));
      onClose();
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      setError({ field: 'current', message: typeof message === 'string' ? message : t('changePassword.failed') });
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!currentPassword) { setError({ field: 'current', message: t('changePassword.currentRequired') }); return; }
    if (!newPassword) { setError({ field: 'new', message: t('changePassword.newRequired') }); return; }
    if (newPassword.length < 8) { setError({ field: 'new', message: t('changePassword.newMin', { min: 8 }) }); return; }
    if (newPassword !== confirmPassword) { setError({ field: 'confirm', message: t('changePassword.mismatch') }); return; }
    mutation.mutate({ currentPassword, newPassword });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{t('changePassword.title')}</DialogTitle>
        <DialogDescription>{t('changePassword.description')}</DialogDescription>
      </DialogHeader>

      <Field label={t('changePassword.current')} required error={errorFor('current')}>
        <Input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
      </Field>
      <Field label={t('changePassword.new')} required hint={t('changePassword.newHint', { min: 8 })} error={errorFor('new')}>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
        />
      </Field>
      <Field label={t('changePassword.confirm')} required error={errorFor('confirm')}>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common:actions.cancel')}
        </Button>
        <Button
          type="submit"
          loading={mutation.isPending}
          disabled={!currentPassword || !newPassword || !confirmPassword}
        >
          {t('changePassword.submit')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default ChangePasswordModal;
