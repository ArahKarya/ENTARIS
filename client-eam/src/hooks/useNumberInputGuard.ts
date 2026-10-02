import { useEffect } from 'react';

/**
 * Jaring pengaman GLOBAL untuk semua <input type="number">.
 *
 * Masalah default HTML: saat sebuah field number sedang FOKUS, scroll roda mouse
 * dan tombol panah Atas/Bawah diam-diam mengubah nilainya. Ini menyebabkan bug
 * seperti 21.000.000 tiba-tiba tersimpan jadi 21.999.999 karena staff tak sengaja
 * scroll di atas field. Hook ini menonaktifkan perilaku tersebut secara global.
 *
 * - wheel: jika field number sedang fokus, cegah perubahan nilai (blur field),
 *   TAPI halaman tetap bisa di-scroll normal saat field tidak fokus.
 * - keydown ArrowUp/ArrowDown: cegah increment/decrement tak sengaja.
 *
 * Panggil SEKALI di App root. Otomatis melindungi semua field number,
 * yang sudah ada maupun yang dibuat kemudian.
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
