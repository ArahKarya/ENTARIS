import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { AuthRequest } from '../middleware/auth';
import { can } from '../services/permissionService';
import { resolveSearchScope } from './searchScope';

const router = Router();

// GET /api/search?q=xxx&limit=10
router.get('/', async (req: AuthRequest, res) => {
  const q = (req.query.q as string || '').trim();
  const limit = Math.min(Number(req.query.limit) || 10, 20);

  if (!q || q.length < 2) {
    return res.json([]);
  }

  try {
    const contains = q;
    const role = req.user?.role;
    // Only search record types the caller may list through their own endpoints.
    const scope = await resolveSearchScope((module) =>
      role ? can(role, module, 'view') : Promise.resolve(false),
    );
    const none = Promise.resolve([]);

    const [parties, salesInvoices, purchaseInvoices, payments, journals, accounts] = await Promise.all([
      prisma.party.findMany({
        where: { OR: [{ name: { contains, mode: 'insensitive' } }, { email: { contains, mode: 'insensitive' } }] },
        select: { id: true, name: true, partyType: true },
        take: limit,
      }),
      !scope.salesInvoices ? none : prisma.salesInvoice.findMany({
        where: { OR: [{ invoiceNumber: { contains, mode: 'insensitive' } }, { notes: { contains, mode: 'insensitive' } }] },
        select: { id: true, invoiceNumber: true, grandTotal: true, customer: { select: { name: true } } },
        take: limit,
      }),
      !scope.purchaseInvoices ? none : prisma.purchaseInvoice.findMany({
        where: { OR: [{ invoiceNumber: { contains, mode: 'insensitive' } }, { notes: { contains, mode: 'insensitive' } }] },
        select: { id: true, invoiceNumber: true, grandTotal: true, supplier: { select: { name: true } } },
        take: limit,
      }),
      !scope.payments ? none : prisma.payment.findMany({
        where: { OR: [{ paymentNumber: { contains, mode: 'insensitive' } }, { notes: { contains, mode: 'insensitive' } }] },
        select: { id: true, paymentNumber: true, amount: true, paymentType: true },
        take: limit,
      }),
      !scope.journals ? none : prisma.journalEntry.findMany({
        where: { OR: [{ entryNumber: { contains, mode: 'insensitive' } }, { narration: { contains, mode: 'insensitive' } }] },
        select: { id: true, entryNumber: true, narration: true },
        take: limit,
      }),
      prisma.account.findMany({
        where: { OR: [{ name: { contains, mode: 'insensitive' } }, { accountNumber: { contains, mode: 'insensitive' } }] },
        select: { id: true, name: true, accountNumber: true },
        take: limit,
      }),
    ]);

    const results: Array<{ type: string; id: string; title: string; subtitle: string | null | undefined; url: string }> = [
      ...parties.map(p => ({ type: 'party' as const, id: p.id, title: p.name, subtitle: p.partyType === 'Customer' ? 'Pelanggan' : 'Vendor', url: '/parties' })),
      ...salesInvoices.map(i => ({ type: 'sales' as const, id: i.id, title: i.invoiceNumber, subtitle: `Penjualan - ${i.customer.name}`, url: '/sales' })),
      ...purchaseInvoices.map(i => ({ type: 'purchase' as const, id: i.id, title: i.invoiceNumber, subtitle: `Pembelian - ${i.supplier.name}`, url: '/purchase' })),
      ...payments.map(p => ({ type: 'payment' as const, id: p.id, title: p.paymentNumber, subtitle: `${p.paymentType === 'Receive' ? 'Penerimaan' : 'Pengeluaran'}`, url: '/payments' })),
      ...journals.map(j => ({ type: 'journal' as const, id: j.id, title: j.entryNumber, subtitle: j.narration?.substring(0, 50), url: '/gl' })),
      ...accounts.map(a => ({ type: 'account' as const, id: a.id, title: `${a.accountNumber} ${a.name}`, subtitle: 'Akun', url: '/coa' })),
    ];

    return res.json(results.slice(0, limit));
  } catch (error) {
    logger.error({ error }, 'GET /search error');
    return res.status(500).json({ error: 'Gagal melakukan pencarian.' });
  }
});

export default router;
