// Penanda "AIRA sedang bekerja" di panel chat: grid 3x3 piksel persegi dengan gelombang chevron ke kanan,
// label yang berkilau, dan penghitung waktu berangka mono. Sel persegi (bukan bulat) sesuai DESIGN.md.
// Gerak diatur di index.css (.aira-pixel, .aira-shimmer); reduced motion membekukan grid pada keadaan redup.

import { useEffect, useState, type CSSProperties } from 'react';
import { formatElapsed } from './formatElapsed';

const CELLS = 9;
const TICK_MS = 100;
// Tunda per sel: kolom + jarak baris dari tengah, jadi bentuknya chevron "›".
const DELAYS = Array.from({ length: CELLS }, (_, i) => {
  const row = Math.floor(i / 3);
  const col = i % 3;
  return (col + Math.abs(row - 1)) * 90;
});

function useElapsed(since: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return formatElapsed(now - since);
}

export function PixelGrid() {
  return (
    <span aria-hidden className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]">
      {DELAYS.map((delay, i) => (
        <span
          key={i}
          className="aira-pixel size-1 rounded-[1px] bg-foreground"
          style={{ '--pixel-delay': `${delay}ms` } as CSSProperties}
        />
      ))}
    </span>
  );
}

interface LoadingStateProps {
  label: string;
  /** waktu mulai giliran (ms epoch); penghitung dihitung dari sini supaya tidak mengulang saat label berganti */
  since: number;
}

export function LoadingState({ label, since }: LoadingStateProps) {
  const elapsed = useElapsed(since);
  return (
    <div role="status" className="flex w-fit max-w-full items-center gap-2.5 py-1">
      <PixelGrid />
      <span className="aira-shimmer min-w-0 truncate text-[13px] font-medium" title={label}>
        {label}
      </span>
      <span aria-hidden className="font-mono text-xs tabular-nums text-muted-foreground">{elapsed}</span>
    </div>
  );
}
