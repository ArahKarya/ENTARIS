// Kebijakan tier MCP: apa yang terjadi bila actor X memanggil tool Y.
//
//   userTier read     → hanya tool risk=read (sisanya ditolak & tidak muncul di tools/list)
//   userTier standard → read langsung; write langsung HANYA bila draftCapable (membuat draft/
//                       pengajuan pending); write non-draft & semua critical → antrian approval
//   userTier direct   → write/critical langsung sebagai aktor (tetap RBAC + gate normal handler)
//   override tool 'must_approve' (AiToolConfig) → selalu antrian, apa pun level user
//   override tool 'auto'  → langsung bagi user level standard/direct
//   chat grup (gf=true)   → level 'direct' diturunkan menjadi 'standard' (lantai grup)

import type { EffectiveTool, ToolDef } from '../ai/types';
import type { AiraTier } from './constants';

export type ToolDecision = 'execute' | 'queue' | 'deny';

export function effectiveUserTier(tier: string | null | undefined, groupFloor: boolean): AiraTier {
  const t: AiraTier = tier === 'read' || tier === 'direct' ? tier : 'standard';
  return groupFloor && t === 'direct' ? 'standard' : t;
}

/**
 * @param toolTier tier efektif tool (registry default atau override DB)
 * @param pinned   true bila tier berasal dari override eksplisit admin (bukan turunan risk)
 */
export function decideForTool(
  tool: Pick<ToolDef, 'risk' | 'draftCapable'>,
  toolTier: EffectiveTool['tier'],
  pinned: boolean,
  userTier: AiraTier,
): ToolDecision {
  if (tool.risk === 'read') return 'execute';
  if (userTier === 'read') return 'deny';
  if (pinned && toolTier === 'must_approve') return 'queue';
  if (pinned && toolTier === 'auto') return 'execute';
  if (userTier === 'direct') return 'execute';
  if (toolTier === 'must_approve') return 'queue';
  // tier 'draft' (write) → langsung hanya bila tool memang hanya membuat draft/pengajuan pending
  return tool.draftCapable ? 'execute' : 'queue';
}

/** Teks tier untuk deskripsi tool (dibaca agen). */
export function tierHint(decision: ToolDecision): string {
  if (decision === 'execute') return '';
  if (decision === 'queue') return 'Tier: menunggu persetujuan manusia (tidak langsung dieksekusi; hasil = pending_approval).';
  return 'Tier: tidak diizinkan untuk level akses Anda.';
}
