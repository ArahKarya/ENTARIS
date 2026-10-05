/**
 * Agen tiruan mandiri untuk uji manual/E2E panel chat (engine-netral, kompatibel-OpenAI).
 *
 *   MOCK_PORT=9100 MOCK_KEY=mock-key MOCK_TURN_SECRET=... \
 *   MOCK_MCP_URL=http://127.0.0.1:3002 MOCK_MCP_TOKEN=entmcp_... MOCK_MCP_SECRET=entsig_... \
 *   npx tsx scripts/mock-agent.ts
 *
 * Perilaku dipilih dari teks pesan pengguna terakhir:
 *   "nota" / "buku kas" -> kas_daftar_akun lalu kas_buat_draft_dari_baris (membuat Draft Buku Kas)
 *   "riwayat"           -> chat_cari_riwayat (q = kata setelah "riwayat")
 *   "persetujuan"       -> appr_requests_list
 *   "lambat"            -> aliran lambat panjang (uji tombol Stop)
 *   "error"             -> HTTP 500
 *   lainnya             -> menggemakan identitas yang diterima + pesan
 */
import { startMockAgent, type MockBehavior, type RecordedRequest } from '../src/__tests__/helpers/mockAgent';

const env = (k: string, d?: string): string => process.env[k] ?? d ?? '';

function lastUserText(req: RecordedRequest): string {
  const last = req.body.messages[req.body.messages.length - 1];
  const c = last?.content;
  const raw = typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p as { text?: string }).text ?? '').join(' ') : '';
  // Buang baris tiket giliran (penanda dari server) sebelum mencocokkan kata kunci.
  return raw.replace(/\[\[entaris-turn:[^\]]*\]\]\s*/g, '');
}

function behavior(req: RecordedRequest): MockBehavior {
  if (req.body.stream !== true) return { completion: 'Ringkasan percakapan (agen tiruan).' };
  const text = lastUserText(req).toLowerCase();
  const hasImage = JSON.stringify(req.body.messages[req.body.messages.length - 1]?.content ?? '').includes('image_url');
  const who = /Nama: (.+?) \(username/.exec(req.identity)?.[1] ?? 'pengguna';
  const role = /Peran di Entaris: (.+?) \(kunci/.exec(req.identity)?.[1] ?? '-';

  if (text.includes('error')) return { status: 500 };
  if (text.includes('lambat')) {
    return { chunks: Array.from({ length: 60 }, (_, i) => `Kalimat panjang nomor ${i + 1} dari agen tiruan. `), chunkDelayMs: 250 };
  }
  if (text.includes('riwayat')) {
    const q = text.split('riwayat')[1]?.trim().split(/\s+/)[0] || 'halo';
    return { toolCalls: [{ name: 'chat_cari_riwayat', args: { q } }], chunks: ['Aku cari di riwayat percakapanmu untuk ', `"${q}". `, 'Hasilnya sudah kubaca.'], chunkDelayMs: 100 };
  }
  if (text.includes('nota') || text.includes('buku kas')) {
    return {
      toolCalls: [
        { name: 'kas_daftar_akun' },
        {
          name: 'kas_buat_draft_dari_baris',
          args: (prev) => {
            const accounts = (prev[0]?.structured as { data?: { cashAccounts?: Array<{ id: string }> } } | null)?.data?.cashAccounts ?? [];
            return {
              title: 'Buku kas dari nota (uji)',
              entryDate: new Date().toISOString().slice(0, 10),
              cashAccountId: accounts[0]?.id,
              rows: [
                { description: 'Beli ATK kantor', keluar: 125000, confidence: 0.9 },
                { description: 'Ongkos kirim dokumen', keluar: 40000, confidence: 0.8 },
                { description: 'Terima setoran tunai', masuk: 500000, confidence: 0.85 },
              ],
              sourceNote: hasImage ? 'dari foto lampiran' : 'tanpa foto',
              idempotencyKey: `mock-${Date.now()}`,
            };
          },
        },
      ],
      chunks: ['Sudah kubuat ', '**Draft Buku Kas** ', `dari ${hasImage ? 'foto nota' : 'permintaan'} Anda. `, 'Belum ada jurnal; silakan tinjau dan posting di Entaris.'],
      chunkDelayMs: 120,
    };
  }
  if (text.includes('persetujuan')) {
    return { toolCalls: [{ name: 'appr_requests_list' }], chunks: ['Kuperiksa antrian persetujuan. ', 'Silakan buka menu Persetujuan.'], chunkDelayMs: 100 };
  }
  return { chunks: [`Halo ${who} (${role}). `, `Aku agen tiruan; pesanmu: "${lastUserText(req).slice(0, 80)}". `, hasImage ? 'Lampiran gambar diterima.' : ''], chunkDelayMs: 120 };
}

async function main(): Promise<void> {
  const mcpBase = env('MOCK_MCP_URL');
  const agent = await startMockAgent({
    port: Number(env('MOCK_PORT', '9100')),
    apiKey: env('MOCK_KEY', 'mock-key'),
    turnSecret: env('MOCK_TURN_SECRET') || undefined,
    mcp: mcpBase ? { baseUrl: mcpBase, token: env('MOCK_MCP_TOKEN'), signingSecret: env('MOCK_MCP_SECRET') } : undefined,
    behavior,
  });
  console.log(`mock-agent listening on ${agent.url}`);
  const stop = async (): Promise<void> => {
    await agent.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
}

void main();
