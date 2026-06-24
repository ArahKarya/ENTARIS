// Tipe runtime untuk AIRA Tool Router (sisi aplikasi ERP).
// Skema mengikuti BRD AIRA §8.9: risk read/write/critical, roles, handler,
// confirm_template. Lihat docs/erd-ai-layer/config/aira-tool-router.schema.json.

export type ToolRisk = 'read' | 'write' | 'critical';
export type ToolTier = 'auto' | 'draft' | 'must_approve';
export type ToolPermAction = 'view' | 'edit';

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
