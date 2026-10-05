// Tipe runtime untuk AIRA Tool Router (sisi aplikasi ERP).
// Skema mengikuti BRD AIRA §8.9: risk read/write/critical, roles, handler,
// confirm_template. Lihat docs/erd-ai-layer/config/aira-tool-router.schema.json.

export type ToolRisk = 'read' | 'write' | 'critical';
export type ToolTier = 'auto' | 'draft' | 'must_approve';
export type ToolPermAction = 'view' | 'edit';

/** Toolset = pengelompokan fungsional katalog (satu endpoint MCP per toolset di tahap berikutnya). */
export const TOOLSETS = [
  'penjualan',
  'pembelian',
  'persediaan',
  'produksi',
  'akuntansi',
  'kas-bank',
  'aset-umum',
  'pengajuan-pembayaran',
  'persetujuan',
  'laporan',
  'dashboard',
  'master-data',
  'sistem',
  'obrolan',
] as const;
export type Toolset = (typeof TOOLSETS)[number];

/** Dokumentasi satu parameter tool (diturunkan dari Zod / query parsing). */
export interface ToolParam {
  name: string;
  /** lokasi parameter pada request HTTP */
  in: 'path' | 'query' | 'body';
  /** string | number | boolean | date | uuid | email | enum | object | any | array<...> */
  type: string;
  required: boolean;
  enum?: string[];
  description?: string;
  /** field anak (untuk object / array<object>) */
  fields?: ToolParam[];
}

/** Satu entri tool dalam registry (file JSON = default & struktur). */
export interface ToolDef {
  name: string;
  group: string;
  module: string;
  desc: string;
  risk: ToolRisk;
  roles: string[];
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  handler: string; // "METHOD /api/path"
  permAction: ToolPermAction;
  enabled: boolean;
  level: number; // 1 = copilot, 2 = workflow, 3 = autonomous
  phase: number;
  service?: string;
  requiresCapability?: string;
  confirm_template?: string; // wajib utk write/critical

  // ── Tambahan Stage 0 (katalog lengkap; semua OPSIONAL → kompatibel mundur) ──
  /** Pengelompokan fungsional katalog (lihat TOOLSETS). */
  toolset?: Toolset;
  /** true = tool write yang hanya membuat DRAFT / pengajuan pending (tidak posting GL/stok sendiri). */
  draftCapable?: boolean;
  /** Efek pembukuan/stok/WAC singkat (wajib untuk write/critical). */
  postingEffect?: string;
  /** true = handler non-GET tetapi murni baca (preview/search/export); wajib untuk risk=read dengan POST. */
  safeNonGet?: boolean;
  /** Parameter terdokumentasi lengkap (path/query/body, tipe, wajib, enum). `input` tetap ringkasan nama→tipe. */
  params?: ToolParam[];
  /** Siapa yang benar-benar boleh memanggil bila guard-nya campuran (mis. milik sendiri vs keuangan vs atasan). */
  accessNote?: string;
  /** Ringkasan hasil dalam bahasa Indonesia. */
  outputSummary?: string;
  /** Prasyarat sebelum tool boleh dipanggil. */
  prerequisites?: string[];
  /** Error umum + penyebab. */
  errors?: string[];
  /** Tool lain yang biasanya dipakai berurutan. */
  related?: string[];
}

/** Registry utuh (header + daftar tool). */
export interface ToolRegistry {
  app: string;
  version: string;
  generatedNote?: string;
  modules: string[];
  roles: string[];
  capabilities: string[];
  tools: ToolDef[];
}

/** Status efektif tool = merge(registry default, override DB). */
export interface EffectiveTool extends ToolDef {
  source: 'registry' | 'override';
  tier: ToolTier; // diturunkan dari risk + override
}

/** Hasil validasi registry. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  loaded: number; // jumlah tool yang lolos
  skipped: string[]; // nama tool yang di-skip karena rusak
}
