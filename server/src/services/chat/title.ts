// Judul otomatis sesi: heuristik murah dari pesan pertama pengguna (tanpa panggilan agen).

const MAX_TITLE = 60;
const FILLER_PREFIX = /^(?:halo|hai|hi|hello|selamat\s+(?:pagi|siang|sore|malam)|tolong|mohon|bisa(?:kah)?|coba|dong|ya|aira)[\s,.:!-]+/i;
const FALLBACK = 'Percakapan baru';

export function deriveTitle(firstUserMessage: string): string {
  let text = firstUserMessage.replace(/\s+/g, ' ').trim();
  // Buang basa-basi pembuka berulang ("Halo AIRA, tolong ...").
  for (let i = 0; i < 3; i++) {
    const next = text.replace(FILLER_PREFIX, '');
    if (next === text) break;
    text = next;
  }
  // Ambil kalimat/klausa pertama.
  const sentence = text.split(/(?<=[.!?])\s|\n/)[0] ?? text;
  let title = sentence.trim().replace(/[.!?,:;\s]+$/, '');
  if (!title) return FALLBACK;
  if (title.length > MAX_TITLE) {
    const cut = title.slice(0, MAX_TITLE);
    const lastSpace = cut.lastIndexOf(' ');
    title = `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
  }
  return title.charAt(0).toUpperCase() + title.slice(1);
}
