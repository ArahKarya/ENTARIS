import { Router } from 'express';
import path from 'path';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';
import { requirePerm } from '../../middleware/auth';
import { logger } from '../../lib/logger';
import { systemAccounts } from '../../services/systemAccounts';
import { recalcPartyOutstanding } from '../../utils/accountBalance';
import { adjustWarehouseStock, resolveWarehouseId } from '../../utils/warehouseStock';
import { calcWeightedAverage } from '../../utils/weightedAverage';

const router = Router();

// POST /api/settings/generate-dummy — Generate dummy transactions (Admin only)
router.post('/generate-dummy', requirePerm('settings'), async (req, res) => {
  try {
    const admin = await prisma.user.findFirst({ where: { role: 'Admin' } });
    if (!admin) return res.status(400).json({ error: 'User admin tidak ditemukan.' });

    const fiscalYear = await prisma.fiscalYear.findFirst({ where: { isClosed: false }, orderBy: { startDate: 'desc' } });
    if (!fiscalYear) return res.status(400).json({ error: 'Tidak ada tahun fiskal aktif.' });

    // Get account IDs
    const accounts = await prisma.account.findMany({ where: { isGroup: false } });
    const acctMap = new Map(accounts.map(a => [a.accountNumber, a.id]));
    const cashMappings = await systemAccounts.getAccounts('CASH');
    const kasId = cashMappings[0]?.id;                        // Petty Cash
    const bankId = cashMappings[1]?.id;                       // Bank BRI
    const arId = (await systemAccounts.getAccount('AR')).id;
    const invId = (await systemAccounts.getAccount('INVENTORY')).id;
    const apId = (await systemAccounts.getAccount('AP')).id;
    const salesId = (await systemAccounts.getAccount('SALES')).id;
    const cogsId = (await systemAccounts.getAccount('COGS')).id;
    const gajiId = acctMap.get('6.4');                         // Beban Gaji
    const listrikId = acctMap.get('6.11');                     // Beban Listrik

    if (!kasId || !salesId || !arId || !apId) {
      return res.status(400).json({ error: 'Akun dasar (Kas, AR, AP, Sales) belum tersedia. Jalankan seed terlebih dahulu.' });
    }

    // Guard: skip if dummy data already exists
    const existingDummy = await prisma.party.count({ where: { isDummy: true } });
    if (existingDummy > 0) {
      return res.status(400).json({ error: 'Data dummy sudah ada. Hapus terlebih dahulu sebelum generate ulang.' });
    }

    const results = { parties: 0, salesInvoices: 0, purchaseInvoices: 0, payments: 0, journals: 0, inventoryItems: 0, movements: 0, productionRuns: 0 };

    await prisma.$transaction(async (tx) => {
      const { generateDocumentNumber } = await import('../../utils/documentNumber');
      const { getOpenFiscalYear } = await import('../../utils/fiscalYear');

      // --- Initial Capital Injection: Kas + Bank ---
      // Use fiscal year start date or Jan 1 of current year (whichever is within an open FY)
      const initDate = new Date(fiscalYear.startDate);
      const initFy = fiscalYear;
      const modalId = acctMap.get('3.1'); // Modal Disetor

      if (modalId) {
        const jvInit = await generateDocumentNumber(tx, 'JV', initDate, initFy.id);
        await tx.journalEntry.create({
          data: {
            entryNumber: jvInit, date: initDate, narration: 'Setoran modal awal',
            status: 'Submitted', fiscalYearId: initFy.id, createdBy: admin.id, submittedAt: initDate,
            items: { create: [
              { accountId: kasId!, debit: 350000000, credit: 0 },
              { accountId: bankId || kasId!, debit: 150000000, credit: 0 },
              { accountId: modalId, debit: 0, credit: 500000000 },
            ]},
          },
        });
        await tx.accountingLedgerEntry.createMany({ data: [
          { accountId: kasId!, date: initDate, debit: 350000000, credit: 0, referenceType: 'JournalEntry', referenceId: 'dummy-modal-init', fiscalYearId: initFy.id },
          { accountId: bankId || kasId!, date: initDate, debit: 150000000, credit: 0, referenceType: 'JournalEntry', referenceId: 'dummy-modal-init', fiscalYearId: initFy.id },
          { accountId: modalId, date: initDate, debit: 0, credit: 500000000, referenceType: 'JournalEntry', referenceId: 'dummy-modal-init', fiscalYearId: initFy.id },
        ]});
        // Update account balances
        await tx.account.update({ where: { id: kasId! }, data: { balance: { increment: 350000000 } } });
        if (bankId) await tx.account.update({ where: { id: bankId }, data: { balance: { increment: 150000000 } } });
        await tx.account.update({ where: { id: modalId }, data: { balance: { increment: 500000000 } } });
        results.journals++;
      }

      // --- Dummy Parties ---
      const customerNames = [
        'Toko Beras Sejahtera', 'UD Sumber Jaya', 'CV Makmur Abadi', 'Toko Beras Melati',
        'PT Beras Nusantara', 'UD Sumber Rezeki', 'Toko Beras Cirebon', 'CV Padi Emas',
      ];
      const supplierNames = [
        'Petani Gabah Subur', 'KUD Tani Makmur', 'UD Gabah Cirebon', 'CV Padi Indah',
        'Kelompok Tani Sejahtera', 'UD Gabah Prima',
      ];

      const customers = [];
      for (const name of customerNames) {
        const p = await tx.party.create({
          data: { name, partyType: 'Customer', phone: '08' + Math.floor(1000000000 + Math.random() * 9000000000).toString().slice(0, 10), address: 'Cirebon, Jawa Barat', isDummy: true },
        });
        customers.push(p);
        results.parties++;
      }

      const suppliers = [];
      for (const name of supplierNames) {
        const p = await tx.party.create({
          data: { name, partyType: 'Supplier', phone: '08' + Math.floor(1000000000 + Math.random() * 9000000000).toString().slice(0, 10), address: 'Cirebon, Jawa Barat', isDummy: true },
        });
        suppliers.push(p);
        results.parties++;
      }

      // --- Dummy Inventory Items ---
      const itemDefs = [
        { code: 'GBH-GKP', name: 'Gabah Kering Panen (GKP)', unit: 'Kg', category: 'Bahan Baku', minimumStock: 5000 },
        { code: 'GBH-GKG', name: 'Gabah Kering Giling (GKG)', unit: 'Kg', category: 'Bahan Baku', minimumStock: 3000 },
        { code: 'BRS-PRM', name: 'Beras Premium', unit: 'Kg', category: 'Produk Jadi', minimumStock: 2000 },
        { code: 'BRS-MED', name: 'Beras Medium', unit: 'Kg', category: 'Produk Jadi', minimumStock: 1000 },
        { code: 'BKT-001', name: 'Bekatul', unit: 'Kg', category: 'Produk Sampingan', minimumStock: 500 },
        { code: 'SKM-001', name: 'Sekam', unit: 'Kg', category: 'Produk Sampingan', minimumStock: 200 },
        { code: 'MNR-001', name: 'Menir', unit: 'Kg', category: 'Produk Sampingan', minimumStock: 300 },
      ];

      const items = [];
      for (const def of itemDefs) {
        const existing = await tx.inventoryItem.findFirst({ where: { code: def.code } });
        if (!existing) {
          const item = await tx.inventoryItem.create({
            data: { ...def, isDummy: true, currentStock: 0, accountId: invId },
          });
          items.push(item);
          results.inventoryItems++;
        }
      }

      // --- Dummy Transactions (last 3 months) ---
      const now = new Date();
      for (let monthOffset = 2; monthOffset >= 0; monthOffset--) {
        const month = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);

        // Purchase invoices (buy gabah from suppliers) — 3 per month
        for (let i = 0; i < 3; i++) {
          const day = 5 + i * 8;
          const date = new Date(month.getFullYear(), month.getMonth(), Math.min(day, 28));
          const supplier = suppliers[i % suppliers.length];
          const qty = 1000 + Math.floor(Math.random() * 4000);
          const rate = 4500 + Math.floor(Math.random() * 1000);
          const subtotal = new Decimal(qty).mul(rate);
          const taxAmt = subtotal.mul(11).div(100);
          const grandTotal = subtotal.plus(taxAmt).toDecimalPlaces(2).toNumber();

          const fy = await getOpenFiscalYear(tx, date);
          const invNum = await generateDocumentNumber(tx, 'PI', date, fy.id);

          const pi = await tx.purchaseInvoice.create({
            data: {
              invoiceNumber: invNum, date, partyId: supplier.id, status: 'Submitted',
              grandTotal, outstanding: grandTotal, taxPct: 11, potongan: 0, biayaLain: 0,
              fiscalYearId: fy.id, createdBy: admin.id, submittedAt: date, isDummy: true,
              items: { create: [{ itemName: 'Gabah GKP', quantity: qty, unit: 'Kg', rate, discount: 0, amount: subtotal.toNumber(), accountId: invId!, description: '' }] },
            },
          });

          // GL posting: DR Persediaan / CR AP (matches real purchase route)
          const jvNum = await generateDocumentNumber(tx, 'JV', date, fy.id);
          await tx.journalEntry.create({
            data: {
              entryNumber: jvNum, date, narration: 'Pembelian gabah - ' + supplier.name,
              status: 'Submitted', fiscalYearId: fy.id, createdBy: admin.id, submittedAt: date,
              items: { create: [
                { accountId: invId!, debit: grandTotal, credit: 0 },
                { accountId: apId!, debit: 0, credit: grandTotal },
              ]},
            },
          });

          // Ledger entries
          await tx.accountingLedgerEntry.createMany({ data: [
            { accountId: invId!, date, debit: grandTotal, credit: 0, referenceId: pi.id, referenceType: 'PurchaseInvoice', fiscalYearId: fy.id },
            { accountId: apId!, date, debit: 0, credit: grandTotal, referenceId: pi.id, referenceType: 'PurchaseInvoice', fiscalYearId: fy.id },
          ]});

          results.purchaseInvoices++;
        }

        // Sales invoices — 5 per month
        for (let i = 0; i < 5; i++) {
          const day = 3 + i * 5;
          const date = new Date(month.getFullYear(), month.getMonth(), Math.min(day, 28));
          const customer = customers[i % customers.length];
          const qty = 200 + Math.floor(Math.random() * 800);
          const rate = 12000 + Math.floor(Math.random() * 4000);
          const subtotal = new Decimal(qty).mul(rate);
          const taxAmt = subtotal.mul(11).div(100);
          const grandTotal = subtotal.plus(taxAmt).toDecimalPlaces(2).toNumber();

          const fy = await getOpenFiscalYear(tx, date);
          const siInvNum = await generateDocumentNumber(tx, 'SI', date, fy.id);

          const si = await tx.salesInvoice.create({
            data: {
              invoiceNumber: siInvNum, date, partyId: customer.id, status: 'Submitted',
              grandTotal, outstanding: grandTotal, taxPct: 11, potongan: 0, biayaLain: 0,
              dueDate: new Date(date.getTime() + 30 * 86400000),
              fiscalYearId: fy.id, createdBy: admin.id, submittedAt: date, isDummy: true,
              items: { create: [{ itemName: 'Beras Premium', quantity: qty, unit: 'Kg', rate, discount: 0, amount: subtotal.toNumber(), accountId: salesId!, description: '' }] },
            },
          });

          // GL posting
          const siJvNum = await generateDocumentNumber(tx, 'JV', date, fy.id);
          await tx.journalEntry.create({
            data: {
              entryNumber: siJvNum, date, narration: 'Penjualan beras - ' + customer.name,
              status: 'Submitted', fiscalYearId: fy.id, createdBy: admin.id, submittedAt: date,
              items: { create: [
                { accountId: arId!, debit: grandTotal, credit: 0 },
                { accountId: salesId!, debit: 0, credit: grandTotal },
              ]},
            },
          });

          await tx.accountingLedgerEntry.createMany({ data: [
            { accountId: arId!, date, debit: grandTotal, credit: 0, referenceId: si.id, referenceType: 'SalesInvoice', fiscalYearId: fy.id },
            { accountId: salesId!, date, debit: 0, credit: grandTotal, referenceId: si.id, referenceType: 'SalesInvoice', fiscalYearId: fy.id },
          ]});

          // COGS posting: DR HPP / CR Persediaan (matches real sales route)
          if (cogsId && invId) {
            const cogsAmount = subtotal.toNumber(); // COGS at cost (before tax)
            const cogsJvNum = `JV-COGS-${siInvNum}`;
            await tx.journalEntry.create({
              data: {
                entryNumber: cogsJvNum, date, narration: `HPP: ${siInvNum}`,
                status: 'Submitted', fiscalYearId: fy.id, createdBy: admin.id, submittedAt: date,
                items: { create: [
                  { accountId: cogsId, debit: cogsAmount, credit: 0, description: `HPP: ${siInvNum}` },
                  { accountId: invId, debit: 0, credit: cogsAmount, description: `Persediaan: ${siInvNum}` },
                ]},
              },
            });
            await tx.accountingLedgerEntry.createMany({ data: [
              { accountId: cogsId, date, debit: cogsAmount, credit: 0, referenceId: si.id, referenceType: 'SalesInvoice', fiscalYearId: fy.id, description: `HPP: ${siInvNum}` },
              { accountId: invId, date, debit: 0, credit: cogsAmount, referenceId: si.id, referenceType: 'SalesInvoice', fiscalYearId: fy.id, description: `Persediaan: ${siInvNum}` },
            ]});
          }

          // Create payment for first 2 of 5 sales invoices (40% collection rate, leaves AR balance)
          if (i < 2) {
            const payDate = new Date(date.getTime() + 7 * 86400000); // 7 days after invoice
            const payFy = await getOpenFiscalYear(tx, payDate);
            const payNum = await generateDocumentNumber(tx, 'PAY', payDate, payFy.id);
            const payment = await tx.payment.create({
              data: {
                paymentNumber: payNum, date: payDate, paymentType: 'Receive', partyId: customer.id,
                accountId: kasId!, amount: grandTotal, status: 'Submitted',
                fiscalYearId: payFy.id, createdBy: admin.id, submittedAt: payDate, referenceNo: 'TF-' + payNum,
                allocations: { create: [{ invoiceType: 'SalesInvoice', invoiceId: si.id, allocatedAmount: grandTotal }] },
              },
            });
            // Update invoice status to Paid
            await tx.salesInvoice.update({ where: { id: si.id }, data: { status: 'Paid', outstanding: 0 } });
            // GL: DR Kas, CR AR
            const jvPay = await generateDocumentNumber(tx, 'JV', payDate, payFy.id);
            await tx.journalEntry.create({
              data: {
                entryNumber: jvPay, date: payDate, narration: 'Pembayaran ' + customer.name,
                status: 'Submitted', fiscalYearId: payFy.id, createdBy: admin.id, submittedAt: payDate,
                items: { create: [
                  { accountId: kasId!, debit: grandTotal, credit: 0 },
                  { accountId: arId!, debit: 0, credit: grandTotal },
                ]},
              },
            });
            await tx.accountingLedgerEntry.createMany({ data: [
              { accountId: kasId!, date: payDate, debit: grandTotal, credit: 0, referenceId: payment.id, referenceType: 'Payment', fiscalYearId: payFy.id },
              { accountId: arId!, date: payDate, debit: 0, credit: grandTotal, referenceId: payment.id, referenceType: 'Payment', fiscalYearId: payFy.id },
            ]});
            await recalcPartyOutstanding(tx, customer.id);
            results.payments++;
          }

          results.salesInvoices++;
        }

        // Create payment for first 1 of 3 purchase invoices (33% payment rate, leaves AP balance)
        const monthPIs = await tx.purchaseInvoice.findMany({
          where: { isDummy: true, date: { gte: month, lt: new Date(month.getFullYear(), month.getMonth() + 1, 1) } },
          take: 1,
        });
        for (const pi of monthPIs) {
          const payDate = new Date(new Date(pi.date).getTime() + 14 * 86400000);
          const payFy = await getOpenFiscalYear(tx, payDate);
          const payNum = await generateDocumentNumber(tx, 'PAY', payDate, payFy.id);
          const piAmount = Number(pi.grandTotal);
          await tx.payment.create({
            data: {
              paymentNumber: payNum, date: payDate, paymentType: 'Pay', partyId: pi.partyId,
              accountId: kasId!, amount: piAmount, status: 'Submitted',
              fiscalYearId: payFy.id, createdBy: admin.id, submittedAt: payDate, referenceNo: 'TF-' + payNum,
              allocations: { create: [{ invoiceType: 'PurchaseInvoice', invoiceId: pi.id, allocatedAmount: piAmount }] },
            },
          });
          await tx.purchaseInvoice.update({ where: { id: pi.id }, data: { status: 'Paid', outstanding: 0 } });
          // GL: DR AP, CR Kas
          const jvPay = await generateDocumentNumber(tx, 'JV', payDate, payFy.id);
          await tx.journalEntry.create({
            data: {
              entryNumber: jvPay, date: payDate, narration: 'Pembayaran ke supplier',
              status: 'Submitted', fiscalYearId: payFy.id, createdBy: admin.id, submittedAt: payDate,
              items: { create: [
                { accountId: apId!, debit: piAmount, credit: 0 },
                { accountId: kasId!, debit: 0, credit: piAmount },
              ]},
            },
          });
          await tx.accountingLedgerEntry.createMany({ data: [
            { accountId: apId!, date: payDate, debit: piAmount, credit: 0, referenceType: 'Payment', referenceId: 'dummy-pay-pi', fiscalYearId: payFy.id },
            { accountId: kasId!, date: payDate, debit: 0, credit: piAmount, referenceType: 'Payment', referenceId: 'dummy-pay-pi', fiscalYearId: payFy.id },
          ]});
          await recalcPartyOutstanding(tx, pi.partyId);
          results.payments++;
        }

        // Journal entries (expenses) — 2 per month
        // Gaji
        const gajiDate = new Date(month.getFullYear(), month.getMonth(), 25);
        const gajiAmount = 8000000 + Math.floor(Math.random() * 4000000);
        const fyGaji = await getOpenFiscalYear(tx, gajiDate);
        const jeGaji = await generateDocumentNumber(tx, 'JV', gajiDate, fyGaji.id);
        await tx.journalEntry.create({
          data: {
            entryNumber: jeGaji, date: gajiDate, narration: 'Gaji karyawan bulan ' + (month.getMonth() + 1),
            status: 'Submitted', fiscalYearId: fyGaji.id, createdBy: admin.id, submittedAt: gajiDate,
            items: { create: [
              { accountId: gajiId || kasId!, debit: gajiAmount, credit: 0 },
              { accountId: kasId!, debit: 0, credit: gajiAmount },
            ]},
          },
        });
        await tx.accountingLedgerEntry.createMany({ data: [
          { accountId: gajiId || kasId!, date: gajiDate, debit: gajiAmount, credit: 0, referenceType: 'JournalEntry', referenceId: 'dummy-gaji', fiscalYearId: fyGaji.id },
          { accountId: kasId!, date: gajiDate, debit: 0, credit: gajiAmount, referenceType: 'JournalEntry', referenceId: 'dummy-gaji', fiscalYearId: fyGaji.id },
        ]});
        results.journals++;

        // Listrik
        const listrikDate = new Date(month.getFullYear(), month.getMonth(), 10);
        const listrikAmount = 1500000 + Math.floor(Math.random() * 1000000);
        const fyListrik = await getOpenFiscalYear(tx, listrikDate);
        const jeListrik = await generateDocumentNumber(tx, 'JV', listrikDate, fyListrik.id);
        await tx.journalEntry.create({
          data: {
            entryNumber: jeListrik, date: listrikDate, narration: 'Listrik & air bulan ' + (month.getMonth() + 1),
            status: 'Submitted', fiscalYearId: fyListrik.id, createdBy: admin.id, submittedAt: listrikDate,
            items: { create: [
              { accountId: listrikId || kasId!, debit: listrikAmount, credit: 0 },
              { accountId: kasId!, debit: 0, credit: listrikAmount },
            ]},
          },
        });
        await tx.accountingLedgerEntry.createMany({ data: [
          { accountId: listrikId || kasId!, date: listrikDate, debit: listrikAmount, credit: 0, referenceType: 'JournalEntry', referenceId: 'dummy-listrik', fiscalYearId: fyListrik.id },
          { accountId: kasId!, date: listrikDate, debit: 0, credit: listrikAmount, referenceType: 'JournalEntry', referenceId: 'dummy-listrik', fiscalYearId: fyListrik.id },
        ]});
        results.journals++;
      }

      // --- Dummy Stock Movements & Production Runs ---
      // Stock lives per warehouse (inventory_stocks) with inventory_items.currentStock
      // as the denormalised total — every change goes through applyStock so the two
      // never drift. Default (or first active) warehouse; one is created if none exist.
      const whId =
        (await resolveWarehouseId(tx)) ??
        (await tx.warehouse.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true } }))?.id ??
        (await tx.warehouse.create({ data: { code: 'GDG-UTAMA', name: 'Gudang Utama', isDefault: true }, select: { id: true } })).id;
      const applyStock = async (itemId: string, delta: number) => {
        await tx.inventoryItem.update({ where: { id: itemId }, data: { currentStock: { increment: delta } } });
        await adjustWarehouseStock(tx, itemId, whId, delta);
      };
      // Reload dummy items (may have been created above or exist already)
      const dummyItems = await tx.inventoryItem.findMany({ where: { isDummy: true } });
      const itemByCode = new Map(dummyItems.map(i => [i.code, i]));

      const gkpItem = itemByCode.get('GBH-GKP');
      const gkgItem = itemByCode.get('GBH-GKG');
      const berasPrm = itemByCode.get('BRS-PRM');
      const berasMed = itemByCode.get('BRS-MED');
      const bekatul = itemByCode.get('BKT-001');
      const sekam = itemByCode.get('SKM-001');
      const menir = itemByCode.get('MNR-001');

      if (gkpItem && gkgItem && berasPrm) {
        const genSM = generateDocumentNumber;
        const getFY = getOpenFiscalYear;

        // Opening stock (saldo awal) for newly created dummy items — recorded as
        // movements + per-warehouse rows, never by writing currentStock directly.
        const openingDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const openingFy = await getFY(tx, openingDate);
        for (const item of items) {
          const qty = Number(item.minimumStock ?? 0);
          if (qty <= 0) continue;
          const smOpenNum = await genSM(tx, 'SM', openingDate, openingFy.id);
          await tx.stockMovement.create({
            data: {
              movementNumber: smOpenNum, date: openingDate, itemId: item.id, movementType: 'AdjustmentIn',
              quantity: qty, unitCost: 0, totalValue: 0,
              notes: 'Saldo awal stok (dummy)', fiscalYearId: openingFy.id, createdById: admin.id, warehouseId: whId,
            },
          });
          await applyStock(item.id, qty);
          results.movements++;
        }

        for (let monthOffset = 2; monthOffset >= 0; monthOffset--) {
          const month = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);

          // Stock In: Gabah GKP masuk dari pembelian — 2x per bulan
          for (let i = 0; i < 2; i++) {
            const date = new Date(month.getFullYear(), month.getMonth(), 6 + i * 12);
            const fy = await getFY(tx, date);
            const qty = 3000 + Math.floor(Math.random() * 5000);
            const unitCost = 4500 + Math.floor(Math.random() * 800);
            const smNum = await genSM(tx, 'SM', date, fy.id);
            await tx.stockMovement.create({
              data: {
                movementNumber: smNum, date, itemId: gkpItem.id, movementType: 'In',
                quantity: qty, unitCost, totalValue: qty * unitCost,
                offsetAccountId: kasId!, notes: 'Pembelian gabah GKP',
                fiscalYearId: fy.id, createdById: admin.id, warehouseId: whId,
              },
            });
            // Keep averageCost in step with the costed inbound (same WAC rule as the
            // live receipt path), so a later recompute-by-replay matches the stored value.
            const gkpNow = await tx.inventoryItem.findUniqueOrThrow({
              where: { id: gkpItem.id }, select: { currentStock: true, averageCost: true },
            });
            await tx.inventoryItem.update({
              where: { id: gkpItem.id },
              data: { averageCost: calcWeightedAverage(gkpNow.currentStock, gkpNow.averageCost, qty, unitCost) },
            });
            await applyStock(gkpItem.id, qty);
            results.movements++;
          }

          // Stock Out: GKP keluar untuk proses giling — 1x per bulan
          const gilingDate = new Date(month.getFullYear(), month.getMonth(), 15);
          const gilingFy = await getFY(tx, gilingDate);
          const gilingQty = 4000 + Math.floor(Math.random() * 3000);
          const smOutNum = await genSM(tx, 'SM', gilingDate, gilingFy.id);
          await tx.stockMovement.create({
            data: {
              movementNumber: smOutNum, date: gilingDate, itemId: gkpItem.id, movementType: 'Out',
              quantity: gilingQty, unitCost: 0, totalValue: 0,
              notes: 'Proses giling ke GKG', referenceType: 'ProductionRun',
              fiscalYearId: gilingFy.id, createdById: admin.id, warehouseId: whId,
            },
          });
          await applyStock(gkpItem.id, -gilingQty);
          results.movements++;

          // Stock In: GKG hasil proses giling (yield ~85%)
          const gkgQty = Math.round(gilingQty * 0.85);
          const smGkgNum = await genSM(tx, 'SM', gilingDate, gilingFy.id);
          await tx.stockMovement.create({
            data: {
              movementNumber: smGkgNum, date: gilingDate, itemId: gkgItem.id, movementType: 'In',
              quantity: gkgQty, unitCost: 0, totalValue: 0,
              notes: 'Hasil giling dari GKP', referenceType: 'ProductionRun',
              fiscalYearId: gilingFy.id, createdById: admin.id, warehouseId: whId,
            },
          });
          await applyStock(gkgItem.id, gkgQty);
          results.movements++;

          // Production Run: GKG → Beras Premium + Bekatul + Sekam + Menir
          const prodDate = new Date(month.getFullYear(), month.getMonth(), 18);
          const prodFy = await getFY(tx, prodDate);
          const prodNum = await genSM(tx, 'PR', prodDate, prodFy.id);
          const inputGkg = 2500 + Math.floor(Math.random() * 2000);
          const outBeras = Math.round(inputGkg * 0.62);
          const outBekatul = Math.round(inputGkg * 0.08);
          const outSekam = Math.round(inputGkg * 0.20);
          const outMenir = Math.round(inputGkg * 0.05);
          const yield1 = Math.round((outBeras / inputGkg) * 10000) / 100;

          await tx.productionRun.create({
            data: {
              runNumber: prodNum, date: prodDate, yieldPct: yield1,
              notes: 'Produksi beras premium bulan ' + (month.getMonth() + 1),
              fiscalYearId: prodFy.id, createdById: admin.id,
              items: {
                create: [
                  { itemId: gkgItem.id, lineType: 'Input', quantity: inputGkg, warehouseId: whId },
                  { itemId: berasPrm.id, lineType: 'Output', quantity: outBeras, warehouseId: whId, yieldPct: yield1 },
                  ...(bekatul ? [{ itemId: bekatul.id, lineType: 'Output' as const, quantity: outBekatul, warehouseId: whId }] : []),
                  ...(sekam ? [{ itemId: sekam.id, lineType: 'Output' as const, quantity: outSekam, warehouseId: whId }] : []),
                  ...(menir ? [{ itemId: menir.id, lineType: 'Output' as const, quantity: outMenir, warehouseId: whId }] : []),
                ],
              },
            },
          });

          // Update stock for production
          await applyStock(gkgItem.id, -inputGkg);
          await applyStock(berasPrm.id, outBeras);
          if (bekatul) await applyStock(bekatul.id, outBekatul);
          if (sekam) await applyStock(sekam.id, outSekam);
          if (menir) await applyStock(menir.id, outMenir);
          results.productionRuns++;

          // Stock Out: Beras keluar (terjual) — 2x per bulan
          for (let i = 0; i < 2; i++) {
            const sellDate = new Date(month.getFullYear(), month.getMonth(), 20 + i * 4);
            const sellFy = await getFY(tx, sellDate);
            const sellQty = 300 + Math.floor(Math.random() * 500);
            const smSellNum = await genSM(tx, 'SM', sellDate, sellFy.id);
            await tx.stockMovement.create({
              data: {
                movementNumber: smSellNum, date: sellDate, itemId: berasPrm.id, movementType: 'Out',
                quantity: sellQty, unitCost: 12000, totalValue: sellQty * 12000,
                offsetAccountId: kasId!, notes: 'Penjualan beras premium',
                fiscalYearId: sellFy.id, createdById: admin.id, warehouseId: whId,
              },
            });
            await applyStock(berasPrm.id, -sellQty);
            results.movements++;
          }

          // Adjustment: Stok opname (kecil) — 1x per bulan pada bekatul
          if (bekatul) {
            const adjDate = new Date(month.getFullYear(), month.getMonth(), 28);
            const adjFy = await getFY(tx, adjDate);
            const adjQty = 10 + Math.floor(Math.random() * 30);
            const smAdjNum = await genSM(tx, 'SM', adjDate, adjFy.id);
            await tx.stockMovement.create({
              data: {
                movementNumber: smAdjNum, date: adjDate, itemId: bekatul.id, movementType: 'AdjustmentOut',
                quantity: adjQty, unitCost: 0, totalValue: 0,
                notes: 'Stok opname — selisih bekatul', fiscalYearId: adjFy.id, createdById: admin.id, warehouseId: whId,
              },
            });
            await applyStock(bekatul.id, -adjQty);
            results.movements++;
          }
        }

        // Second production run type: GKG → Beras Medium (lower yield)
        if (berasMed) {
          const prodDate2 = new Date(now.getFullYear(), now.getMonth(), 10);
          const prodFy2 = await getFY(tx, prodDate2);
          const prodNum2 = await genSM(tx, 'PR', prodDate2, prodFy2.id);
          const inputQty2 = 2000;
          const outBeras2 = Math.round(inputQty2 * 0.58);
          const yield2 = Math.round((outBeras2 / inputQty2) * 10000) / 100;

          await tx.productionRun.create({
            data: {
              runNumber: prodNum2, date: prodDate2, yieldPct: yield2,
              notes: 'Produksi beras medium', fiscalYearId: prodFy2.id, createdById: admin.id,
              items: {
                create: [
                  { itemId: gkgItem.id, lineType: 'Input', quantity: inputQty2, warehouseId: whId },
                  { itemId: berasMed.id, lineType: 'Output', quantity: outBeras2, warehouseId: whId, yieldPct: yield2 },
                ],
              },
            },
          });
          await applyStock(gkgItem.id, -inputQty2);
          await applyStock(berasMed.id, outBeras2);
          results.productionRuns++;
        }
      }

      // --- Recalculate all account balances from ledger entries ---
      const allAccounts = await tx.account.findMany({ where: { isGroup: false }, select: { id: true, rootType: true } });
      for (const acct of allAccounts) {
        const sums = await tx.accountingLedgerEntry.aggregate({
          where: { accountId: acct.id, isCancelled: false },
          _sum: { debit: true, credit: true },
        });
        const totalDebit = Number(sums._sum.debit || 0);
        const totalCredit = Number(sums._sum.credit || 0);
        // Debit-normal: ASSET, EXPENSE → balance = debit - credit
        // Credit-normal: LIABILITY, EQUITY, REVENUE → balance = credit - debit
        const isDebitNormal = acct.rootType === 'ASSET' || acct.rootType === 'EXPENSE';
        const balance = isDebitNormal ? totalDebit - totalCredit : totalCredit - totalDebit;
        await tx.account.update({ where: { id: acct.id }, data: { balance } });
      }

      // --- Recalculate party outstanding amounts ---
      const allParties = await tx.party.findMany({ select: { id: true, partyType: true } });
      for (const party of allParties) {
        let outstanding = 0;
        if (party.partyType === 'Customer' || party.partyType === 'Both') {
          const siSum = await tx.salesInvoice.aggregate({
            where: { partyId: party.id, status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] } },
            _sum: { outstanding: true },
          });
          outstanding += Number(siSum._sum.outstanding || 0);
        }
        if (party.partyType === 'Supplier' || party.partyType === 'Both') {
          const piSum = await tx.purchaseInvoice.aggregate({
            where: { partyId: party.id, status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] } },
            _sum: { outstanding: true },
          });
          outstanding += Number(piSum._sum.outstanding || 0);
        }
        await tx.party.update({ where: { id: party.id }, data: { outstandingAmount: outstanding } });
      }
    }, { timeout: 120000 });

    logger.info({ results }, 'Dummy data generated');
    return res.json({ message: 'Data dummy berhasil dibuat.', results });
  } catch (error) {
    logger.error({ error }, 'POST /settings/generate-dummy error');
    return res.status(500).json({ error: 'Gagal membuat data dummy.' });
  }
});

// POST /api/settings/delete-dummy — Delete only dummy data (Admin only)
router.post('/delete-dummy', requirePerm('settings'), async (_req, res) => {
  try {
    const results = { parties: 0, salesInvoices: 0, purchaseInvoices: 0, payments: 0, journals: 0, inventoryItems: 0, movements: 0, productionRuns: 0 };

    await prisma.$transaction(async (tx) => {
      // 1. Collect all dummy entity IDs
      const dummySI = await tx.salesInvoice.findMany({ where: { isDummy: true }, select: { id: true } });
      const dummyPI = await tx.purchaseInvoice.findMany({ where: { isDummy: true }, select: { id: true } });
      const dummyParties = await tx.party.findMany({ where: { isDummy: true }, select: { id: true } });
      const dummyItems = await tx.inventoryItem.findMany({ where: { isDummy: true }, select: { id: true } });
      const siIds = dummySI.map(s => s.id);
      const piIds = dummyPI.map(p => p.id);
      const partyIds = dummyParties.map(p => p.id);
      const itemIds = dummyItems.map(i => i.id);

      // 2. Find payments linked to dummy parties
      const dummyPayments = await tx.payment.findMany({
        where: { partyId: { in: partyIds } },
        select: { id: true, journalEntryId: true },
      });
      const paymentIds = dummyPayments.map(p => p.id);
      const paymentJeIds = dummyPayments.map(p => p.journalEntryId).filter((id): id is string => id != null);

      // 3. Delete payment allocations
      if (paymentIds.length > 0) {
        await tx.paymentAllocation.deleteMany({ where: { paymentId: { in: paymentIds } } });
      }

      // 4. Delete payments (must come before journal entries and parties)
      if (paymentIds.length > 0) {
        results.payments = (await tx.payment.deleteMany({ where: { id: { in: paymentIds } } })).count;
      }

      // 5. Delete ledger entries referencing dummy invoices, payments, and dummy journal markers
      const dummyRefIds = [
        ...siIds, ...piIds, ...paymentIds,
        'dummy-modal-init', 'dummy-gaji', 'dummy-listrik', 'dummy-pay-pi',
      ];
      if (dummyRefIds.length > 0) {
        await tx.accountingLedgerEntry.deleteMany({ where: { referenceId: { in: dummyRefIds } } });
      }
      // Also delete ledger entries linked to dummy parties directly
      if (partyIds.length > 0) {
        await tx.accountingLedgerEntry.deleteMany({ where: { partyId: { in: partyIds } } });
      }

      // 6. Delete journal entries linked to payments
      if (paymentJeIds.length > 0) {
        await tx.journalItem.deleteMany({ where: { journalEntryId: { in: paymentJeIds } } });
        await tx.journalEntry.deleteMany({ where: { id: { in: paymentJeIds } } });
      }

      // 7. Find and delete all dummy-created journal entries by narration patterns
      const dummyJournals = await tx.journalEntry.findMany({
        where: {
          OR: [
            { narration: { startsWith: 'Setoran modal awal' } },
            { narration: { startsWith: 'Pembelian gabah' } },
            { narration: { startsWith: 'Penjualan beras' } },
            { narration: { startsWith: 'Pembayaran ' } },
            { narration: { startsWith: 'Gaji karyawan bulan' } },
            { narration: { startsWith: 'Listrik & air bulan' } },
          ],
        },
        select: { id: true },
      });
      const journalIds = dummyJournals.map(j => j.id);
      if (journalIds.length > 0) {
        await tx.journalItem.deleteMany({ where: { journalEntryId: { in: journalIds } } });
        results.journals = (await tx.journalEntry.deleteMany({ where: { id: { in: journalIds } } })).count;
      }

      // 8. Delete invoice items then invoices
      if (siIds.length > 0) {
        await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: { in: siIds } } });
        results.salesInvoices = (await tx.salesInvoice.deleteMany({ where: { isDummy: true } })).count;
      }
      if (piIds.length > 0) {
        await tx.purchaseInvoiceItem.deleteMany({ where: { purchaseInvoiceId: { in: piIds } } });
        results.purchaseInvoices = (await tx.purchaseInvoice.deleteMany({ where: { isDummy: true } })).count;
      }

      // 9. Delete production runs linked to dummy inventory items
      if (itemIds.length > 0) {
        const dummyProdItems = await tx.productionRunItem.findMany({
          where: { itemId: { in: itemIds } },
          select: { productionRunId: true },
        });
        const prodRunIds = [...new Set(dummyProdItems.map(p => p.productionRunId))];
        if (prodRunIds.length > 0) {
          await tx.productionRunItem.deleteMany({ where: { productionRunId: { in: prodRunIds } } });
          results.productionRuns = (await tx.productionRun.deleteMany({ where: { id: { in: prodRunIds } } })).count;
        }

        // Delete stock movements and inventory items
        results.movements = (await tx.stockMovement.deleteMany({ where: { itemId: { in: itemIds } } })).count;
        results.inventoryItems = (await tx.inventoryItem.deleteMany({ where: { isDummy: true } })).count;
      }

      // 10. Delete dummy parties (now safe — no FK references remain)
      results.parties = (await tx.party.deleteMany({ where: { isDummy: true } })).count;

      // 11. Recalculate all account balances from ledger entries
      const allAccounts = await tx.account.findMany({ where: { isGroup: false }, select: { id: true, rootType: true } });
      for (const acct of allAccounts) {
        const sums = await tx.accountingLedgerEntry.aggregate({
          where: { accountId: acct.id, isCancelled: false },
          _sum: { debit: true, credit: true },
        });
        const totalDebit = Number(sums._sum.debit || 0);
        const totalCredit = Number(sums._sum.credit || 0);
        const isDebitNormal = acct.rootType === 'ASSET' || acct.rootType === 'EXPENSE';
        const balance = isDebitNormal ? totalDebit - totalCredit : totalCredit - totalDebit;
        await tx.account.update({ where: { id: acct.id }, data: { balance } });
      }

      // 12. Recalculate party outstanding amounts
      const remainingParties = await tx.party.findMany({ select: { id: true, partyType: true } });
      for (const party of remainingParties) {
        let outstanding = 0;
        if (party.partyType === 'Customer' || party.partyType === 'Both') {
          const siSum = await tx.salesInvoice.aggregate({
            where: { partyId: party.id, status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] } },
            _sum: { outstanding: true },
          });
          outstanding += Number(siSum._sum.outstanding || 0);
        }
        if (party.partyType === 'Supplier' || party.partyType === 'Both') {
          const piSum = await tx.purchaseInvoice.aggregate({
            where: { partyId: party.id, status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] } },
            _sum: { outstanding: true },
          });
          outstanding += Number(piSum._sum.outstanding || 0);
        }
        await tx.party.update({ where: { id: party.id }, data: { outstandingAmount: outstanding } });
      }
    }, { timeout: 120000 });

    logger.info({ results }, 'Dummy data deleted');
    return res.json({ message: 'Data dummy berhasil dihapus.', results });
  } catch (error) {
    logger.error({ error }, 'POST /settings/delete-dummy error');
    return res.status(500).json({ error: 'Gagal menghapus data dummy.' });
  }
});

// POST /api/settings/reset-data — Reset all data and re-seed (Admin only, development)
router.post('/reset-data', requirePerm('settings'), async (req, res) => {
  const body = req.body;
  if (body?.confirmation !== 'RESET') {
    return res.status(400).json({ error: 'Ketik RESET untuk mengonfirmasi.' });
  }

  try {
    // Delete all data in correct order (respect FK constraints)
    await prisma.$transaction(async (tx) => {
      // Use raw SQL TRUNCATE CASCADE — deletes all data respecting FKs in one shot
      await tx.$executeRawUnsafe(`
        TRUNCATE TABLE
          transaction_attachments,
          token_blacklist,
          notifications,
          audit_trail,
          bank_reconciliation_items,
          bank_reconciliations,
          recurring_templates,
          vendor_deposit_applications,
          customer_deposit_applications,
          payment_allocations,
          payments,
          sales_invoice_items,
          sales_invoices,
          purchase_invoice_items,
          purchase_invoices,
          production_run_items,
          production_runs,
          stock_movements,
          inventory_items,
          service_items,
          accounting_ledger_entries,
          journal_entry_accounts,
          journal_entries,
          parties,
          system_account_mappings,
          accounts,
          tax_configs,
          fiscal_years,
          company_settings,
          users
        CASCADE
      `);
    }, { timeout: 60000 });

    // Re-seed by running the seed script
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    try {
      await execFileAsync('npx', ['tsx', 'prisma/seed.ts'], {
        cwd: path.resolve(__dirname, '../../..'),
        env: { ...process.env },
        timeout: 120000,
      });
    } catch (seedError) {
      logger.error({ error: seedError }, 'Seed failed after reset');
      return res.status(500).json({ error: 'Data berhasil dihapus, tapi gagal re-seed. Silakan restart server.' });
    }

    logger.info('Database reset and re-seeded successfully');
    return res.json({ message: 'Data berhasil direset. Silakan login ulang.' });
  } catch (error) {
    logger.error({ error }, 'POST /settings/reset-data error');
    return res.status(500).json({ error: 'Gagal mereset data.' });
  }
});

// GET /api/settings/check-update — Check GitHub for newer version

export default router;
