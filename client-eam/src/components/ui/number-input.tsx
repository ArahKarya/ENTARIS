import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * NumberInput — drop-in pengganti <input type="number"> yang AMAN.
 *
 * Menonaktifkan perilaku bawaan yang berbahaya untuk field nominal/uang:
 * - scroll roda mouse tidak lagi mengubah nilai (field di-blur saat di-scroll)
 * - tombol panah Atas/Bawah tidak lagi menaikkan/menurunkan nilai
 * - spinner visual disembunyikan
 *
 * Pemakaian sama seperti <input> biasa; type dipaksa "number".
 * Untuk field baru, gunakan komponen ini alih-alih <input type="number">.
 */
export const NumberInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
>(({ className, onWheel, onKeyDown, ...props }, ref) => (
  <input
    type="number"
    ref={ref}
    onWheel={(e) => {
      // Lepas fokus supaya nilai tak berubah; halaman tetap scroll normal.
      e.currentTarget.blur();
      onWheel?.(e);
    }}
    onKeyDown={(e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
      }
      onKeyDown?.(e);
    }}
    className={cn(
      'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
      className,
    )}
    {...props}
  />
));
NumberInput.displayName = 'NumberInput';
