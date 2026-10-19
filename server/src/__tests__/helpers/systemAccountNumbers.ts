import type { PrismaClient } from '@prisma/client';

/**
 * Account number mapped to a system account role (Pengaturan > Akun Sistem), as the services
 * resolve it. Integration tests use this instead of hardcoding numbers such as 2.1.5, because
 * the chart of accounts (and so the mapping) differs between installations.
 */
export async function systemAccountNumber(prisma: PrismaClient, role: string): Promise<string> {
  const mapping = await prisma.systemAccountMapping.findFirst({
    where: { role },
    orderBy: { sortOrder: 'asc' },
    include: { account: { select: { accountNumber: true } } },
  });
  if (!mapping) throw new Error(`No system account mapped for role ${role}.`);
  return mapping.account.accountNumber;
}
