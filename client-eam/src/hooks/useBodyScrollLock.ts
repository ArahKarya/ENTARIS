import { useEffect } from 'react';

/**
 * Lock body scroll while a modal is open. The previous overflow value is
 * restored on cleanup so nested modals do not interfere with each other.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
