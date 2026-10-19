import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import {
  SYSTEM_ACCOUNT_ROLES,
  REQUIRED_SYSTEM_ROLES,
  type SystemAccountRole,
} from '../types/systemAccounts';

interface MappedAccount {
  id: string;
  accountNumber: string;
  name: string;
}

class SystemAccountsService {
  private cache: Map<string, MappedAccount[]> = new Map();
  private cacheLoaded = false;

  async loadCache(): Promise<void> {
    const mappings = await prisma.systemAccountMapping.findMany({
      include: {
        account: { select: { id: true, accountNumber: true, name: true } },
      },
      orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
    });

    this.cache.clear();
    for (const m of mappings) {
      const list = this.cache.get(m.role) ?? [];
      list.push({
        id: m.account.id,
        accountNumber: m.account.accountNumber,
        name: m.account.name,
      });
      this.cache.set(m.role, list);
    }
    this.cacheLoaded = true;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }
  }

  invalidateCache(): void {
    this.cacheLoaded = false;
    this.cache.clear();
  }

  async getAccount(role: SystemAccountRole): Promise<MappedAccount> {
    await this.ensureLoaded();
    const accounts = this.cache.get(role);
    if (!accounts || accounts.length === 0) {
      const meta = SYSTEM_ACCOUNT_ROLES[role];
      throw new Error(
        `Akun sistem untuk "${meta.label}" belum dikonfigurasi. Silakan atur di Pengaturan > Akun Sistem.`,
      );
    }
    return accounts[0];
  }

  async getAccountId(role: SystemAccountRole): Promise<string> {
    const account = await this.getAccount(role);
    return account.id;
  }

  async getAccounts(role: SystemAccountRole): Promise<MappedAccount[]> {
    await this.ensureLoaded();
    return this.cache.get(role) ?? [];
  }

  async getAccountIds(role: SystemAccountRole): Promise<string[]> {
    const accounts = await this.getAccounts(role);
    return accounts.map((a) => a.id);
  }

  async getCashAccountNumbers(): Promise<string[]> {
    const accounts = await this.getAccounts('CASH');
    return accounts.map((a) => a.accountNumber);
  }

  async isCashAccount(accountNumber: string): Promise<boolean> {
    const cashNumbers = await this.getCashAccountNumbers();
    return cashNumbers.some((prefix) => accountNumber.startsWith(prefix));
  }

  async validateStartup(): Promise<void> {
    await this.loadCache();
    const missing: string[] = [];
    for (const role of REQUIRED_SYSTEM_ROLES) {
      const accounts = this.cache.get(role);
      if (!accounts || accounts.length === 0) {
        missing.push(`${role} (${SYSTEM_ACCOUNT_ROLES[role].label})`);
      }
    }
    if (missing.length > 0) {
      logger.warn(
        { missingRoles: missing },
        `System account mappings belum lengkap: ${missing.join(', ')}. Konfigurasi di Pengaturan > Akun Sistem.`,
      );
    } else {
      logger.info('Semua system account mappings sudah terkonfigurasi.');
    }
  }
}

export const systemAccounts = new SystemAccountsService();
