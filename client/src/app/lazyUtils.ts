/** Non-component helpers for app/lazy.tsx. */

const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|Unable to preload CSS/i;

export const isChunkLoadError = (err: unknown): boolean =>
  err instanceof Error && CHUNK_ERROR.test(`${err.name} ${err.message}`);

/**
 * Warm the chunk for a route when the pointer or keyboard focus lands on a link
 * to it. One delegated listener; skipped on Save-Data connections.
 */
export function installLinkPreload(map: Record<string, () => void>): () => void {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return () => undefined;
  const handler = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.('a[href^="/"]') as HTMLAnchorElement | null;
    if (!a) return;
    map[a.pathname]?.();
  };
  document.addEventListener('pointerover', handler, { passive: true });
  document.addEventListener('focusin', handler);
  return () => {
    document.removeEventListener('pointerover', handler);
    document.removeEventListener('focusin', handler);
  };
}
