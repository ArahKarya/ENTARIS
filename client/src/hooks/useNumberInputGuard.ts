import { useEffect } from 'react';

/**
 * Global guard for every <input type="number">: a focused field silently changes value on
 * mouse wheel or ArrowUp/Down, so wheel blurs it (page still scrolls) and arrow keys are blocked.
 * Call once at the App root; it covers fields created later too.
 */
export function useNumberInputGuard(): void {
  useEffect(() => {
    const isNumberInput = (el: EventTarget | null): el is HTMLInputElement =>
      el instanceof HTMLInputElement && el.type === 'number';

    const onWheel = (e: WheelEvent) => {
      const target = e.target;
      // Hanya bertindak bila roda mouse berputar DI ATAS field number yang sedang fokus.
      if (isNumberInput(target) && document.activeElement === target) {
        // Lepas fokus supaya browser tidak mengubah nilai; halaman tetap scroll.
        target.blur();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (isNumberInput(target) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
      }
    };

    // passive:true cukup karena kita hanya blur(), tidak perlu preventDefault pada wheel.
    document.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
