import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { roleMiddleware } from '../middleware/auth';
import { systemAccounts } from '../services/systemAccounts';
import { logger } from '../lib/logger';
import fixedAssetsRouter from './dashboard/fixedAssets';

const router = Router();

// Helper: parse optional startDate / endDate query params.
// Fallback defaults set by caller via fallback args.
function parseRange(
  req: { query: Record<string, unknown> },
  defaults: { start: Date; end?: Date },
): { start: Date; end: Date } {
  const s = typeof req.query.startDate === 'string' ? req.query.startDate : '';
  const e = typeof req.query.endDate === 'string' ? req.query.endDate : '';
  const parsedStart = s ? new Date(s) : defaults.start;
  const parsedEnd = e ? new Date(e + 'T23:59:59.999') : (defaults.end ?? new Date());
  const start = isNaN(parsedStart.getTime()) ? defaults.start : parsedStart;
  const end = isNaN(parsedEnd.getTime()) ? (defaults.end ?? new Date()) : parsedEnd;
  return { start, end };
}

// All dashboard endpoints require at least Viewer role
router.use(roleMiddleware(['Admin', 'Accountant', 'Viewer']));

// Sub-router untuk widget Aset Tetap (single comprehensive endpoint).
router.use('/fixed-assets', fixedAssetsRouter);

// GET /api/dashboard/metrics
router.get('/metrics', async (req, res) => {
  try {
    const cashAccounts = await systemAccounts.getAccounts('CASH');
    // Fetch actual balances for cash accounts
    const cashAccountRecords = await prisma.account.findMany({
      where: { id: { in: cashAccounts.map((a) => a.id) }, isGroup: false, isActive: true },
    });
    const cashBalance = cashAccountRecords.reduce((sum, acc) => sum + Number(acc.balance), 0);

    const [arMapping, inventoryValueResult, totalLiabilities, vendorDepositSum] = await Promise.all([
      systemAccounts.getAccount('AR'),
      prisma.account.aggregate({
        where: { accountNumber: { startsWith: '1.4.' }, isGroup: false, isActive: true },
        _sum: { balance: true },
      }),
      // Sum all LIABILITY account balances for total hutang
      prisma.account.aggregate({
        where: { rootType: 'LIABILITY' as any, isGroup: false, isActive: true },
        _sum: { balance: true },
      }),
      // Vendor deposit = sum of per-party balances (source of truth, not GL account
      // which can drift due to historical sign convention issues)
      prisma.party.aggregate({
        where: { isActive: true },
        _sum: { depositBalance: true },
      }),
    ]);

    const arAcc = await prisma.account.findUnique({ where: { id: arMapping.id }, select: { balance: true } });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const { start, end } = parseRange(req, { start: startOfMonth, end: now });

    const [revEntries, expEntries] = await Promise.all([
      prisma.accountingLedgerEntry.aggregate({
        where: { date: { gte: start, lte: end }, isCancelled: false, account: { rootType: 'REVENUE' as any } },
        _sum: { credit: true, debit: true },
      }),
      prisma.accountingLedgerEntry.aggregate({
        where: { date: { gte: start, lte: end }, isCancelled: false, account: { rootType: 'EXPENSE' as any } },
        _sum: { credit: true, debit: true },
      }),
    ]);

    const netRevenue = Number(revEntries._sum?.credit || 0) - Number(revEntries._sum?.debit || 0);
    const netExpense = Number(expEntries._sum?.debit || 0) - Number(expEntries._sum?.credit || 0);
    const netProfit = netRevenue - netExpense;

    return res.json({
      cashBalance,
      accountsReceivable: Math.max(0, Number(arAcc?.balance || 0)),
      accountsPayable: Math.max(0, Number(totalLiabilities._sum?.balance || 0)),
      vendorDeposit: Math.max(0, Number(vendorDepositSum._sum?.depositBalance || 0)),
      // Real saldo (boleh negatif) — kalau negatif berarti ada anomali di
      // pencatatan stok dan harus muncul di dashboard supaya pemilik tahu,
      // bukan disembunyikan jadi 0.
      inventoryValue: Number(inventoryValueResult._sum?.balance || 0),
      netProfit,
    });
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/metrics error');
    return res.status(500).json({ error: 'Gagal mengambil metrik dashboard.' });
  }
});

// GET /api/dashboard/charts — revenue vs expense (month-grouped, default 6 months)
router.get('/charts', async (req, res) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const { start, end } = parseRange(req, { start: sixMonthsAgo, end: now });

    const rows = await prisma.$queryRaw<Array<{ month: Date; pendapatan: bigint; beban: bigint }>>`
      SELECT
        date_trunc('month', ale.date) AS month,
        COALESCE(SUM(CASE WHEN a."rootType" = 'REVENUE' THEN ale.credit - ale.debit ELSE 0 END), 0) AS pendapatan,
        COALESCE(SUM(CASE WHEN a."rootType" = 'EXPENSE' THEN ale.debit - ale.credit ELSE 0 END), 0) AS beban
      FROM accounting_ledger_entries ale
      JOIN accounts a ON ale.account_id = a.id
      WHERE ale.date >= ${start}
        AND ale.date <= ${end}
        AND ale.is_cancelled = false
        AND a."rootType" IN ('REVENUE', 'EXPENSE')
      GROUP BY date_trunc('month', ale.date)
      ORDER BY month ASC
    `;

    // Build month labels from start → end
    const months: { key: string; name: string }[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endCap = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= endCap) {
      months.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        name: cursor.toLocaleString('id-ID', { month: 'short', year: '2-digit' }),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const rowMap = new Map(
      rows.map((r) => {
        const d = new Date(r.month);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return [key, { pendapatan: Math.max(0, Number(r.pendapatan)), beban: Math.max(0, Number(r.beban)) }];
      })
    );

    const chartData = months.map((m) => ({
      name: m.name,
      pendapatan: rowMap.get(m.key)?.pendapatan ?? 0,
      beban: rowMap.get(m.key)?.beban ?? 0,
    }));

    return res.json(chartData);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/charts error');
    return res.status(500).json({ error: 'Gagal mengambil data chart.' });
  }
});

// GET /api/dashboard/top-customers — top 5 customers by total sales
router.get('/top-customers', async (req, res) => {
  try {
    const results = await prisma.salesInvoice.groupBy({
      by: ['partyId'],
      where: { status: { notIn: ['Draft', 'Cancelled'] } },
      _sum: { grandTotal: true },
      orderBy: { _sum: { grandTotal: 'desc' } },
      take: 5,
    });

    const partyIds = results.map((r) => r.partyId);
    const parties = await prisma.party.findMany({
      where: { id: { in: partyIds } },
      select: { id: true, name: true },
    });
    const partyMap = new Map(parties.map((p) => [p.id, p.name]));

    const data = results.map((r, i) => ({
      rank: i + 1,
      partyId: r.partyId,
      partyName: partyMap.get(r.partyId) || 'Unknown',
      total: Number(r._sum.grandTotal || 0),
    }));

    return res.json(data);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/top-customers error');
    return res.status(500).json({ error: 'Gagal mengambil data pelanggan teratas.' });
  }
});

// GET /api/dashboard/overdue — overdue invoices
router.get('/overdue', async (req, res) => {
  try {
    const now = new Date();

    const [salesOverdue, purchaseOverdue] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: {
          dueDate: { lt: now },
          outstanding: { gt: 0 },
          status: { notIn: ['Draft', 'Cancelled', 'Paid'] },
        },
        include: { customer: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      prisma.purchaseInvoice.findMany({
        where: {
          dueDate: { lt: now },
          outstanding: { gt: 0 },
          status: { notIn: ['Draft', 'Cancelled', 'Paid'] },
        },
        include: { supplier: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
    ]);

    const data = [
      ...salesOverdue.map((inv) => ({
        type: 'sales' as const,
        invoiceNumber: inv.invoiceNumber,
        partyName: inv.customer.name,
        amount: Number(inv.outstanding),
        dueDate: inv.dueDate,
        daysOverdue: Math.ceil((now.getTime() - new Date(inv.dueDate!).getTime()) / (1000 * 60 * 60 * 24)),
      })),
      ...purchaseOverdue.map((inv) => ({
        type: 'purchase' as const,
        invoiceNumber: inv.invoiceNumber,
        partyName: inv.supplier.name,
        amount: Number(inv.outstanding),
        dueDate: inv.dueDate,
        daysOverdue: Math.ceil((now.getTime() - new Date(inv.dueDate!).getTime()) / (1000 * 60 * 60 * 24)),
      })),
    ]
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 10);

    return res.json(data);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/overdue error');
    return res.status(500).json({ error: 'Gagal mengambil data invoice jatuh tempo.' });
  }
});

// GET /api/dashboard/expense-breakdown — expenses by category for period (default current month)
router.get('/expense-breakdown', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const { start, end } = parseRange(req, { start: startOfMonth, end: now });

    const entries = await prisma.accountingLedgerEntry.groupBy({
      by: ['accountId'],
      where: {
        date: { gte: start, lte: end },
        isCancelled: false,
        account: { rootType: 'EXPENSE' as any },
      },
      _sum: { debit: true, credit: true },
    });

    const accountIds = entries.map((e) => e.accountId);
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, name: true, accountNumber: true },
    });
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    const data = entries
      .map((e) => {
        const acc = accountMap.get(e.accountId);
        const amount = Number(e._sum.debit || 0) - Number(e._sum.credit || 0);
        return {
          accountId: e.accountId,
          accountName: acc?.name || 'Unknown',
          accountNumber: acc?.accountNumber || '',
          amount: Math.max(0, amount),
        };
      })
      .filter((d) => d.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    return res.json(data);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/expense-breakdown error');
    return res.status(500).json({ error: 'Gagal mengambil data breakdown beban.' });
  }
});

// GET /api/dashboard/stock-alerts — items where currentStock < minimumStock
router.get('/stock-alerts', async (req, res) => {
  try {
    const rawAlerts = await prisma.$queryRaw<any[]>`
      SELECT id, code, name, unit, category, current_stock AS "currentStock", minimum_stock AS "minimumStock"
      FROM inventory_items
      WHERE is_active = true AND minimum_stock > 0 AND current_stock <= minimum_stock
      ORDER BY current_stock ASC
      LIMIT 20
    `;

    const alerts = rawAlerts.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      currentStock: Number(item.currentStock),
      minimumStock: Number(item.minimumStock),
      status: Number(item.currentStock) === 0 ? 'Habis' : 'Rendah',
    }));

    return res.json(alerts);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/stock-alerts error');
    return res.status(500).json({ error: 'Gagal mengambil data stok alert.' });
  }
});

// GET /api/dashboard/pending-do — Surat Jalan Submitted yang belum jadi
// invoice. Dipakai widget Dashboard supaya DO lama tidak terlupa diinvoice
// (kasus user 24 Mei: DO BGN Viva 17 Mei nyangkut 7 hari).
router.get('/pending-do', async (_req, res) => {
  try {
    const rows = await prisma.deliveryOrder.findMany({
      where: { status: 'Submitted', invoiceId: null },
      include: {
        customer: { select: { id: true, name: true } },
        items: { select: { quantity: true, unit: true } },
      },
      orderBy: { date: 'asc' },
      take: 50,
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = rows.map((d) => {
      const doDate = new Date(d.date);
      doDate.setHours(0, 0, 0, 0);
      const ageDays = Math.max(0, Math.floor((today.getTime() - doDate.getTime()) / 86400000));
      const totalQty = d.items.reduce((s, it) => s + Number(it.quantity), 0);
      const unit = d.items[0]?.unit ?? '';
      return {
        id: d.id,
        doNumber: d.doNumber,
        date: d.date,
        customer: d.customer,
        itemCount: d.items.length,
        totalQty,
        unit,
        ageDays,
      };
    });
    return res.json(result);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/pending-do error');
    return res.status(500).json({ error: 'Gagal mengambil DO pending.' });
  }
});

// GET /api/dashboard/negative-stock — items dengan stok < 0 (item-level atau
// per-gudang). Plus latest movement utk konteks "siapa & kapan & kenapa".
// Widget Dashboard ini dipake monitor bypass admin (sejak v3.2.1).
router.get('/negative-stock', async (_req, res) => {
  try {
    const items = await prisma.$queryRaw<any[]>`
      SELECT
        ii.id, ii.code, ii.name, ii.unit, ii.current_stock AS "currentStock",
        (
          SELECT json_agg(json_build_object(
            'warehouseCode', w.code,
            'warehouseName', w.name,
            'currentStock', invs.current_stock
          ))
          FROM inventory_stocks invs
          JOIN warehouses w ON w.id = invs.warehouse_id
          WHERE invs.item_id = ii.id AND invs.current_stock < 0
        ) AS "negativeWarehouses",
        (
          SELECT sm.created_at FROM stock_movements sm
          WHERE sm.item_id = ii.id AND sm.is_cancelled = false
          ORDER BY sm.created_at DESC LIMIT 1
        ) AS "lastMovementAt"
      FROM inventory_items ii
      WHERE ii.is_active = true
        AND (
          ii.current_stock < 0
          OR EXISTS (
            SELECT 1 FROM inventory_stocks invs
            WHERE invs.item_id = ii.id AND invs.current_stock < 0
          )
        )
      ORDER BY ii.current_stock ASC
      LIMIT 50
    `;
    const result = items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      unit: i.unit,
      currentStock: Number(i.currentStock),
      negativeWarehouses: i.negativeWarehouses || [],
      lastMovementAt: i.lastMovementAt,
    }));
    return res.json(result);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/negative-stock error');
    return res.status(500).json({ error: 'Gagal mengambil data stok minus.' });
  }
});

// GET /api/dashboard/cash-flow — daily cash in/out for period (default current month)
router.get('/cash-flow', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const { start, end } = parseRange(req, { start: startOfMonth, end: now });

    const rows = await prisma.$queryRaw<Array<{ day: Date; cash_in: number; cash_out: number }>>`
      SELECT date_trunc('day', p.date) AS day,
             COALESCE(SUM(CASE WHEN p.payment_type = 'Receive' THEN p.amount ELSE 0 END), 0) AS cash_in,
             COALESCE(SUM(CASE WHEN p.payment_type = 'Pay' THEN p.amount ELSE 0 END), 0) AS cash_out
        FROM payments p
       WHERE p.date >= ${start}
         AND p.date <= ${end}
         AND p.status = 'Submitted'
       GROUP BY date_trunc('day', p.date)
       ORDER BY day
    `;

    const days = rows.map((r) => ({
      date: r.day,
      cashIn: Number(r.cash_in),
      cashOut: Number(r.cash_out),
    }));

    const totalIn = days.reduce((s, d) => s + d.cashIn, 0);
    const totalOut = days.reduce((s, d) => s + d.cashOut, 0);

    res.json({ days, totalIn, totalOut, net: totalIn - totalOut });
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/cash-flow error');
    res.status(500).json({ error: 'Gagal mengambil data cash flow.' });
  }
});

// GET /api/dashboard/financial-ratios — key financial ratios
router.get('/financial-ratios', async (_req, res) => {
  try {
    const [currentAssets, currentLiabilities, totalAssets, totalLiabilities, totalEquity] = await Promise.all([
      prisma.account.aggregate({
        where: { rootType: 'ASSET' as any, accountNumber: { startsWith: '1.' }, isGroup: false, isActive: true },
        _sum: { balance: true },
      }),
      prisma.account.aggregate({
        where: { rootType: 'LIABILITY' as any, accountNumber: { startsWith: '2.' }, isGroup: false, isActive: true },
        _sum: { balance: true },
      }),
      prisma.account.aggregate({
        where: { rootType: 'ASSET' as any, isGroup: false, isActive: true },
        _sum: { balance: true },
      }),
      prisma.account.aggregate({
        where: { rootType: 'LIABILITY' as any, isGroup: false, isActive: true },
        _sum: { balance: true },
      }),
      prisma.account.aggregate({
        where: { rootType: 'EQUITY' as any, isGroup: false, isActive: true },
        _sum: { balance: true },
      }),
    ]);

    const ca = Number(currentAssets._sum?.balance || 0);
    const cl = Number(currentLiabilities._sum?.balance || 0);
    const ta = Number(totalAssets._sum?.balance || 0);
    const tl = Number(totalLiabilities._sum?.balance || 0);
    const te = Number(totalEquity._sum?.balance || 0);

    res.json({
      currentRatio: cl > 0 ? +(ca / cl).toFixed(2) : 0,
      debtToEquity: te > 0 ? +(tl / te).toFixed(2) : 0,
      debtToAsset: ta > 0 ? +(tl / ta).toFixed(2) : 0,
      totalAssets: ta,
      totalLiabilities: tl,
      totalEquity: te,
    });
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/financial-ratios error');
    res.status(500).json({ error: 'Gagal menghitung rasio keuangan.' });
  }
});

// GET /api/dashboard/monthly-profit — monthly profit trend (default 12 months, customizable via startDate/endDate)
router.get('/monthly-profit', async (req, res) => {
  try {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const { start, end } = parseRange(req, { start: twelveMonthsAgo, end: now });

    const rows = await prisma.$queryRaw<Array<{ month: Date; revenue: number; expense: number }>>`
      SELECT
        date_trunc('month', ale.date) AS month,
        COALESCE(SUM(CASE WHEN a."rootType" = 'REVENUE' THEN ale.credit - ale.debit ELSE 0 END), 0) AS revenue,
        COALESCE(SUM(CASE WHEN a."rootType" = 'EXPENSE' THEN ale.debit - ale.credit ELSE 0 END), 0) AS expense
      FROM accounting_ledger_entries ale
      JOIN accounts a ON ale.account_id = a.id
      WHERE ale.date >= ${start}
        AND ale.date <= ${end}
        AND ale.is_cancelled = false
        AND a."rootType" IN ('REVENUE', 'EXPENSE')
      GROUP BY date_trunc('month', ale.date)
      ORDER BY month ASC
    `;

    const months: { key: string; name: string }[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endCap = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= endCap) {
      months.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        name: cursor.toLocaleString('id-ID', { month: 'short', year: '2-digit' }),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const rowMap = new Map(
      rows.map((r) => {
        const d = new Date(r.month);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return [key, { revenue: Math.max(0, Number(r.revenue)), expense: Math.max(0, Number(r.expense)) }];
      })
    );

    const data = months.map((m) => {
      const vals = rowMap.get(m.key);
      const revenue = vals?.revenue ?? 0;
      const expense = vals?.expense ?? 0;
      return { name: m.name, revenue, expense, profit: revenue - expense };
    });

    res.json(data);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/monthly-profit error');
    res.status(500).json({ error: 'Gagal mengambil data profit bulanan.' });
  }
});

// GET /api/dashboard/aging-summary — AP/AR aging summary
router.get('/aging-summary', async (_req, res) => {
  try {
    const now = new Date();
    const aging = (invoices: Array<{ outstanding: any; dueDate: Date | null }>) => {
      const buckets = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
      for (const inv of invoices) {
        const amt = Number(inv.outstanding);
        if (!inv.dueDate || inv.dueDate >= now) { buckets.current += amt; continue; }
        const days = Math.ceil((now.getTime() - inv.dueDate.getTime()) / 86400000);
        if (days <= 30) buckets.days30 += amt;
        else if (days <= 60) buckets.days60 += amt;
        else if (days <= 90) buckets.days90 += amt;
        else buckets.over90 += amt;
      }
      return buckets;
    };

    const [salesInvoices, purchaseInvoices] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: { outstanding: { gt: 0 }, status: { notIn: ['Draft', 'Cancelled'] } },
        select: { outstanding: true, dueDate: true },
      }),
      prisma.purchaseInvoice.findMany({
        where: { outstanding: { gt: 0 }, status: { notIn: ['Draft', 'Cancelled'] } },
        select: { outstanding: true, dueDate: true },
      }),
    ]);

    const arBuckets = aging(salesInvoices);
    const apBuckets = aging(purchaseInvoices);

    const toBucketArray = (b: typeof arBuckets) => [
      { label: 'Belum JT', amount: b.current },
      { label: '1-30 hari', amount: b.days30 },
      { label: '31-60 hari', amount: b.days60 },
      { label: '61-90 hari', amount: b.days90 },
      { label: '>90 hari', amount: b.over90 },
    ];

    const totalReceivable = Object.values(arBuckets).reduce((s, v) => s + v, 0);
    const totalPayable = Object.values(apBuckets).reduce((s, v) => s + v, 0);

    res.json({
      receivable: toBucketArray(arBuckets),
      payable: toBucketArray(apBuckets),
      totalReceivable,
      totalPayable,
    });
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/aging-summary error');
    res.status(500).json({ error: 'Gagal mengambil data aging.' });
  }
});

// GET /api/dashboard/cash-position — saldo per akun kas/bank
router.get('/cash-position', async (_req, res) => {
  try {
    const cashAccounts = await systemAccounts.getAccounts('CASH');
    const ids = cashAccounts.map((a) => a.id);
    if (ids.length === 0) return res.json({ accounts: [], total: 0 });

    const accounts = await prisma.account.findMany({
      where: { id: { in: ids }, isActive: true, isGroup: false },
      select: { id: true, accountNumber: true, name: true, balance: true },
      orderBy: { accountNumber: 'asc' },
    });

    const data = accounts.map((a) => ({
      accountId: a.id,
      accountNumber: a.accountNumber,
      name: a.name,
      balance: Number(a.balance),
    }));
    const total = data.reduce((s, a) => s + a.balance, 0);

    return res.json({ accounts: data, total });
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/cash-position error');
    return res.status(500).json({ error: 'Gagal mengambil data posisi kas.' });
  }
});

// GET /api/dashboard/top-vendors — top 5 vendor by purchase total
router.get('/top-vendors', async (_req, res) => {
  try {
    const results = await prisma.purchaseInvoice.groupBy({
      by: ['partyId'],
      where: { status: { notIn: ['Draft', 'Cancelled'] } },
      _sum: { grandTotal: true },
      orderBy: { _sum: { grandTotal: 'desc' } },
      take: 5,
    });

    const partyIds = results.map((r) => r.partyId);
    const parties = await prisma.party.findMany({
      where: { id: { in: partyIds } },
      select: { id: true, name: true },
    });
    const partyMap = new Map(parties.map((p) => [p.id, p.name]));

    const data = results.map((r, i) => ({
      rank: i + 1,
      partyId: r.partyId,
      partyName: partyMap.get(r.partyId) || 'Unknown',
      total: Number(r._sum.grandTotal || 0),
    }));

    return res.json(data);
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/top-vendors error');
    return res.status(500).json({ error: 'Gagal mengambil data vendor teratas.' });
  }
});

export default router;
