// Pengelompokan daftar sesi: Hari ini / Kemarin / 7 hari / Lebih lama (murni; mudah diuji).

import type { ChatSessionDto } from './types';

export const GROUP_LABELS = ['Hari ini', 'Kemarin', '7 hari terakhir', 'Lebih lama'] as const;
export type GroupLabel = (typeof GROUP_LABELS)[number];

const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function groupOf(iso: string, now: Date = new Date()): GroupLabel {
  const day = startOfDay(new Date(iso));
  const today = startOfDay(now);
  const diffDays = Math.round((today - day) / 86_400_000);
  if (diffDays <= 0) return 'Hari ini';
  if (diffDays === 1) return 'Kemarin';
  if (diffDays <= 7) return '7 hari terakhir';
  return 'Lebih lama';
}

export interface SessionGroup {
  label: GroupLabel;
  items: ChatSessionDto[];
}

export function groupSessions(sessions: ReadonlyArray<ChatSessionDto>, now: Date = new Date()): SessionGroup[] {
  const buckets = new Map<GroupLabel, ChatSessionDto[]>();
  for (const s of sessions) {
    const g = groupOf(s.lastMessageAt, now);
    buckets.set(g, [...(buckets.get(g) ?? []), s]);
  }
  return GROUP_LABELS.filter((l) => buckets.has(l)).map((label) => ({ label, items: buckets.get(label) ?? [] }));
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
