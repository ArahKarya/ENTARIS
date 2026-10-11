import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { RefreshCcw } from 'lucide-react';
import i18n from '@/i18n';

// Polls /api/version (and on tab refocus) and shows a one-time reload toast when
// the server build differs from the first-seen baseline. Fetch errors stay silent.

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 menit
const VERSION_ENDPOINT = '/api/version';
const TOAST_ID = 'app-version-update';

async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch(VERSION_ENDPOINT, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

export default function VersionWatcher() {
  const baselineRef = useRef<string | null>(null);
  const alreadyPromptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const promptReload = () => {
      if (alreadyPromptedRef.current) return;
      alreadyPromptedRef.current = true;
      toast(
        i18n.t('versionWatcher.title', { ns: 'shell' }),
        {
          id: TOAST_ID,
          duration: Infinity,
          description: i18n.t('versionWatcher.description', { ns: 'shell' }),
          icon: <RefreshCcw size={16} />,
          action: {
            label: i18n.t('versionWatcher.reload', { ns: 'shell' }),
            onClick: () => {
              // Force network reload (bypass disk cache where supported)
              window.location.reload();
            },
          },
        },
      );
    };

    const check = async () => {
      const v = await fetchVersion();
      if (cancelled || !v) return;
      if (baselineRef.current === null) {
        baselineRef.current = v;
        return;
      }
      if (v !== baselineRef.current) {
        promptReload();
      }
    };

    // Initial fetch to capture baseline
    check();

    const interval = window.setInterval(check, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
