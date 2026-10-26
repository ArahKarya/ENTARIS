// Giliran chat yang sedang berjalan di proses ini. Giliran TIDAK lagi terikat ke koneksi SSE:
// klien boleh pindah modul, pindah tab, atau refresh; giliran tetap jalan sampai selesai dan
// hasilnya tersimpan di DB. Satu-satunya cara menghentikan = `stopTurn` (tombol Stop / Esc),
// timeout diam engine, atau lease kedaluwarsa (`reconcileStale`).

interface RunningTurn {
  turnId: string;
  userId: string;
  controller: AbortController;
}

const running = new Map<string, RunningTurn>();

export function registerTurn(sessionId: string, userId: string, turnId: string): AbortController {
  const controller = new AbortController();
  running.set(sessionId, { turnId, userId, controller });
  return controller;
}

/** Hapus hanya bila masih giliran yang sama (giliran baru di sesi yang sama tidak ikut terhapus). */
export function unregisterTurn(sessionId: string, turnId: string): void {
  if (running.get(sessionId)?.turnId === turnId) running.delete(sessionId);
}

/** Hentikan giliran milik `userId` di sesi ini. `turnId` opsional: bila diisi harus cocok. */
export function stopTurn(sessionId: string, userId: string, turnId?: string): boolean {
  const t = running.get(sessionId);
  if (!t || t.userId !== userId) return false;
  if (turnId && t.turnId !== turnId) return false;
  t.controller.abort();
  return true;
}

export function isTurnRunning(sessionId: string): boolean {
  return running.has(sessionId);
}

/** Hanya untuk tes. */
export function resetTurnRegistry(): void {
  for (const t of running.values()) t.controller.abort();
  running.clear();
}
