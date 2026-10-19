import type { ToolChip } from './types';

/** Gabungkan start/done per nama berurutan: satu chip per panggilan, keadaan terbaru menang. */
export function collapseChips(chips: ReadonlyArray<ToolChip>): ToolChip[] {
  const out: ToolChip[] = [];
  for (const c of chips) {
    const idx = c.state === 'start' ? -1 : out.findIndex((o) => o.name === c.name && o.state === 'start');
    if (idx >= 0) out[idx] = c;
    else out.push(c);
  }
  return out;
}
