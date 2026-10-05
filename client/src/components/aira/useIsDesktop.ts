// Breakpoint md (768px): daftar sesi tampil di samping (desktop) atau di drawer (mobile).
// Dipakai agar hanya SATU salinan daftar sesi ada di DOM (tanpa label/id ganda).

import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

const snapshot = (): boolean => window.matchMedia(QUERY).matches;

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
