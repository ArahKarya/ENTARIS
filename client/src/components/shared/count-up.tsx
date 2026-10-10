import { useEffect, useMemo, useState } from 'react';
import { formatNumericParts, parseNumericParts } from '@/lib/motion';

const DURATION_MS = 700;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Counts the number inside a formatted value up from zero ("Rp 1.234.567"). Screen readers
 * get the final text only. Renders the text unchanged when it holds no number.
 * Give it `key={text}` so a new value restarts from zero.
 */
export function CountUp({ text }: { text: string }) {
  const parts = useMemo(() => parseNumericParts(text), [text]);
  // Background tabs pause requestAnimationFrame; show the final value there instead of a frozen 0.
  const [progress, setProgress] = useState(() => (document.hidden ? 1 : 0));

  useEffect(() => {
    if (!parts || document.hidden) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      setProgress(easeOutCubic(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [parts]);

  if (!parts) return <>{text}</>;
  const shown = progress >= 1 ? text : formatNumericParts(parts, parts.number * progress);
  return (
    <>
      <span aria-hidden>{shown}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}
