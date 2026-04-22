import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/public/branding — public company branding (no auth required)
// Used by LoginPage and any other pre-auth surface.
router.get('/branding', async (_req, res) => {
  try {
    const settings = await prisma.companySettings.findFirst({
      where: { slug: 'default' },
      select: { companyName: true, logoUrl: true, logoUrlDark: true },
    });
    return res.json({
      companyName: settings?.companyName ?? null,
      logoUrl: settings?.logoUrl ?? null,
      logoUrlDark: settings?.logoUrlDark ?? null,
    });
  } catch (error) {
    logger.error({ error }, 'GET /public/branding error');
    return res.json({ companyName: null, logoUrl: null, logoUrlDark: null });
  }
});

export default router;
