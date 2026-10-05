// Akses tool per aktor: registry + override DB → tool efektif; lalu saring dengan
// RBAC (modul + capability role aktor) ∩ level AIRA user. Handler asli tetap
// menegakkan RBAC sebenarnya — penyaringan ini hanya agar tools/list jujur.

import { prisma } from '../lib/prisma';
import { effectiveTools } from '../ai/registry';
import type { EffectiveTool } from '../ai/types';
import { can, hasCap } from '../services/permissionService';
import { decideForTool, effectiveUserTier, type ToolDecision } from './policy';
import type { AiraTier } from './constants';

/** Modul registry yang tidak ada di taksonomi RBAC (terbuka bagi user login; handler yang menjaga). */
const OPEN_MODULES = new Set(['notifications', 'attachments', 'payment_request']);

export interface ToolEntry {
  tool: EffectiveTool;
  /** true bila tier berasal dari override eksplisit admin. */
  pinned: boolean;
}

/** Semua tool aktif (registry + override AiToolConfig). */
export async function loadActiveTools(): Promise<ToolEntry[]> {
  const rows = await prisma.aiToolConfig.findMany();
  const overrides = new Map(rows.map((o) => [o.toolName, { enabled: o.enabled, tier: o.tier }]));
  return effectiveTools(overrides)
    .filter((t) => t.enabled)
    .map((tool) => ({ tool, pinned: overrides.get(tool.name)?.tier != null }));
}

export interface ActorForAccess {
  role: string;
  airaTier: string;
  groupFloor: boolean;
}

export async function roleMayCall(role: string, tool: EffectiveTool): Promise<boolean> {
  if (!OPEN_MODULES.has(tool.module) && !(await can(role, tool.module, tool.permAction))) return false;
  if (tool.requiresCapability && !(await hasCap(role, tool.requiresCapability))) return false;
  return true;
}

export interface AllowedTool extends ToolEntry {
  decision: Exclude<ToolDecision, 'deny'>;
}

export type CallVerdict =
  | { decision: 'execute' | 'queue' }
  | { decision: 'deny'; reason: 'tier' | 'rbac' };

/** Keputusan untuk SATU panggilan: level AIRA (tier) dulu, lalu RBAC role aktor. */
export async function decideCall(entry: ToolEntry, actor: ActorForAccess): Promise<CallVerdict> {
  const userTier: AiraTier = effectiveUserTier(actor.airaTier, actor.groupFloor);
  const decision = decideForTool(entry.tool, entry.tool.tier, entry.pinned, userTier);
  if (decision === 'deny') return { decision: 'deny', reason: 'tier' };
  if (!(await roleMayCall(actor.role, entry.tool))) return { decision: 'deny', reason: 'rbac' };
  return { decision };
}

/** Tool yang boleh dipanggil aktor (dengan keputusan eksekusi: langsung / antrian). */
export async function allowedToolsFor(actor: ActorForAccess, entries?: ToolEntry[]): Promise<AllowedTool[]> {
  const userTier: AiraTier = effectiveUserTier(actor.airaTier, actor.groupFloor);
  const all = entries ?? (await loadActiveTools());
  const out: AllowedTool[] = [];
  for (const e of all) {
    const decision = decideForTool(e.tool, e.tool.tier, e.pinned, userTier);
    if (decision === 'deny') continue;
    if (!(await roleMayCall(actor.role, e.tool))) continue;
    out.push({ ...e, decision });
  }
  return out;
}
