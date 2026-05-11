import { Router } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateAccountBalance, recalcPartyOutstanding } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { CreateSalesInvoiceSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { systemAccounts } from '../services/systemAccounts';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/sales/invoices
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '50', status, partyId } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: Prisma.SalesInvoiceWhereInput = {};
    if (status) where.status = status as any;
    if (partyId) where.partyId = partyId as string;

    const [invoices, total] = await Promise.all([
      prisma.salesInvoice.findMany({
        where,
        include: { customer: true, items: true },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.salesInvoice.count({ where }),
    ]);

    // Attach deductionTotal: sum of payment splits routed to non-cash accounts
    // (commission, discount, etc) per invoice. Single batched query.
    const invoiceIds = invoices.map((i) => i.id);
    let deductionMap: Record<string, number> = {};
    if (invoiceIds.length > 0) {
      const rows = await prisma.$queryRaw<Array<{ invoice_id: string; total: number }>>`
        SELECT pa.invoice_id::text AS invoice_id,
               COALESCE(SUM(ps.amount), 0)::float AS total
        FROM payment_allocations pa
        JOIN payments p ON p.id = pa.payment_id
        JOIN payment_splits ps ON ps.payment_id = p.id
        JOIN accounts a ON a.id = ps.account_id
        WHERE pa.invoice_type = 'SalesInvoice'
          AND pa.invoice_id IN (${Prisma.join(invoiceIds)})
          AND p.status != 'Cancelled'
          AND a."accountNumber" NOT LIKE '1.1%'
        GROUP BY pa.invoice_id
      `;
      deductionMap = Object.fromEntries(rows.map((r) => [r.invoice_id, Number(r.total)]));
    }

    const enriched = invoices.map((inv) => ({
      ...inv,
      deductionTotal: deductionMap[inv.id] ?? 0,
    }));

    return res.json({ data: enriched, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /sales/invoices error');
    return res.status(500).json({ error: 'Gagal mengambil data invoice penjualan.' });
  }
});

// GET /api/sales/invoices/:id — detail single invoice
router.get('/:id', async (req, res) => {
  try {
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        items: { include: { serviceItem: { select: { id: true, code: true, name: true } } } },
        user: { select: { id: true, fullName: true } },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });

    // Get payment allocations for this invoice — with splits so the PDF can
    // break down cash vs. non-cash portions (commission, discount, etc).
    const allocations = await prisma.paymentAllocation.findMany({
      where: { invoiceType: 'SalesInvoice', invoiceId: invoice.id },
      include: {
        payment: {
          select: {
            id: true, paymentNumber: true, date: true, amount: true, referenceNo: true,
            notes: true, status: true,
            account: { select: { id: true, accountNumber: true, name: true, rootType: true } },
            splits: {
              select: {
                id: true, amount: true, notes: true,
                account: { select: { id: true, accountNumber: true, name: true, rootType: true } },
              },
            },
          },
        },
      },
      orderBy: { payment: { date: 'desc' } },
    });

    // Get customer deposit applications for this invoice
    const depositApplications = await prisma.customerDepositApplication.findMany({
      where: { salesInvoiceId: invoice.id, isCancelled: false },
      include: { depositPayment: { select: { id: true, paymentNumber: true, date: true, amount: true } } },
      orderBy: { appliedAt: 'desc' },
    });

    return res.json({ ...invoice, paymentAllocations: allocations, depositApplications });
  } catch (error) {
    logger.error({ error }, 'GET /sales/invoices/:id error');
    return res.status(500).json({ error: 'Gagal mengambil detail invoice.' });
  }
});

// POST /api/sales/invoices — create sales invoice
router.post('/', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateSalesInvoiceSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const parsedDate = new Date(body.date);
      if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');
      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

      const party = await tx.party.findUnique({ where: { id: body.partyId } });
      if (!party) throw new BusinessError('Data pelanggan tidak ditemukan.');
      if (!party.isActive) throw new BusinessError('Pelanggan sudah tidak aktif.');

      const arAccount = await systemAccounts.getAccount('AR');
      const salesAccount = await systemAccounts.getAccount('SALES');
      const serviceRevenueAccount = await systemAccounts.getAccount('SERVICE_REVENUE');

      const inventoryAccount = await systemAccounts.getAccount('INVENTORY');
      // Prefer HPP Beras (5.1) for COGS, fallback to parent (5)
      const hppBerasAccount = await tx.account.findFirst({ where: { accountNumber: '5.1' } });
      const cogsAccount = hppBerasAccount || await systemAccounts.getAccount('COGS');

      // Resolve per-item accountId (service items may have their own revenue account)
      const resolvedItems: Array<{
        itemName: string; itemType: string; inventoryItemId: string | null;
        warehouseId: string | null;
        serviceItemId: string | null; quantity: number; unit: string;
        rate: number; discount: number; amount: number; taxPct: number; pphPct: number;
        accountId: string; description: string | null;
      }> = [];

      for (const item of body.items) {
        const itemAmount = new Decimal(item.quantity)
          .mul(new Decimal(item.rate))
          .mul(new Decimal(1).minus(new Decimal(item.discount ?? 0).div(100)))
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .toNumber();

        // Determine the revenue account for this line
        let lineAccountId = salesAccount.id;
        if (item.accountId) {
          const customAccount = await tx.account.findUnique({ where: { id: item.accountId } });
          if (customAccount) lineAccountId = customAccount.id;
        } else if (item.serviceItemId) {
          const svc = await tx.serviceItem.findUnique({ where: { id: item.serviceItemId } });
          if (svc) lineAccountId = svc.accountId;
        } else if (item.itemType === 'service') {
          // Service item without serviceItemId → use Pendapatan Jasa (4.2)
          lineAccountId = serviceRevenueAccount.id;
        }

        resolvedItems.push({
          itemName: item.itemName,
          itemType: item.itemType || 'product',
          inventoryItemId: item.inventoryItemId || null,
          warehouseId: item.warehouseId || null,
          serviceItemId: item.serviceItemId || null,
          quantity: item.quantity,
          unit: item.unit || 'pcs',
          rate: item.rate,
          discount: item.discount ?? 0,
          amount: itemAmount,
          taxPct: item.taxPct ?? 0,
          pphPct: item.pphPct ?? 0,
          accountId: lineAccountId,
          description: item.description || null,
        });
      }

      // Validate stock availability for inventory-linked line items. Aggregate
      // quantities per inventoryItemId since one invoice may have multiple
      // lines pointing to the same item.
      const qtyByItem = new Map<string, number>();
      for (const it of resolvedItems) {
        if (!it.inventoryItemId) continue;
        qtyByItem.set(it.inventoryItemId, (qtyByItem.get(it.inventoryItemId) ?? 0) + it.quantity);
      }
      if (qtyByItem.size > 0) {
        const invItems = await tx.inventoryItem.findMany({
          where: { id: { in: Array.from(qtyByItem.keys()) } },
          select: { id: true, name: true, unit: true, currentStock: true, isActive: true },
        });
        for (const inv of invItems) {
          const needed = qtyByItem.get(inv.id) ?? 0;
          if (!inv.isActive) throw new BusinessError(`Item '${inv.name}' tidak aktif.`);
          if (Number(inv.currentStock) < needed) {
            if (!body.allowNegativeStock) {
              throw new BusinessError(
                `Stok '${inv.name}' tidak cukup. Tersedia: ${Number(inv.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${inv.unit}, dibutuhkan: ${needed.toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${inv.unit}.`
              );
            }
            logger.warn(
              { itemId: inv.id, itemName: inv.name, available: Number(inv.currentStock), needed, partyId: body.partyId },
              'Sales invoice posted with insufficient stock (allowNegativeStock=true)'
            );
          }
        }
      }

      const subtotal = resolvedItems.reduce((sum, item) => sum.plus(new Decimal(item.amount)), new Decimal(0));
      // Per-item PPN
      const taxAmount = resolvedItems.reduce((sum, item) => {
        return sum.plus(new Decimal(item.amount).mul(new Decimal(item.taxPct).div(100)));
      }, new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      // Per-item PPh (withheld — reduces amount receivable)
      const pphAmount = resolvedItems.reduce((sum, item) => {
        return sum.plus(new Decimal(item.amount).mul(new Decimal(item.pphPct).div(100)));
      }, new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const grandTotal = subtotal
        .plus(taxAmount)
        .minus(pphAmount)
        .minus(new Decimal(body.potongan ?? 0))
        .plus(new Decimal(body.biayaLain ?? 0))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const grandTotalNum = grandTotal.toNumber();
      const invoiceNumber = await generateDocumentNumber(tx, 'SI', parsedDate, fiscalYear.id);

      const invoice = await tx.salesInvoice.create({
        data: {
          invoiceNumber,
          date: parsedDate,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          partyId: body.partyId,
          grandTotal: grandTotalNum,
          outstanding: grandTotalNum,
          taxPct: 0, // tax is per-item now
          potongan: body.potongan ?? 0,
          biayaLain: body.biayaLain ?? 0,
          labelPotongan: body.labelPotongan || null,
          labelBiaya: body.labelBiaya || null,
          terms: body.terms || null,
          customerRefNo: body.customerRefNo || null,
          status: 'Submitted',
          notes: body.notes || null,
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: { create: resolvedItems },
        },
        include: { customer: true, items: true },
      });

      // Group line items by accountId for multi-account GL posting
      const revenueByAccount = new Map<string, Decimal>();
      for (const ri of resolvedItems) {
        const prev = revenueByAccount.get(ri.accountId) ?? new Decimal(0);
        revenueByAccount.set(ri.accountId, prev.plus(new Decimal(ri.amount)));
      }

      // Adjustment for potongan/biayaLain: allocate to the largest revenue account
      const adjustmentAmount = new Decimal(body.biayaLain ?? 0).minus(new Decimal(body.potongan ?? 0));
      if (!adjustmentAmount.isZero()) {
        let primaryAccountId = salesAccount.id;
        let maxAmount = new Decimal(0);
        for (const [accId, amt] of revenueByAccount) {
          if (amt.greaterThan(maxAmount)) { maxAmount = amt; primaryAccountId = accId; }
        }
        const prev = revenueByAccount.get(primaryAccountId) ?? new Decimal(0);
        revenueByAccount.set(primaryAccountId, prev.plus(adjustmentAmount));
      }

      // Build multi-line journal: 1 DR (AR) + N CR (revenue accounts) + optional CR (tax)
      const creditJournalItems: Array<{ accountId: string; debit: number; credit: number; description: string }> = [];
      for (const [accId, amt] of revenueByAccount) {
        const creditNum = amt.toDecimalPlaces(2).toNumber();
        if (creditNum === 0) continue;
        const acc = await tx.account.findUnique({ where: { id: accId }, select: { name: true } });
        creditJournalItems.push({
          accountId: accId, debit: 0, credit: creditNum,
          description: `${acc?.name ?? 'Penjualan'}: ${invoice.invoiceNumber}`,
        });
      }

      // Add tax GL entry (CR PPN Keluaran / TAX_OUTPUT) if there's any tax
      const taxAmountNum = taxAmount.toNumber();
      if (taxAmountNum > 0) {
        const taxOutputAccount = await systemAccounts.getAccount('TAX_OUTPUT');
        creditJournalItems.push({
          accountId: taxOutputAccount.id, debit: 0, credit: taxAmountNum,
          description: `PPN Keluaran: ${invoice.invoiceNumber}`,
        });
      }

      // PPh debit entries (withheld by customer → DR PPh 23 Penjualan)
      const debitJournalItems: Array<{ accountId: string; debit: number; credit: number; description: string; partyId?: string }> = [
        { accountId: arAccount.id, partyId: body.partyId, debit: grandTotalNum, credit: 0, description: `Piutang: ${invoice.invoiceNumber}` },
      ];
      const pphAmountNum = pphAmount.toNumber();
      if (pphAmountNum > 0) {
        // Find PPh 23 Penjualan account (1.5.4)
        const pphAccount = await tx.account.findFirst({ where: { accountNumber: '1.5.4' } });
        if (pphAccount) {
          debitJournalItems.push({
            accountId: pphAccount.id, debit: pphAmountNum, credit: 0,
            description: `PPh Penjualan: ${invoice.invoiceNumber}`,
          });
        }
      }

      const jvNumber = `JV-${invoice.invoiceNumber}`;
      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber: jvNumber,
          date: parsedDate,
          narration: `Penjualan: ${invoice.invoiceNumber} - ${invoice.customer.name}`,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: [
              ...debitJournalItems,
              ...creditJournalItems,
            ],
          },
        },
      });

      // Ledger entries: N DR + N CR
      const ledgerData = [
        ...debitJournalItems.map((di) => ({
          date: parsedDate, accountId: di.accountId, partyId: di.partyId, debit: di.debit, credit: 0,
          referenceType: 'JournalEntry', referenceId: journalEntry.id,
          description: di.description, fiscalYearId: fiscalYear.id,
        })),
        ...creditJournalItems.map((ci) => ({
          date: parsedDate, accountId: ci.accountId, debit: 0, credit: ci.credit,
          referenceType: 'JournalEntry', referenceId: journalEntry.id,
          description: ci.description, fiscalYearId: fiscalYear.id,
        })),
      ];
      await tx.accountingLedgerEntry.createMany({ data: ledgerData });

      // Update account balances: DR entries + CR entries
      for (const di of debitJournalItems) {
        await updateAccountBalance(tx, di.accountId, di.debit, 0);
      }
      for (const ci of creditJournalItems) {
        await updateAccountBalance(tx, ci.accountId, 0, ci.credit);
      }
      await recalcPartyOutstanding(tx, body.partyId);

      // Auto-deduct inventory for items linked to InventoryItem
      let totalCogs = new Decimal(0);
      const cogsByAccount = new Map<string, { amount: number; names: string[] }>();
      for (const item of invoice.items) {
        const invItemId = item.inventoryItemId;
        if (!invItemId) continue;

        const inventoryItem = await tx.inventoryItem.findUnique({ where: { id: invItemId } });
        if (!inventoryItem || !inventoryItem.isActive) continue;

        const qty = Number(item.quantity);
        const stockBefore = Number(inventoryItem.currentStock);

        // Use weighted average cost for COGS (not selling price)
        const avgCost = Number(inventoryItem.averageCost);
        const cogsUnitCost = avgCost > 0 ? avgCost : 0;
        const cogsAmount = new Decimal(qty).times(new Decimal(cogsUnitCost)).toDecimalPlaces(2).toNumber();

        // Track deficit for auto-COGS-backfill when stock-in arrives later
        if (body.allowNegativeStock && stockBefore < qty) {
          const deficitQty = qty - Math.max(0, stockBefore);
          await tx.cogsBackfillQueue.create({
            data: {
              salesInvoiceId: invoice.id,
              salesInvoiceItemId: item.id,
              inventoryItemId: inventoryItem.id,
              qtyPending: deficitQty,
              qtyOriginal: deficitQty,
              costAtSale: cogsUnitCost,
              fiscalYearId: fiscalYear.id,
              status: 'Pending',
            },
          });
          logger.info(
            { invoiceId: invoice.id, itemId: inventoryItem.id, deficitQty, costAtSale: cogsUnitCost },
            'COGS backfill queued (negative stock sale)',
          );
        }

        // Resolve warehouse: prefer the line's explicit warehouseId, else
        // the default warehouse. Multi-warehouse rolled out 2026-05-11.
        let lineWarehouseId: string | null = item.warehouseId ?? null;
        if (!lineWarehouseId) {
          const defaultWh = await tx.warehouse.findFirst({ where: { isDefault: true, isActive: true } });
          lineWarehouseId = defaultWh?.id ?? null;
        }

        // Reduce stock (averageCost unchanged on stock out)
        await tx.inventoryItem.update({
          where: { id: inventoryItem.id },
          data: { currentStock: { decrement: qty } },
        });
        if (lineWarehouseId) {
          await tx.inventoryStock.upsert({
            where: { itemId_warehouseId: { itemId: inventoryItem.id, warehouseId: lineWarehouseId } },
            create: { itemId: inventoryItem.id, warehouseId: lineWarehouseId, currentStock: -qty },
            update: { currentStock: { decrement: qty } },
          });
        }

        // Create stock movement Out with actual cost (not selling price)
        const movementNumber = await generateDocumentNumber(tx, 'SM', parsedDate, fiscalYear.id);
        await tx.stockMovement.create({
          data: {
            movementNumber,
            date: parsedDate,
            itemId: inventoryItem.id,
            warehouseId: lineWarehouseId,
            movementType: 'Out',
            quantity: qty,
            unitCost: cogsUnitCost,
            totalValue: cogsAmount,
            referenceType: 'SalesInvoice',
            referenceId: invoice.id,
            notes: `Auto dari ${invoice.invoiceNumber}`,
            createdById: req.user!.userId,
            fiscalYearId: fiscalYear.id,
          },
        });

        totalCogs = totalCogs.plus(new Decimal(cogsAmount));

        // Track COGS per inventory account
        const invAcctId = inventoryItem.accountId || inventoryAccount.id;
        const existing = cogsByAccount.get(invAcctId);
        if (existing) {
          existing.amount += cogsAmount;
          existing.names.push(item.itemName);
        } else {
          cogsByAccount.set(invAcctId, { amount: cogsAmount, names: [item.itemName] });
        }

        logger.info({ invoiceId: invoice.id, itemId: inventoryItem.id, qty }, 'Auto stock deduction from sales');
      }

      // Post COGS journal if any inventory items were sold
      const totalCogsNum = totalCogs.toDecimalPlaces(2).toNumber();
      if (totalCogsNum > 0) {
        const cogsJvNumber = `JV-COGS-${invoice.invoiceNumber}`;

        // Build journal items: DR COGS + CR each inventory account
        const cogsJournalItems: { accountId: string; debit: number; credit: number; description: string }[] = [
          { accountId: cogsAccount.id, debit: totalCogsNum, credit: 0, description: `HPP: ${invoice.invoiceNumber}` },
        ];
        for (const [acctId, data] of cogsByAccount) {
          cogsJournalItems.push({
            accountId: acctId,
            debit: 0, credit: data.amount,
            description: `Persediaan keluar ${data.names.join(', ')}: ${invoice.invoiceNumber}`,
          });
        }

        const cogsJournal = await tx.journalEntry.create({
          data: {
            entryNumber: cogsJvNumber,
            date: parsedDate,
            narration: `HPP Penjualan: ${invoice.invoiceNumber} - ${invoice.customer.name}`,
            status: 'Submitted',
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            submittedAt: new Date(),
            items: { create: cogsJournalItems },
          },
        });

        await tx.accountingLedgerEntry.createMany({
          data: cogsJournalItems.map(ji => ({
            date: parsedDate,
            accountId: ji.accountId,
            debit: ji.debit,
            credit: ji.credit,
            referenceType: 'JournalEntry',
            referenceId: cogsJournal.id,
            description: ji.description,
            fiscalYearId: fiscalYear.id,
          })),
        });

        // Update balances per account
        await updateAccountBalance(tx, cogsAccount.id, totalCogsNum, 0);
        for (const [acctId, data] of cogsByAccount) {
          await updateAccountBalance(tx, acctId, 0, data.amount);
        }
      }

      return invoice;
    }, { timeout: 15000 });

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /sales/invoices', 'Gagal menyimpan invoice penjualan.');
  }
});

// PUT /api/sales/invoices/:id — edit invoice (notes, dueDate, terms)
router.put('/:id', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  try {
    const invoice = await prisma.salesInvoice.findUnique({ where: { id: req.params.id as string } });
    if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });
    if (invoice.status === 'Cancelled') return res.status(400).json({ error: 'Invoice sudah dibatalkan, tidak bisa diedit.' });

    const { notes, dueDate, terms } = req.body;
    const data: Prisma.SalesInvoiceUpdateInput = {};
    if (notes !== undefined) data.notes = notes;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (terms !== undefined) data.terms = terms || null;

    const updated = await prisma.salesInvoice.update({ where: { id: invoice.id }, data });
    return res.json(updated);
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /sales/invoices/:id', 'Gagal memperbarui invoice.');
  }
});

// POST /api/sales/invoices/:id/cancel — cancel sales invoice
router.post('/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invoice = await tx.salesInvoice.findUnique({
        where: { id: req.params.id as string },
        include: { customer: true },
      });
      if (!invoice) throw new BusinessError('Invoice tidak ditemukan.');
      if (invoice.status === 'Cancelled') throw new BusinessError('Invoice sudah dibatalkan.');
      if (invoice.status === 'Paid') throw new BusinessError('Invoice sudah lunas, tidak bisa dibatalkan.');

      // Check if there are payment allocations
      const allocations = await tx.paymentAllocation.findMany({
        where: { invoiceType: 'SalesInvoice', invoiceId: invoice.id },
      });
      if (allocations.length > 0) {
        throw new BusinessError('Invoice memiliki pembayaran teralokasi. Batalkan pembayaran terlebih dahulu.');
      }

      // Check for active customer deposit applications
      const activeDepositApps = await tx.customerDepositApplication.count({
        where: { salesInvoiceId: invoice.id, isCancelled: false },
      });
      if (activeDepositApps > 0) {
        throw new BusinessError('Invoice memiliki alokasi uang muka pelanggan aktif. Batalkan alokasi terlebih dahulu.');
      }

      // Cancel the invoice
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { status: 'Cancelled', outstanding: 0, cancelledAt: new Date() },
      });

      // Cancel ledger entries from the auto-posted journal
      const jvNumber = `JV-${invoice.invoiceNumber}`;
      const journal = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
      if (journal) {
        await tx.journalEntry.update({
          where: { id: journal.id },
          data: { status: 'Cancelled', cancelledAt: new Date() },
        });
        await tx.accountingLedgerEntry.updateMany({
          where: { referenceId: journal.id },
          data: { isCancelled: true },
        });
      }

      // Reverse account balances using journal items (supports multi-account)
      if (journal) {
        const journalItems = await tx.journalItem.findMany({ where: { journalEntryId: journal.id } });
        for (const ji of journalItems) {
          await updateAccountBalance(tx, ji.accountId, Number(ji.credit), Number(ji.debit));
        }
      }

      // Reverse COGS journal if exists
      const cogsJvNumber = `JV-COGS-${invoice.invoiceNumber}`;
      const cogsJournal = await tx.journalEntry.findUnique({ where: { entryNumber: cogsJvNumber } });
      if (cogsJournal) {
        await tx.journalEntry.update({
          where: { id: cogsJournal.id },
          data: { status: 'Cancelled', cancelledAt: new Date() },
        });
        await tx.accountingLedgerEntry.updateMany({
          where: { referenceId: cogsJournal.id },
          data: { isCancelled: true },
        });

        // Reverse balances per actual account referenced in the COGS journal.
        // Each inventory item posts to its own sub-account (1.4.xx), not the
        // generic INVENTORY parent — use journalItem rows verbatim so every
        // item-specific account is reversed correctly.
        const cogsItems = await tx.journalItem.findMany({ where: { journalEntryId: cogsJournal.id } });
        for (const ji of cogsItems) {
          await updateAccountBalance(tx, ji.accountId, Number(ji.credit), Number(ji.debit));
        }
      }

      // Reverse stock movements created from this invoice
      const stockMovements = await tx.stockMovement.findMany({
        where: { referenceType: 'SalesInvoice', referenceId: invoice.id, isCancelled: false },
      });
      for (const sm of stockMovements) {
        await tx.inventoryItem.update({
          where: { id: sm.itemId },
          data: { currentStock: { increment: Number(sm.quantity) } },
        });
        if (sm.warehouseId) {
          await tx.inventoryStock.update({
            where: { itemId_warehouseId: { itemId: sm.itemId, warehouseId: sm.warehouseId } },
            data: { currentStock: { increment: Number(sm.quantity) } },
          });
        }
        await tx.stockMovement.update({
          where: { id: sm.id },
          data: { isCancelled: true },
        });
      }

      // Recalc party outstanding from invoice data
      await recalcPartyOutstanding(tx, invoice.partyId);

      return { id: invoice.id, status: 'Cancelled' };
    }, { timeout: 15000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /sales/invoices/:id/cancel', 'Gagal membatalkan invoice.');
  }
});

export default router;
