import { Router } from 'express';
import os from 'os';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requirePerm } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { UpdateCompanySettingsSchema } from '../utils/schemas';
import { logger } from '../lib/logger';
import dummyDataRouter from './settings/dummyData';
import fs from 'fs';

const router = Router();

// Heavy admin tooling (generate-dummy, delete-dummy, reset-data) lives in
// settings/dummyData.ts — kept off the main file because it was ~570 lines
// of self-contained seed/teardown logic.
router.use(dummyDataRouter);

// GET /api/settings/runtime — runtime info (platform, domain, versions).
// Restricted to Admin/Accountant because nodeVersion + hostname + memory size
// are useful reconnaissance signals to anyone with read access to the system.
router.get('/runtime', requirePerm('settings'), async (req, res) => {
  try {
    const protocol = req.protocol;
    const host = req.get('host') || 'localhost';
    const origin = req.get('origin') || `${protocol}://${host}`;

    // Detect platform
    const arch = os.arch();
    const platform = os.platform();
    const cpuModel = os.cpus()[0]?.model || '';
    const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10; // GB

    let platformLabel = `${platform} (${arch})`;
    if (cpuModel.toLowerCase().includes('raspberry') || cpuModel.toLowerCase().includes('bcm') || cpuModel.toLowerCase().includes('cortex')) {
      platformLabel = `Raspberry Pi (${arch})`;
    } else if (platform === 'linux' && arch === 'arm64') {
      platformLabel = `Linux ARM64`;
    } else if (platform === 'darwin') {
      platformLabel = `macOS (${arch})`;
    } else if (platform === 'win32') {
      platformLabel = `Windows (${arch})`;
    } else if (platform === 'linux') {
      platformLabel = `Linux (${arch})`;
    }

    // Detect if running in Docker
    const isDocker = await import('fs').then(fs =>
      fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv')
    ).catch(() => false);
    if (isDocker) platformLabel += ' (Docker)';

    return res.json({
      platform: platformLabel,
      domain: origin,
      hostname: os.hostname(),
      nodeVersion: process.version,
      memory: `${totalMem} GB`,
      uptime: Math.round(process.uptime()),
      env: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    logger.error({ error }, 'GET /settings/runtime error');
    return res.status(500).json({ error: 'Gagal mengambil info runtime.' });
  }
});

// GET /api/settings/company
router.get('/company', async (req, res) => {
  try {
    const settings = await prisma.companySettings.findFirst({ where: { slug: 'default' } });
    return res.json(settings);
  } catch (error) {
    logger.error({ error }, 'GET /settings/company error');
    return res.status(500).json({ error: 'Gagal mengambil pengaturan perusahaan.' });
  }
});

// PUT /api/settings/company (Admin only)
router.put('/company', requirePerm('settings'), async (req, res) => {
  const rawBody = req.body;
  const mergedBody = {
    ...rawBody,
    companyName: rawBody.companyName || rawBody.name,
    currency: rawBody.defaultCurrency || rawBody.currency,
    fiscalYearStartMonth: rawBody.fiscalYearStartMonth,
  };

  const body = validateBody(UpdateCompanySettingsSchema, mergedBody, res);
  if (!body) return;

  if (body.logoUrl && typeof body.logoUrl === 'string' && body.logoUrl.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: 'Ukuran logo terlalu besar (maks. ~4MB setelah encoding).' });
  }
  if (body.logoUrlDark && typeof body.logoUrlDark === 'string' && body.logoUrlDark.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: 'Ukuran logo (dark mode) terlalu besar (maks. ~4MB setelah encoding).' });
  }

  try {
    const data = {
      companyName: body.companyName ?? rawBody.name ?? 'Perusahaan Anda',
      address: body.address || null,
      phone: body.phone || null,
      email: body.email || null,
      taxId: body.taxId || null,
      defaultCurrency: body.currency || rawBody.defaultCurrency || 'IDR',
      fiscalYearStartMonth: body.fiscalYearStartMonth ?? 1,
      ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl || null }),
      ...(body.logoUrlDark !== undefined && { logoUrlDark: body.logoUrlDark || null }),
      ...(body.invoiceSettings !== undefined && {
        invoiceSettings: body.invoiceSettings === null
          ? Prisma.DbNull
          : (body.invoiceSettings as Prisma.InputJsonValue),
      }),
    };

    const result = await prisma.companySettings.upsert({
      where: { slug: 'default' },
      update: data,
      create: { ...data, slug: 'default' },
    });

    return res.json(result);
  } catch (error) {
    logger.error({ error }, 'PUT /settings/company error');
    return res.status(500).json({ error: 'Gagal menyimpan pengaturan perusahaan.' });
  }
});

// POST /api/settings/company/onboarding — tandai penyiapan awal selesai/dilewati.
// Admin only (izin 'settings' edit, POST → edit). Idempoten: timestamp pertama
// dipertahankan. Respons sengaja ringkas (bukan seluruh record) supaya audit
// log tidak ikut menyimpan logo base64.
router.post('/company/onboarding', requirePerm('settings'), async (_req, res) => {
  try {
    const existing = await prisma.companySettings.findFirst({
      where: { slug: 'default' },
      select: { id: true, onboardedAt: true },
    });
    if (existing?.onboardedAt) {
      return res.json({ id: existing.id, onboardedAt: existing.onboardedAt });
    }

    const result = await prisma.companySettings.upsert({
      where: { slug: 'default' },
      update: { onboardedAt: new Date() },
      create: { slug: 'default', companyName: '', onboardedAt: new Date() },
      select: { id: true, onboardedAt: true },
    });
    return res.json(result);
  } catch (error) {
    logger.error({ error }, 'POST /settings/company/onboarding error');
    return res.status(500).json({ error: 'Gagal menyimpan status penyiapan awal.' });
  }
});

router.get('/check-update', requirePerm('settings'), async (_req, res) => {
  try {
    const currentVersion = (() => {
      try {
        const versionFile = fs.readFileSync(
          path.resolve(__dirname, '../../../client/src/lib/version.ts'), 'utf-8'
        );
        const match = versionFile.match(/APP_VERSION\s*=\s*'([^']+)'/);
        return match?.[1] || 'unknown';
      } catch {
        return 'unknown';
      }
    })();

    // Fetch latest version from GitHub
    const response = await fetch(
      'https://raw.githubusercontent.com/ArahKarya/entaris/main/client/src/lib/version.ts',
      { signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      return res.json({ currentVersion, remoteVersion: null, updateAvailable: false, error: 'Gagal cek GitHub.' });
    }

    const content = await response.text();
    const remoteMatch = content.match(/APP_VERSION\s*=\s*'([^']+)'/);
    const remoteVersion = remoteMatch?.[1] || 'unknown';

    // Get current git info
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    const gitOpts = { cwd: path.resolve(__dirname, '../../..'), timeout: 15000 };

    let localCommit = 'unknown';
    let remoteCommit = 'unknown';
    try {
      await execFileAsync('git', ['fetch', 'origin', 'main', '--quiet'], gitOpts);
      localCommit = (await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], gitOpts)).stdout.trim();
      remoteCommit = (await execFileAsync('git', ['rev-parse', '--short', 'origin/main'], gitOpts)).stdout.trim();
    } catch { /* git not available in container */ }

    const compareSemver = (a: string, b: string) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        if ((pa[i] || 0) < (pb[i] || 0)) return -1;
      }
      return 0;
    };

    const updateAvailable = compareSemver(remoteVersion, currentVersion) > 0 || localCommit !== remoteCommit;

    return res.json({
      currentVersion,
      remoteVersion,
      localCommit,
      remoteCommit,
      updateAvailable,
    });
  } catch (error) {
    logger.error({ error }, 'GET /settings/check-update error');
    return res.status(500).json({ error: 'Gagal mengecek update.' });
  }
});

export default router;
