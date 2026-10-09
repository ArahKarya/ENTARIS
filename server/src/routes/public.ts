import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';

const router = Router();

// GET /api/public/branding — public company branding (no auth required)
// Used by LoginPage and any other pre-auth surface.
router.get('/branding', async (_req, res) => {
  try {
    const settings = await prisma.companySettings.findFirst({
      where: { slug: 'default' },
      select: { companyName: true, logoUrl: true, logoUrlDark: true, phone: true, email: true },
    });
    return res.json({
      companyName: settings?.companyName ?? null,
      logoUrl: settings?.logoUrl ?? null,
      logoUrlDark: settings?.logoUrlDark ?? null,
      phone: settings?.phone ?? null,
      email: settings?.email ?? null,
    });
  } catch (error) {
    logger.error({ error }, 'GET /public/branding error');
    return res.json({ companyName: null, logoUrl: null, logoUrlDark: null, phone: null, email: null });
  }
});

// Public Inquiry submission
// Self-service inquiry form for prospects/customers. Each submission lands
// in the Inquiry pipeline as status 'Baru'. Anti-spam: honeypot + tight
// per-IP rate limit. Add Cloudflare Turnstile later if abuse appears.
const inquirySubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan dari IP ini. Coba lagi dalam 1 jam.' },
});

const VALID_CHANNELS = ['WhatsApp', 'Telepon', 'Email', 'WalkIn', 'Referral', 'Lainnya'] as const;

const PublicInquirySchema = z.object({
  prospectName: z.string().min(2, 'Nama minimal 2 karakter.').max(200),
  prospectPhone: z.string().min(8, 'Nomor telepon minimal 8 digit.').max(50),
  prospectEmail: z.string().email().or(z.literal('')).optional().nullable(),
  itemsText: z.string().min(10, 'Permintaan minimal 10 karakter.').max(2000),
  channel: z.enum(VALID_CHANNELS).optional().default('Lainnya'),
  // Honeypot — must be empty. Real users never fill this hidden field.
  website: z.string().max(0, 'Bot detected.').optional().or(z.literal('')),
});

router.post('/inquiry', inquirySubmitLimiter, async (req, res) => {
  try {
    const parsed = PublicInquirySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const data = parsed.data;

    // Reject if honeypot field has any content (bot)
    if (data.website && data.website.length > 0) {
      logger.warn({ ip: req.ip }, 'Honeypot triggered on /public/inquiry — silently dropped');
      // Return 200 so bots don't learn our trap
      return res.json({ success: true, message: 'Terima kasih. Kami akan menghubungi Anda.' });
    }

    // Create as inquiry, status='Baru'. No partyId (it's a prospect).
    // Use a default system user as `created_by` because no auth context exists.
    const date = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const fy = await getOpenFiscalYear(tx, date);
      const inquiryNumber = await generateDocumentNumber(tx, 'INQ', date, fy.id);

      // Find any Admin user to attribute as creator (system can't fail just
      // because users table is empty — but in practice Admin always exists).
      const sysUser = await tx.user.findFirst({ where: { role: 'Admin', isActive: true }, select: { id: true } });
      if (!sysUser) {
        throw new Error('No Admin user available to attribute public inquiry to');
      }

      return tx.inquiry.create({
        data: {
          inquiryNumber,
          date,
          status: 'Baru',
          channel: data.channel,
          partyId: null,
          prospectName: data.prospectName,
          prospectPhone: data.prospectPhone,
          prospectEmail: data.prospectEmail || null,
          itemsMode: 'freetext',
          itemsText: data.itemsText,
          notes: `Submitted via public form from IP ${req.ip}`,
          fiscalYearId: fy.id,
          createdBy: sysUser.id,
        },
      });
    });

    logger.info({ inquiryNumber: result.inquiryNumber, channel: data.channel }, 'Public inquiry created');
    return res.json({
      success: true,
      inquiryNumber: result.inquiryNumber,
      message: 'Permintaan Anda telah kami terima. Tim sales akan menghubungi Anda secepatnya.',
    });
  } catch (error) {
    logger.error({ error }, 'POST /public/inquiry error');
    return res.status(500).json({ error: 'Gagal menyimpan permintaan. Silakan coba lagi atau hubungi kami langsung.' });
  }
});

export default router;
