import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { systemAccounts } from '../services/systemAccounts';
import {
  SYSTEM_ACCOUNT_ROLES,
  ALL_SYSTEM_ROLES,
  type SystemAccountRole,
} from '../types/systemAccounts';

const router = Router();

// GET /api/system-accounts — list all mappings grouped by role
router.get('/', async (req: AuthRequest, res: Response) => {
  const mappings = await prisma.systemAccountMapping.findMany({
    include: {
      account: {
        select: { id: true, accountNumber: true, name: true, accountType: true, rootType: true },
      },
    },
    orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
  });

  // Group by role
  const grouped: Record<string, Array<{
    id: string;
    accountId: string;
    accountNumber: string;
    accountName: string;
    accountType: string;
    sortOrder: number;
  }>> = {};

  for (const m of mappings) {
    const list = grouped[m.role] ?? [];
    list.push({
      id: m.id,
      accountId: m.account.id,
      accountNumber: m.account.accountNumber,
      accountName: m.account.name,
      accountType: m.account.accountType,
      sortOrder: m.sortOrder,
    });
    grouped[m.role] = list;
  }

  // Build roles metadata
  const roles = ALL_SYSTEM_ROLES.map((key) => {
    const meta = SYSTEM_ACCOUNT_ROLES[key];
    return {
      key: meta.key,
      label: meta.label,
      description: meta.description,
      multiAccount: meta.multiAccount,
      required: meta.required,
      expectedRootType: meta.expectedRootType,
    };
  });

  res.json({ mappings: grouped, roles });
});

// PUT /api/system-accounts: update mappings (requires settings edit permission)
const updateSchema = z.object({
  mappings: z.array(
    z.object({
      role: z.string(),
      accountId: z.string().uuid(),
      sortOrder: z.number().int().min(0).default(0),
    }),
  ).default([]),
  // Roles yang ingin dilepas total (set ke kosong). Tidak boleh role wajib.
  clearRoles: z.array(z.string()).default([]),
}).refine((d) => d.mappings.length > 0 || d.clearRoles.length > 0, {
  message: 'Tidak ada perubahan untuk disimpan.',
});

router.put('/', async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'Admin') {
    return res.status(403).json({ error: 'Hanya Admin yang dapat mengubah konfigurasi akun sistem.' });
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Data tidak valid.', details: parsed.error.format() });
  }

  const { mappings: inputMappings, clearRoles } = parsed.data;

  // Validate roles
  const validRoles = new Set<string>(ALL_SYSTEM_ROLES);
  for (const m of inputMappings) {
    if (!validRoles.has(m.role)) {
      return res.status(400).json({ error: `Role "${m.role}" tidak valid.` });
    }
  }

  // Validate clearRoles: harus valid & tidak wajib
  for (const role of clearRoles) {
    if (!validRoles.has(role)) {
      return res.status(400).json({ error: `Role "${role}" tidak valid.` });
    }
    const meta = SYSTEM_ACCOUNT_ROLES[role as SystemAccountRole];
    if (meta?.required) {
      return res.status(400).json({
        error: `Role "${meta.label}" wajib dan tidak dapat dilepas. Ganti ke akun lain, bukan dikosongkan.`,
      });
    }
  }

  // Validate all accountIds exist, are active, and are not group accounts
  const accountIds = [...new Set(inputMappings.map((m) => m.accountId))];
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, accountNumber: true, name: true, isGroup: true, isActive: true, rootType: true },
  });
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  for (const m of inputMappings) {
    const account = accountMap.get(m.accountId);
    if (!account) {
      return res.status(400).json({ error: `Akun dengan ID "${m.accountId}" tidak ditemukan.` });
    }
    if (!account.isActive) {
      return res.status(400).json({ error: `Akun "${account.accountNumber} - ${account.name}" tidak aktif.` });
    }

  }

  // Validate single-account roles don't have multiple entries
  const roleCounts = new Map<string, number>();
  for (const m of inputMappings) {
    roleCounts.set(m.role, (roleCounts.get(m.role) ?? 0) + 1);
  }
  for (const [role, count] of roleCounts) {
    const meta = SYSTEM_ACCOUNT_ROLES[role as SystemAccountRole];
    if (!meta.multiAccount && count > 1) {
      return res.status(400).json({
        error: `Role "${meta.label}" hanya boleh memiliki 1 akun, tapi diberikan ${count}.`,
      });
    }
  }

  // Determine which roles are being updated (mapped + dilepas)
  const rolesToUpdate = [...new Set([...inputMappings.map((m) => m.role), ...clearRoles])];

  await prisma.$transaction(async (tx) => {
    // Delete existing mappings for the submitted roles
    await tx.systemAccountMapping.deleteMany({
      where: { role: { in: rolesToUpdate } },
    });

    // Create new mappings
    await tx.systemAccountMapping.createMany({
      data: inputMappings.map((m) => ({
        role: m.role,
        accountId: m.accountId,
        sortOrder: m.sortOrder,
      })),
    });
  });

  // Invalidate cache
  systemAccounts.invalidateCache();

  // Return updated state
  const updated = await prisma.systemAccountMapping.findMany({
    where: { role: { in: rolesToUpdate } },
    include: {
      account: {
        select: { id: true, accountNumber: true, name: true, accountType: true },
      },
    },
    orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
  });

  res.json({
    message: 'Konfigurasi akun sistem berhasil diperbarui.',
    updated: updated.map((m) => ({
      role: m.role,
      accountId: m.account.id,
      accountNumber: m.account.accountNumber,
      accountName: m.account.name,
      sortOrder: m.sortOrder,
    })),
  });
});

export default router;
