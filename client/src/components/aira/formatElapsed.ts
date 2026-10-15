// Penghitung waktu penanda "AIRA sedang bekerja": detik dengan satu desimal, lalu menit.

export function formatElapsed(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}
