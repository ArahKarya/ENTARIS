// Pengelompokan daftar sesi: hari ini / kemarin / 7 hari / lebih lama (murni; mudah diuji).
// Mengembalikan kunci kelompok; label diterjemahkan saat render (aira:sessionList.groups.*).

import type { ChatSessionDto } from './types';

export const GROUP_KEYS = ['today', 'yesterday', 'last7Days', 'older'] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function groupOf(iso: string, now: Date = new Date()): GroupKey {
  const day = startOfDay(new Date(iso));
  const today = startOfDay(now);
  const diffDays = Math.round((today - day) / 86_400_000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays <= 7) return 'last7Days';
  return 'older';
}

export interface SessionGroup {
  key: GroupKey;
  items: ChatSessionDto[];
}

export function groupSessions(sessions: ReadonlyArray<ChatSessionDto>, now: Date = new Date()): SessionGroup[] {
  const buckets = new Map<GroupKey, ChatSessionDto[]>();
  for (const s of sessions) {
    const g = groupOf(s.lastMessageAt, now);
    buckets.set(g, [...(buckets.get(g) ?? []), s]);
  }
  return GROUP_KEYS.filter((k) => buckets.has(k)).map((key) => ({ key, items: buckets.get(key) ?? [] }));
}

const LAST_KEY = (userId: string): string => `aira:last-session:${userId}`;

/** Sesi terakhir dibuka per pengguna (cadangan bila server tak terjangkau; sumber utama = server). */
export function readLastSession(userId: string | null): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(LAST_KEY(userId));
  } catch {
    return null;
  }
}

export function writeLastSession(userId: string | null, sessionId: string | null): void {
  if (!userId) return;
  try {
    if (sessionId) localStorage.setItem(LAST_KEY(userId), sessionId);
    else localStorage.removeItem(LAST_KEY(userId));
  } catch {
    // penyimpanan tidak tersedia
  }
}
