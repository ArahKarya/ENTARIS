import { useMutation } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';

interface ConsoleLink {
  consoleUrl: string;
  token: string;
  expiresAt: number;
}

/**
 * Membuka konsol pengaturan engine AIRA sebagai pengguna ini (tiket sekali pakai, ~60 detik).
 * Tab dibuka lebih dulu (sinkron dengan klik) agar tidak diblokir popup blocker, lalu diarahkan
 * setelah tiket didapat. Tiket ditaruh di fragmen URL (#) sehingga tidak ikut ke log server.
 */
export function OpenConsoleButton() {
  const { t } = useTranslation('aira');
  const open = useMutation({
    mutationFn: async () => (await api.post('/ai/mcp/console')).data as ConsoleLink,
  });

  const onClick = () => {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    open.mutate(undefined, {
      onSuccess: (link) => {
        const url = `${link.consoleUrl}/sso#t=${encodeURIComponent(link.token)}`;
        if (tab) tab.location.href = url;
        else window.location.assign(url);
      },
      onError: (err) => {
        tab?.close();
        const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
        toast.error(message || t('mcp.engine.consoleFailed'));
      },
    });
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={open.isPending}>
      <ExternalLink aria-hidden />
      {t('mcp.engine.openConsole')}
    </Button>
  );
}
