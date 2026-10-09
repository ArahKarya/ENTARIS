// Operational reports (HPP, payable schedule, receivable schedule, daily).
// Split out from the main reports.ts to keep that file under the audit's
// 800-line target. Role gate is applied here too because this sub-router
// is mounted standalone in reports.ts.
import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { systemAccounts } from '../../services/systemAccounts';
import { buildStockSnapshot } from '../../services/stockSnapshot';

const router = Router();

function parseQueryDate(value: unknown, endOfDay = false): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

router.get('/hpp', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate as string) : new Date();

    // Get sales with COGS: each sale item with its inventory item cost
    const salesItems = await prisma.$queryRaw<Array<{
      item_id: string;
      item_code: string;
      item_name: string;
      category: string;
      total_qty: number;
      total_revenue: number;
      total_cogs: number;
    }>>`
      SELECT
        ii.id AS item_id,
        ii.code AS item_code,
        ii.name AS item_name,
        COALESCE(ii.category, 'Lainnya') AS category,
        SUM(si.quantity) AS total_qty,
        SUM(si.amount) AS total_revenue,
        SUM(si.quantity * ii.average_cost) AS total_cogs
      FROM sales_invoice_items si
      JOIN sales_invoices s ON s.id = si.sales_invoice_id
      LEFT JOIN inventory_items ii ON ii.id = si.inventory_item_id
      WHERE s.status NOT IN ('Draft', 'Cancelled')
        AND s.date >= ${start}
        AND s.date <= ${end}
        AND si.inventory_item_id IS NOT NULL
      GROUP BY ii.id, ii.code, ii.name, ii.category
      ORDER BY SUM(si.amount) DESC
    `;

    const totalRevenue = salesItems.reduce((s, i) => s + Number(i.total_revenue), 0);
    const totalCogs = salesItems.reduce((s, i) => s + Number(i.total_cogs), 0);

    res.json({
      period: { start, end },
      items: salesItems.map((i) => ({
        itemId: i.item_id,
        itemCode: i.item_code,
        itemName: i.item_name,
        category: i.category,
        totalQty: Number(i.total_qty),
        totalRevenue: Number(i.total_revenue),
        totalCogs: Number(i.total_cogs),
        grossMargin: Number(i.total_revenue) - Number(i.total_cogs),
        marginPct: Number(i.total_revenue) > 0
          ? +((Number(i.total_revenue) - Number(i.total_cogs)) / Number(i.total_revenue) * 100).toFixed(1)
          : 0,
      })),
      summary: {
        totalRevenue,
        totalCogs,
        grossProfit: totalRevenue - totalCogs,
        grossMarginPct: totalRevenue > 0 ? +((totalRevenue - totalCogs) / totalRevenue * 100).toFixed(1) : 0,
      },
    });
  } catch (error) {
    logger.error({ error }, 'GET /reports/hpp error');
    res.status(500).json({ error: 'Gagal mengambil laporan HPP.' });
  }
});

// GET /api/reports/profitability-per-sku — Phase 6 loaded-margin report
// For each SKU, compare revenue vs material WAC vs loaded HPP (when sale lines
// were linked to a specific batch via Phase 5 picker). Both basis shown side
// by side so user can decide which is most representative.
//
// `material_cogs` = sum(qty × inventory_item.average_cost)  (WAC at query time)
// `loaded_cogs`   = sum(qty × COALESCE(si.unit_cost_loaded, batch.unit_cost,
//                                       inventory_item.average_cost))
// loaded_cogs falls back gracefully when no batch pick / no loaded HPP, so
// the report still produces a number even for legacy invoices.
router.get('/profitability-per-sku', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate as string) : new Date();
    end.setHours(23, 59, 59, 999);

    const rows = await prisma.$queryRaw<Array<{
      item_id: string;
      item_code: string;
      item_name: string;
      unit: string;
      category: string;
      total_qty: number;
      total_revenue: number;
      material_cogs: number;
      loaded_cogs: number;
      lines_with_batch: number;
      total_lines: number;
    }>>`
      SELECT
        ii.id            AS item_id,
        ii.code          AS item_code,
        ii.name          AS item_name,
        ii.unit          AS unit,
        COALESCE(ii.category, 'Lainnya') AS category,
        SUM(si.quantity) AS total_qty,
        SUM(si.amount)   AS total_revenue,
        SUM(si.quantity * ii.average_cost) AS material_cogs,
        SUM(si.quantity * COALESCE(si.unit_cost_loaded, ii.average_cost)) AS loaded_cogs,
        SUM(CASE WHEN si.unit_cost_loaded IS NOT NULL THEN 1 ELSE 0 END) AS lines_with_batch,
        COUNT(*) AS total_lines
      FROM sales_invoice_items si
      JOIN sales_invoices s ON s.id = si.sales_invoice_id
      LEFT JOIN inventory_items ii ON ii.id = si.inventory_item_id
      WHERE s.status NOT IN ('Draft', 'Cancelled')
        AND s.date >= ${start}
        AND s.date <= ${end}
        AND si.inventory_item_id IS NOT NULL
      GROUP BY ii.id, ii.code, ii.name, ii.unit, ii.category
      ORDER BY SUM(si.amount) DESC
    `;

    const items = rows.map((r) => {
      const revenue = Number(r.total_revenue);
      const materialCogs = Number(r.material_cogs);
      const loadedCogs = Number(r.loaded_cogs);
      return {
        itemId: r.item_id,
        itemCode: r.item_code,
        itemName: r.item_name,
        unit: r.unit,
        category: r.category,
        totalQty: Number(r.total_qty),
        totalRevenue: revenue,
        materialCogs,
        loadedCogs,
        materialMargin: revenue - materialCogs,
        loadedMargin: revenue - loadedCogs,
        materialMarginPct: revenue > 0 ? +(((revenue - materialCogs) / revenue) * 100).toFixed(1) : 0,
        loadedMarginPct: revenue > 0 ? +(((revenue - loadedCogs) / revenue) * 100).toFixed(1) : 0,
        linesWithBatch: Number(r.lines_with_batch),
        totalLines: Number(r.total_lines),
        coveragePct: Number(r.total_lines) > 0
          ? +((Number(r.lines_with_batch) / Number(r.total_lines)) * 100).toFixed(0)
          : 0,
      };
    });

    const totalRevenue = items.reduce((s, i) => s + i.totalRevenue, 0);
    const totalMaterialCogs = items.reduce((s, i) => s + i.materialCogs, 0);
    const totalLoadedCogs = items.reduce((s, i) => s + i.loadedCogs, 0);

    return res.json({
      period: { start, end },
      items,
      summary: {
        totalRevenue,
        totalMaterialCogs,
        totalLoadedCogs,
        materialGrossProfit: totalRevenue - totalMaterialCogs,
        loadedGrossProfit: totalRevenue - totalLoadedCogs,
        materialMarginPct: totalRevenue > 0
          ? +(((totalRevenue - totalMaterialCogs) / totalRevenue) * 100).toFixed(1)
          : 0,
        loadedMarginPct: totalRevenue > 0
          ? +(((totalRevenue - totalLoadedCogs) / totalRevenue) * 100).toFixed(1)
          : 0,
      },
    });
  } catch (error) {
    logger.error({ error }, 'GET /reports/profitability-per-sku error');
    return res.status(500).json({ error: 'Gagal mengambil laporan profitability per SKU.' });
  }
});

// GET /api/reports/production-cost-summary — Modal per Periode (laporan manajemen).
// Per output utama × gudang: kg bahan, nilai bahan (REAL, dari batch/invoice),
// kg output, rendemen, modal bahan baku murni/kg (WAC 2 = nilai bahan ÷ kg output)
// vs HPP GL/kg (nilai yang diposting = bahan − NRV produk samping + biaya konversi).
// Informasi saja — tidak membuat jurnal.
router.get('/production-cost-summary', async (req, res) => {
  try {
    const start = parseQueryDate(req.query.startDate) ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = parseQueryDate(req.query.endDate, true) ?? new Date();
    const warehouseId = typeof req.query.warehouseId === 'string' && req.query.warehouseId ? req.query.warehouseId : null;

    const rows = await prisma.$queryRaw<Array<{
      run_id: string; run_number: string; date: Date; output_name: string | null; warehouse_name: string | null;
      warehouse_id: string | null; input_kg: string | null; input_rp: string | null; main_kg: string | null;
      main_rp: string | null; bp_kg: string | null; bp_rp: string | null; cost_rp: string | null;
    }>>`
      WITH runs AS (
        SELECT pr.id, pr.run_number, pr.date FROM production_runs pr
        WHERE NOT pr.is_cancelled AND pr.date >= ${start} AND pr.date <= ${end}
      ),
      main_items AS (
        SELECT DISTINCT i.production_run_id run_id, i.item_id FROM production_run_items i
        JOIN runs r ON r.id = i.production_run_id
        WHERE i.line_type = 'Output' AND NOT i.is_by_product
      ),
      mv AS (
        SELECT sm.reference_id run_id, sm.movement_type::text mt, sm.item_id, sm.warehouse_id,
               sm.quantity::numeric q, sm.total_value::numeric tv,
               EXISTS (SELECT 1 FROM main_items m WHERE m.run_id = sm.reference_id AND m.item_id = sm.item_id) is_main
        FROM stock_movements sm JOIN runs r ON r.id = sm.reference_id
        WHERE NOT sm.is_cancelled
      )
      SELECT r.id run_id, r.run_number, r.date,
        (SELECT string_agg(DISTINCT ii.name, ' + ') FROM main_items m JOIN inventory_items ii ON ii.id = m.item_id WHERE m.run_id = r.id) output_name,
        (SELECT string_agg(DISTINCT w.name, ', ') FROM mv JOIN warehouses w ON w.id = mv.warehouse_id WHERE mv.run_id = r.id AND mv.mt = 'In' AND mv.is_main) warehouse_name,
        (SELECT min(mv.warehouse_id) FROM mv WHERE mv.run_id = r.id AND mv.mt = 'In' AND mv.is_main) warehouse_id,
        (SELECT sum(q) FROM mv WHERE mv.run_id = r.id AND mt = 'Out')::text input_kg,
        (SELECT sum(tv) FROM mv WHERE mv.run_id = r.id AND mt = 'Out')::text input_rp,
        (SELECT sum(q) FROM mv WHERE mv.run_id = r.id AND mt = 'In' AND is_main)::text main_kg,
        (SELECT sum(tv) FROM mv WHERE mv.run_id = r.id AND mt = 'In' AND is_main)::text main_rp,
        (SELECT sum(q) FROM mv WHERE mv.run_id = r.id AND mt = 'In' AND NOT is_main)::text bp_kg,
        (SELECT sum(tv) FROM mv WHERE mv.run_id = r.id AND mt = 'In' AND NOT is_main)::text bp_rp,
        (SELECT sum(c.total_amount) FROM production_run_costs c WHERE c.production_run_id = r.id)::text cost_rp
      FROM runs r ORDER BY r.date, r.run_number
    `;

    const n = (v: string | null) => (v == null ? 0 : Number(v));
    const runs = rows
      .filter((r) => !warehouseId || r.warehouse_id === warehouseId)
      .filter((r) => n(r.main_kg) > 0)
      .map((r) => {
        const inputKg = n(r.input_kg), inputRp = n(r.input_rp), mainKg = n(r.main_kg), mainRp = n(r.main_rp);
        return {
          runId: r.run_id, runNumber: r.run_number, date: r.date,
          outputName: r.output_name ?? '-', warehouseName: r.warehouse_name ?? '-',
          inputKg, inputRp, mainKg, mainRp, byproductKg: n(r.bp_kg), byproductRp: n(r.bp_rp), conversionCostRp: n(r.cost_rp),
          yieldPct: inputKg > 0 ? (mainKg / inputKg) * 100 : 0,
          inputPerKg: inputKg > 0 ? inputRp / inputKg : 0,
          rawMaterialPerKg: mainKg > 0 ? inputRp / mainKg : 0,
          glPerKg: mainKg > 0 ? mainRp / mainKg : 0,
        };
      });

    type Agg = { outputName: string; warehouseName: string; runCount: number; inputKg: number; inputRp: number; mainKg: number; mainRp: number; byproductKg: number; byproductRp: number; conversionCostRp: number };
    const groups = new Map<string, Agg>();
    const total: Agg = { outputName: 'TOTAL', warehouseName: '', runCount: 0, inputKg: 0, inputRp: 0, mainKg: 0, mainRp: 0, byproductKg: 0, byproductRp: 0, conversionCostRp: 0 };
    for (const r of runs) {
      const key = `${r.outputName}|${r.warehouseName}`;
      const g = groups.get(key) ?? { outputName: r.outputName, warehouseName: r.warehouseName, runCount: 0, inputKg: 0, inputRp: 0, mainKg: 0, mainRp: 0, byproductKg: 0, byproductRp: 0, conversionCostRp: 0 };
      for (const t of [g, total]) {
        t.runCount += 1; t.inputKg += r.inputKg; t.inputRp += r.inputRp; t.mainKg += r.mainKg; t.mainRp += r.mainRp;
        t.byproductKg += r.byproductKg; t.byproductRp += r.byproductRp; t.conversionCostRp += r.conversionCostRp;
      }
      groups.set(key, g);
    }
    const derive = (g: Agg) => ({
      ...g,
      yieldPct: g.inputKg > 0 ? (g.mainKg / g.inputKg) * 100 : 0,
      inputPerKg: g.inputKg > 0 ? g.inputRp / g.inputKg : 0,
      rawMaterialPerKg: g.mainKg > 0 ? g.inputRp / g.mainKg : 0,
      glPerKg: g.mainKg > 0 ? g.mainRp / g.mainKg : 0,
    });
    const summary = [...groups.values()].map(derive)
      .sort((a, b) => a.warehouseName.localeCompare(b.warehouseName) || a.outputName.localeCompare(b.outputName));

    return res.json({ period: { start, end }, summary, total: derive(total), runs });
  } catch (error) {
    logger.error({ error }, 'GET /reports/production-cost-summary error');
    return res.status(500).json({ error: 'Gagal mengambil laporan modal produksi.' });
  }
});

// GET /api/reports/payable-schedule — hutang jatuh tempo & jadwal pembayaran
router.get('/payable-schedule', async (req, res) => {
  try {
    const invoices = await prisma.purchaseInvoice.findMany({
      where: {
        outstanding: { gt: 0 },
        status: { notIn: ['Draft', 'Cancelled'] },
      },
      include: {
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const now = new Date();
    const data = invoices.map((inv) => {
      const daysUntilDue = inv.dueDate
        ? Math.ceil((inv.dueDate.getTime() - now.getTime()) / 86400000)
        : null;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        supplierName: inv.supplier.name,
        supplierId: inv.supplier.id,
        date: inv.date,
        dueDate: inv.dueDate,
        grandTotal: Number(inv.grandTotal),
        outstanding: Number(inv.outstanding),
        daysUntilDue,
        status: !inv.dueDate ? 'no_due_date'
          : daysUntilDue! < 0 ? 'overdue'
          : daysUntilDue! <= 7 ? 'due_soon'
          : 'on_track',
      };
    });

    const totalOutstanding = data.reduce((s, i) => s + i.outstanding, 0);
    const overdueAmount = data.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.outstanding, 0);
    const dueSoonAmount = data.filter((i) => i.status === 'due_soon').reduce((s, i) => s + i.outstanding, 0);

    res.json({
      invoices: data,
      summary: { totalOutstanding, overdueAmount, dueSoonAmount, totalInvoices: data.length },
    });
  } catch (error) {
    logger.error({ error }, 'GET /reports/payable-schedule error');
    res.status(500).json({ error: 'Gagal mengambil jadwal hutang.' });
  }
});

// GET /api/reports/receivable-schedule — piutang jatuh tempo
router.get('/receivable-schedule', async (req, res) => {
  try {
    const invoices = await prisma.salesInvoice.findMany({
      where: {
        outstanding: { gt: 0 },
        status: { notIn: ['Draft', 'Cancelled'] },
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const now = new Date();
    const data = invoices.map((inv) => {
      const daysUntilDue = inv.dueDate
        ? Math.ceil((inv.dueDate.getTime() - now.getTime()) / 86400000)
        : null;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer.name,
        customerId: inv.customer.id,
        date: inv.date,
        dueDate: inv.dueDate,
        grandTotal: Number(inv.grandTotal),
        outstanding: Number(inv.outstanding),
        daysUntilDue,
        status: !inv.dueDate ? 'no_due_date'
          : daysUntilDue! < 0 ? 'overdue'
          : daysUntilDue! <= 7 ? 'due_soon'
          : 'on_track',
      };
    });

    const totalOutstanding = data.reduce((s, i) => s + i.outstanding, 0);
    const overdueAmount = data.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.outstanding, 0);

    res.json({
      invoices: data,
      summary: { totalOutstanding, overdueAmount, totalInvoices: data.length },
    });
  } catch (error) {
    logger.error({ error }, 'GET /reports/receivable-schedule error');
    res.status(500).json({ error: 'Gagal mengambil jadwal piutang.' });
  }
});

// GET /api/reports/daily — consolidated daily activity report
router.get('/daily', async (req, res) => {
  const { date: rawDate } = req.query;
  const dateStr = typeof rawDate === 'string' && rawDate ? rawDate : new Date().toISOString().slice(0, 10);
  const dayStart = new Date(dateStr);
  if (isNaN(dayStart.getTime())) {
    return res.status(400).json({ error: 'Parameter date tidak valid.' });
  }
  const dayEnd = new Date(dateStr);
  dayEnd.setHours(23, 59, 59, 999);

  try {
    const activeStatus = { notIn: ['Draft' as const, 'Cancelled' as const] };
    const dayRange = { gte: dayStart, lte: dayEnd };

    const [
      salesInvoices,
      purchaseInvoices,
      productionRuns,
      paymentsData,
      manualJournals,
      arInvoices,
      apInvoices,
      vendorDepositPayments,
    ] = await Promise.all([
      // 1. Sales invoices of the day
      prisma.salesInvoice.findMany({
        where: { date: dayRange, status: activeStatus },
        include: {
          customer: { select: { name: true } },
          items: { select: { itemName: true, quantity: true, unit: true, amount: true } },
        },
        orderBy: { date: 'asc' },
      }),
      // 2. Purchase invoices of the day
      prisma.purchaseInvoice.findMany({
        where: { date: dayRange, status: activeStatus },
        include: {
          supplier: { select: { name: true } },
          items: { select: { itemName: true, quantity: true, unit: true, amount: true } },
        },
        orderBy: { date: 'asc' },
      }),
      // 3. Production runs of the day
      prisma.productionRun.findMany({
        where: { date: dayRange, isCancelled: false },
        include: {
          items: { include: { item: { select: { name: true, unit: true } } } },
        },
        orderBy: { date: 'asc' },
      }),
      // 4. Payments of the day
      prisma.payment.findMany({
        where: { date: dayRange, status: 'Submitted' },
        include: {
          party: { select: { name: true } },
          account: { select: { name: true, accountNumber: true } },
        },
        orderBy: { date: 'asc' },
      }),
      // 5. Manual journal count of the day
      prisma.journalEntry.count({
        where: { date: dayRange, status: 'Submitted' },
      }),
      // 6. All outstanding AR invoices (as of end of day)
      prisma.salesInvoice.findMany({
        where: { outstanding: { gt: 0 }, status: activeStatus },
        include: { customer: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      // 7. All outstanding AP invoices
      prisma.purchaseInvoice.findMany({
        where: { outstanding: { gt: 0 }, status: activeStatus },
        include: { supplier: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      // 8. Vendor deposits
      prisma.payment.findMany({
        where: { paymentType: 'VendorDeposit', status: 'Submitted' },
        include: {
          party: { select: { name: true } },
          depositApplications: { select: { appliedAmount: true } },
        },
        orderBy: { date: 'desc' },
      }),
    ]);

    // Cash/bank balances
    const cashAccountsMapped = await systemAccounts.getAccounts('CASH');
    const cashAccountIds = cashAccountsMapped.map((a) => a.id);
    const cashAccountRows = cashAccountIds.length > 0
      ? await prisma.account.findMany({
          where: { id: { in: cashAccountIds } },
          select: { id: true, name: true, accountNumber: true, balance: true },
        })
      : [];
    const cashBalances = cashAccountRows.map((a) => ({
      accountName: a.name,
      accountNumber: a.accountNumber,
      balance: Number(a.balance),
    }));

    // 1. Sales summary
    const sales = {
      invoices: salesInvoices.map((si) => ({
        invoiceNumber: si.invoiceNumber,
        customerName: si.customer?.name || '—',
        items: si.items.map((it) => ({ itemName: it.itemName, quantity: Number(it.quantity), unit: it.unit, amount: Number(it.amount) })),
        totalQty: si.items.reduce((s, it) => s + Number(it.quantity), 0),
        grandTotal: Number(si.grandTotal),
        outstanding: Number(si.outstanding),
      })),
      summary: {
        count: salesInvoices.length,
        totalRevenue: salesInvoices.reduce((s, si) => s + Number(si.grandTotal), 0),
        totalNewReceivables: salesInvoices.reduce((s, si) => s + Number(si.outstanding), 0),
        totalQty: salesInvoices.reduce((s, si) => s + si.items.reduce((ss, it) => ss + Number(it.quantity), 0), 0),
      },
    };

    // 2. Purchases summary
    const purchases = {
      invoices: purchaseInvoices.map((pi) => ({
        invoiceNumber: pi.invoiceNumber,
        supplierName: pi.supplier?.name || '—',
        items: pi.items.map((it) => ({ itemName: it.itemName, quantity: Number(it.quantity), unit: it.unit, amount: Number(it.amount) })),
        totalQty: pi.items.reduce((s, it) => s + Number(it.quantity), 0),
        grandTotal: Number(pi.grandTotal),
        outstanding: Number(pi.outstanding),
      })),
      summary: {
        count: purchaseInvoices.length,
        totalSpend: purchaseInvoices.reduce((s, pi) => s + Number(pi.grandTotal), 0),
        totalNewPayables: purchaseInvoices.reduce((s, pi) => s + Number(pi.outstanding), 0),
        totalQty: purchaseInvoices.reduce((s, pi) => s + pi.items.reduce((ss, it) => ss + Number(it.quantity), 0), 0),
      },
    };

    // 3. Production summary
    const production = {
      runs: productionRuns.map((pr) => {
        const inputs = pr.items.filter((i) => i.lineType === 'Input');
        const outputs = pr.items.filter((i) => i.lineType === 'Output');
        return {
          runNumber: pr.runNumber,
          date: pr.date,
          inputs: inputs.map((i) => ({ itemName: i.item.name, quantity: Number(i.quantity), unit: i.item.unit })),
          outputs: outputs.map((i) => ({ itemName: i.item.name, quantity: Number(i.quantity), unit: i.item.unit, isByProduct: i.isByProduct })),
          yieldPct: pr.yieldPct ? Number(pr.yieldPct) : null,
        };
      }),
      summary: {
        totalRuns: productionRuns.length,
        totalInputKg: productionRuns.reduce((s, pr) =>
          s + pr.items.filter((i) => i.lineType === 'Input').reduce((ss, i) => ss + Number(i.quantity), 0), 0),
        totalOutputKg: productionRuns.reduce((s, pr) =>
          s + pr.items.filter((i) => i.lineType === 'Output').reduce((ss, i) => ss + Number(i.quantity), 0), 0),
        avgYield: productionRuns.length > 0
          ? +(productionRuns.reduce((s, pr) => s + Number(pr.yieldPct || 0), 0) / productionRuns.length).toFixed(1)
          : 0,
      },
    };

    // 4. Finance summary
    const paymentsIn = paymentsData.filter((p) => p.paymentType === 'Receive' || p.paymentType === 'CustomerDeposit');
    const paymentsOut = paymentsData.filter((p) => p.paymentType === 'Pay' || p.paymentType === 'VendorDeposit');
    const finance = {
      paymentsIn: paymentsIn.map((p) => ({
        paymentNumber: p.paymentNumber,
        partyName: p.party?.name || '—',
        amount: Number(p.amount),
        accountName: p.account?.name || '—',
      })),
      paymentsOut: paymentsOut.map((p) => ({
        paymentNumber: p.paymentNumber,
        partyName: p.party?.name || '—',
        amount: Number(p.amount),
        accountName: p.account?.name || '—',
      })),
      manualJournals,
      cashBankBalances: cashBalances,
      summary: {
        totalIn: paymentsIn.reduce((s, p) => s + Number(p.amount), 0),
        totalOut: paymentsOut.reduce((s, p) => s + Number(p.amount), 0),
        netCashFlow: paymentsIn.reduce((s, p) => s + Number(p.amount), 0) - paymentsOut.reduce((s, p) => s + Number(p.amount), 0),
      },
    };

    // 5. Receivables (aging)
    const agingBucket = (dueDate: Date | null, refDate: Date) => {
      if (!dueDate) return 'current';
      const diff = Math.floor((refDate.getTime() - dueDate.getTime()) / 86400000);
      if (diff <= 0) return 'current';
      if (diff <= 30) return 'd1_30';
      if (diff <= 60) return 'd31_60';
      if (diff <= 90) return 'd61_90';
      return 'd91_plus';
    };

    const arByCustomer = new Map<string, { customerName: string; current: number; d1_30: number; d31_60: number; d61_90: number; d91_plus: number; total: number }>();
    for (const inv of arInvoices) {
      const name = inv.customer?.name || '—';
      const entry = arByCustomer.get(name) || { customerName: name, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0, total: 0 };
      const bucket = agingBucket(inv.dueDate, dayEnd);
      const amt = Number(inv.outstanding);
      entry[bucket] += amt;
      entry.total += amt;
      arByCustomer.set(name, entry);
    }
    const receivables = {
      byCustomer: [...arByCustomer.values()].sort((a, b) => b.total - a.total),
      summary: {
        totalOutstanding: arInvoices.reduce((s, i) => s + Number(i.outstanding), 0),
        totalOverdue: arInvoices.filter((i) => i.dueDate && i.dueDate < dayEnd).reduce((s, i) => s + Number(i.outstanding), 0),
        totalCustomers: arByCustomer.size,
      },
    };

    // 6. Payables (aging)
    const apBySupplier = new Map<string, { supplierName: string; current: number; d1_30: number; d31_60: number; d61_90: number; d91_plus: number; total: number }>();
    for (const inv of apInvoices) {
      const name = inv.supplier?.name || '—';
      const entry = apBySupplier.get(name) || { supplierName: name, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0, total: 0 };
      const bucket = agingBucket(inv.dueDate, dayEnd);
      const amt = Number(inv.outstanding);
      entry[bucket] += amt;
      entry.total += amt;
      apBySupplier.set(name, entry);
    }
    const payables = {
      bySupplier: [...apBySupplier.values()].sort((a, b) => b.total - a.total),
      summary: {
        totalOutstanding: apInvoices.reduce((s, i) => s + Number(i.outstanding), 0),
        totalOverdue: apInvoices.filter((i) => i.dueDate && i.dueDate < dayEnd).reduce((s, i) => s + Number(i.outstanding), 0),
        totalSuppliers: apBySupplier.size,
      },
    };

    // 7. Vendor deposits
    const vendorDeposits = {
      deposits: vendorDepositPayments.map((p) => {
        const totalApplied = p.depositApplications.reduce((s, a) => s + Number(a.appliedAmount), 0);
        return {
          paymentNumber: p.paymentNumber,
          supplierName: p.party?.name || '—',
          amount: Number(p.amount),
          totalApplied,
          remaining: Number(p.amount) - totalApplied,
          date: p.date,
        };
      }).filter((d) => d.remaining > 0),
      summary: {
        totalDeposits: vendorDepositPayments.reduce((s, p) => s + Number(p.amount), 0),
        totalApplied: vendorDepositPayments.reduce((s, p) => s + p.depositApplications.reduce((ss, a) => ss + Number(a.appliedAmount), 0), 0),
        totalRemaining: 0,
      },
    };
    vendorDeposits.summary.totalRemaining = vendorDeposits.deposits.reduce((s, d) => s + d.remaining, 0);

    // 8. Kondisi stok (snapshot per gudang as-of akhir tanggal)
    const snapshot = await buildStockSnapshot(dateStr);
    const stock = {
      asOfDate: snapshot.asOfDate,
      valuationNote: snapshot.valuationNote,
      warehouses: snapshot.warehouses.map((w) => ({
        code: w.code,
        name: w.name,
        location: w.location,
        isDefault: w.isDefault,
        itemCount: w.itemCount,
        totalValue: w.totalValue,
        items: w.items.map((it) => ({
          code: it.code,
          name: it.name,
          unit: it.unit,
          qty: it.qty,
          averageCost: it.averageCost,
          value: it.value,
        })),
      })),
      summary: {
        totalWarehouses: snapshot.warehouses.length,
        totalItemLines: snapshot.warehouses.reduce((s, w) => s + w.itemCount, 0),
        totalNegative: snapshot.warehouses.reduce(
          (s, w) => s + w.items.filter((i) => i.qty < 0).length, 0),
        grandTotalValue: snapshot.grandTotalValue,
      },
    };

    return res.json({
      date: dateStr,
      sales,
      purchases,
      production,
      finance,
      receivables,
      payables,
      vendorDeposits,
      stock,
    });
  } catch (error) {
    logger.error({ error }, 'GET /reports/daily error');
    return res.status(500).json({ error: 'Gagal mengambil laporan harian.' });
  }
});

export default router;
