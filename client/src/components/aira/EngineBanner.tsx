// Banner saat engine AIRA offline: coba lagi + tautan Pengaturan (hanya admin).

import { Link } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EngineHealth } from './types';

interface EngineBannerProps {
  health: EngineHealth | undefined;
  checking: boolean;
  isAdmin: boolean;
  onRetry: () => void;
}

export function EngineBanner({ health, checking, isAdmin, onRetry }: EngineBannerProps) {
  if (!health || health.online) return null;
  const msg = !health.configured
    ? 'Engine AIRA belum dikonfigurasi di server.'
    : health.reason === 'auth'
      ? 'Kunci engine AIRA ditolak.'
      : 'Engine AIRA sedang offline.';
  return (
    <div role="alert" className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning-text">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {msg} Pesan Anda tetap tersimpan dan bisa dicoba lagi nanti.
      </span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry} loading={checking}>
        Coba lagi
      </Button>
      {isAdmin && (
        <Link to="/settings?tab=agentic" className="text-xs font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Buka Pengaturan
        </Link>
      )}
    </div>
  );
}
