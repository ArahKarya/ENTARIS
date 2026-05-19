import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { RefreshCcw } from 'lucide-react';

// Polls /api/version dan memicu reload-toast saat server build version berubah.
// Tujuan: setiap deploy baru otomatis nge-prompt user yang sedang login untuk
// muat ulang, supaya bundle/asset terbaru langsung dipakai tanpa Ctrl-Shift-R.
//
// Strategi:
//   - Saat mount pertama, fetch versi server lalu simpan sebagai baseline.
//   - Polling setiap 2 menit; juga trigger sekali setiap tab kembali ke fokus
//     (visibilitychange) supaya update langsung kedeteksi saat user balik
//     ke aplikasi setelah lama idle.
//   - Bila version berbeda dari baseline → tampilkan toast persistent dengan
//     tombol "Muat Ulang". Toast hanya muncul sekali (alreadyPromptedRef).
//   - Network/fetch error diam — bukan kondisi yg perlu ganggu user.

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
        'Versi aplikasi terbaru tersedia',
        {
          id: TOAST_ID,
          duration: Infinity,
          description: 'Muat ulang halaman untuk menerima pembaruan terbaru.',
          icon: <RefreshCcw size={16} />,
          action: {
            label: 'Muat Ulang',
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
