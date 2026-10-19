// Bootstrap idempoten utk modul Uang Jaminan Proyek: pastikan akun aset 1.8
// + system account mapping PROJECT_GUARANTEE ada di DB existing (seed.ts hanya
// jalan di DB baru). Mapping HANYA dibuat bila role itu belum punya mapping
// sama sekali — remap Admin via Pengaturan > Akun Sistem tidak ditimpa.
// Dipanggil saat boot (index.ts), pola yang sama dgn ensureRbacSeed.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { systemAccounts } from './systemAccounts';

const GUARANTEE_ACCOUNT_NUMBER = '1.8';
const GUARANTEE_ACCOUNT_NAME = 'Uang Jaminan Proyek';

export async function ensureProjectGuaranteeAccount(): Promise<void> {
  try {
    let account = await prisma.account.findUnique({
      where: { accountNumber: GUARANTEE_ACCOUNT_NUMBER },
    });

    if (!account) {
      const parent = await prisma.account.findUnique({ where: { accountNumber: '1' } });
      account = await prisma.account.create({
        data: {
          accountNumber: GUARANTEE_ACCOUNT_NUMBER,
          name: GUARANTEE_ACCOUNT_NAME,
          accountType: 'ASSET',
          rootType: 'ASSET',
          isGroup: false,
          parentId: parent?.id ?? null,
        },
      });
      logger.info({ accountNumber: GUARANTEE_ACCOUNT_NUMBER }, 'Akun Uang Jaminan Proyek dibuat');
    }

    const mappingCount = await prisma.systemAccountMapping.count({
      where: { role: 'PROJECT_GUARANTEE' },
    });
    if (mappingCount === 0) {
      await prisma.systemAccountMapping.create({
        data: { role: 'PROJECT_GUARANTEE', accountId: account.id, sortOrder: 0 },
      });
      systemAccounts.invalidateCache();
      logger.info('System account mapping PROJECT_GUARANTEE → 1.8 dibuat');
    }
  } catch (err) {
    logger.error({ err }, 'ensureProjectGuaranteeAccount gagal (diabaikan saat boot)');
  }
}
