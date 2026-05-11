import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AuthRequest, roleMiddleware } from '../../middleware/auth';
import { computeImpact, updateBalancesForItems } from '../../utils/accountBalance';
import { generateDocumentNumber } from '../../utils/documentNumber';
import { getOpenFiscalYear } from '../../utils/fiscalYear';
import { systemAccounts } from '../../services/systemAccounts';
import { logger } from '../../lib/logger';
import { upload, parseFile, sanitizeCellValue } from './shared';

const router = Router();

// ─── POST /api/import/parties ────────────────────────────────────────────────
router.post(
  '/parties',
  roleMiddleware(['Admin', 'Accountant']),
  upload.single('file'),
  async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'File wajib diunggah.' });

    try {
      const rows = await parseFile(req.file.buffer, req.file.originalname);
      const isPreview = req.query.preview === 'true';
      const errors: Array<{ row: number; message: string }> = [];
      const validRows: Array<{
        name: string;
        partyType: 'Customer' | 'Supplier' | 'Both';
        phone?: string;
        email?: string;
        address?: string;
        taxId?: string;
        openingBalance: number;
        depositBalance: number;
        customerDepositBalance: number;
      }> = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;

        if (!r.name?.trim()) {
          errors.push({ row: rowNum, message: 'Kolom "name" wajib diisi.' });
          continue;
        }

        const partyType = (r.partyType || r.party_type || '').trim();
        if (!['Customer', 'Supplier', 'Both'].includes(partyType)) {
          errors.push({ row: rowNum, message: `partyType "${partyType}" tidak valid. Gunakan: Customer, Supplier, atau Both.` });
          continue;
        }

        const openingBalanceStr = (r.openingBalance || r.opening_balance || r.outstandingAmount || r.outstanding_amount || r.saldoAwal || r.saldo_awal || r.piutang || r.hutang || r.balance || '').toString().trim();
        const openingBalance = openingBalanceStr ? parseFloat(openingBalanceStr) : 0;
        if (isNaN(openingBalance)) {
          errors.push({ row: rowNum, message: `openingBalance "${openingBalanceStr}" bukan angka valid.` });
          continue;
        }

        const depositBalanceStr = (r.depositBalance || r.deposit_balance || r.saldoDeposit || r.saldo_deposit || r.uangMuka || r.uang_muka || '').trim();
        const depositBalance = depositBalanceStr ? parseFloat(depositBalanceStr) : 0;
        if (isNaN(depositBalance)) {
          errors.push({ row: rowNum, message: `depositBalance "${depositBalanceStr}" bukan angka valid.` });
          continue;
        }

        const custDepositStr = (r.customerDepositBalance || r.customer_deposit_balance || r.depositPelanggan || r.deposit_pelanggan || '').trim();
        const customerDepositBalance = custDepositStr ? parseFloat(custDepositStr) : 0;
        if (isNaN(customerDepositBalance)) {
          errors.push({ row: rowNum, message: `customerDepositBalance "${custDepositStr}" bukan angka valid.` });
          continue;
        }

        validRows.push({
          name: sanitizeCellValue(r.name),
          partyType: partyType as 'Customer' | 'Supplier' | 'Both',
          phone: r.phone?.trim() ? sanitizeCellValue(r.phone) : undefined,
          email: r.email?.trim() ? sanitizeCellValue(r.email) : undefined,
          address: r.address?.trim() ? sanitizeCellValue(r.address) : undefined,
          taxId: (r.taxId || r.tax_id || '').trim() ? sanitizeCellValue(r.taxId || r.tax_id) : undefined,
          openingBalance,
          depositBalance,
          customerDepositBalance,
        });
      }

      if (isPreview) {
        return res.json({ data: validRows, errors, total: rows.length });
      }

      // Insert valid rows
      let success = 0;
      for (const row of validRows) {
        try {
          const { openingBalance, depositBalance: rawDepositBalance, customerDepositBalance: rawCustomerDepositBalance, ...partyData } = row;

          // If customer has depositBalance but no customerDepositBalance, treat it as customer deposit
          const isCustomerType = row.partyType === 'Customer';
          const depositBalance = isCustomerType ? 0 : rawDepositBalance;
          const customerDepositBalance = isCustomerType
            ? (rawCustomerDepositBalance || rawDepositBalance)
            : rawCustomerDepositBalance;

          // Find existing party by name or create new
          let party = await prisma.party.findFirst({
            where: { name: row.name, partyType: row.partyType },
          });
          const partyFields = {
            ...partyData,
            outstandingAmount: openingBalance,
            depositBalance,
            customerDepositBalance,
          };
          if (party) {
            party = await prisma.party.update({
              where: { id: party.id },
              data: partyFields,
            });
          } else {
            party = await prisma.party.create({
              data: partyFields,
            });
          }

          // Create opening balance journals if needed
          const needsJournal = openingBalance > 0 || depositBalance > 0 || customerDepositBalance > 0;
          if (needsJournal) {
            const isCustomer = row.partyType === 'Customer' || row.partyType === 'Both';
            const isSupplier = row.partyType === 'Supplier' || row.partyType === 'Both';
            const arAccount = await systemAccounts.getAccount('AR');
            const apAccount = await systemAccounts.getAccount('AP');
            const vendorDepositAccount = await systemAccounts.getAccount('VENDOR_DEPOSIT');
            const customerDepositAccount = await systemAccounts.getAccount('CUSTOMER_DEPOSIT');
            const openingEquityAccount = await systemAccounts.getAccount('OPENING_EQUITY');

            {
              const now = new Date();
              const fiscalYear = await getOpenFiscalYear(prisma as any, now);

              // Delete existing opening balance journals for this party to prevent duplicates on re-import
              const existingPartyJournals = await prisma.journalEntry.findMany({
                where: {
                  narration: { contains: row.name },
                  status: 'Submitted',
                  OR: [
                    { narration: { startsWith: 'Saldo awal piutang:' } },
                    { narration: { startsWith: 'Saldo awal hutang:' } },
                    { narration: { startsWith: 'Saldo awal uang muka vendor:' } },
                    { narration: { startsWith: 'Saldo awal uang muka pelanggan:' } },
                  ],
                },
                select: { id: true, items: { select: { accountId: true, debit: true, credit: true } } },
              });
              for (const ej of existingPartyJournals) {
                await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                  for (const item of ej.items) {
                    const acc = await tx.account.findUnique({ where: { id: item.accountId }, select: { rootType: true } });
                    if (acc) {
                      const reverseImpact = computeImpact(acc.rootType, item.debit, item.credit);
                      await tx.account.update({ where: { id: item.accountId }, data: { balance: { decrement: reverseImpact } } });
                    }
                  }
                  await tx.accountingLedgerEntry.deleteMany({ where: { referenceId: ej.id } });
                  await tx.journalItem.deleteMany({ where: { journalEntryId: ej.id } });
                  await tx.journalEntry.delete({ where: { id: ej.id } });
                });
              }
              // Also delete existing vendor deposit payments for this party
              const existingDepositPayments = await prisma.payment.findMany({
                where: { partyId: party.id, notes: { contains: 'Saldo awal uang muka' } },
                select: { id: true },
              });
              for (const ep of existingDepositPayments) {
                await prisma.payment.delete({ where: { id: ep.id } });
              }

              // 1) AR/AP opening balance journal
              if (openingBalance > 0) {
                const receivableAccount = isCustomer ? arAccount : apAccount;
                {
                  const jvNumber = await generateDocumentNumber(prisma as any, 'JV', now, fiscalYear.id);
                  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                    const journal = await tx.journalEntry.create({
                      data: {
                        entryNumber: jvNumber,
                        date: now,
                        narration: `Saldo awal ${isCustomer ? 'piutang' : 'hutang'}: ${row.name}`,
                        status: 'Submitted',
                        fiscalYearId: fiscalYear.id,
                        createdBy: req.user!.userId,
                        submittedAt: now,
                        items: {
                          create: isCustomer
                            ? [
                                { accountId: receivableAccount.id, partyId: party.id, debit: openingBalance, credit: 0, description: `Saldo awal piutang: ${row.name}` },
                                { accountId: openingEquityAccount.id, debit: 0, credit: openingBalance, description: `Saldo awal piutang: ${row.name}` },
                              ]
                            : [
                                { accountId: openingEquityAccount.id, debit: openingBalance, credit: 0, description: `Saldo awal hutang: ${row.name}` },
                                { accountId: receivableAccount.id, partyId: party.id, debit: 0, credit: openingBalance, description: `Saldo awal hutang: ${row.name}` },
                              ],
                        },
                      },
                      include: { items: true },
                    });

                    await tx.accountingLedgerEntry.createMany({
                      data: journal.items.map((item) => ({
                        date: now,
                        accountId: item.accountId,
                        partyId: item.partyId,
                        debit: item.debit,
                        credit: item.credit,
                        referenceType: 'JournalEntry' as const,
                        referenceId: journal.id,
                        description: item.description || `Saldo awal: ${row.name}`,
                        fiscalYearId: fiscalYear.id,
                      })),
                    });

                    await updateBalancesForItems(
                      tx,
                      journal.items.map((i) => ({ accountId: i.accountId, debit: i.debit, credit: i.credit })),
                    );
                  }, { timeout: 15000 });
                }
              }

              // 2) Vendor deposit: create Payment record + GL journal
              if (depositBalance > 0 && isSupplier) {
                await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                  const payNumber = await generateDocumentNumber(tx, 'PAY', now, fiscalYear.id);
                  const jvNumber = await generateDocumentNumber(tx, 'JV', now, fiscalYear.id);

                  // GL journal: DR Uang Muka Pembelian (1.3) / CR Ekuitas Saldo Awal
                  const journal = await tx.journalEntry.create({
                    data: {
                      entryNumber: jvNumber,
                      date: now,
                      narration: `Saldo awal uang muka vendor: ${row.name}`,
                      status: 'Submitted',
                      fiscalYearId: fiscalYear.id,
                      createdBy: req.user!.userId,
                      submittedAt: now,
                      items: {
                        create: [
                          { accountId: vendorDepositAccount.id, partyId: party.id, debit: depositBalance, credit: 0, description: `Saldo awal uang muka vendor: ${row.name}` },
                          { accountId: openingEquityAccount.id, debit: 0, credit: depositBalance, description: `Saldo awal uang muka vendor: ${row.name}` },
                        ],
                      },
                    },
                    include: { items: true },
                  });

                  // Payment record so it appears in vendor deposit module
                  await tx.payment.create({
                    data: {
                      paymentNumber: payNumber,
                      date: now,
                      paymentType: 'VendorDeposit',
                      partyId: party.id,
                      accountId: vendorDepositAccount.id,
                      amount: depositBalance,
                      status: 'Submitted',
                      notes: `Saldo awal uang muka vendor dari import: ${row.name}`,
                      createdBy: req.user!.userId,
                      journalEntryId: journal.id,
                      fiscalYearId: fiscalYear.id,
                      submittedAt: now,
                    },
                  });

                  await tx.accountingLedgerEntry.createMany({
                    data: journal.items.map((item) => ({
                      date: now,
                      accountId: item.accountId,
                      partyId: item.partyId,
                      debit: item.debit,
                      credit: item.credit,
                      referenceType: 'JournalEntry' as const,
                      referenceId: journal.id,
                      description: item.description || `Saldo awal uang muka vendor: ${row.name}`,
                      fiscalYearId: fiscalYear.id,
                    })),
                  });

                  await updateBalancesForItems(
                    tx,
                    journal.items.map((i) => ({ accountId: i.accountId, debit: Number(i.debit), credit: Number(i.credit) }))
                  );
                }, { timeout: 15000 });
              }

              // 3) Customer deposit: create Payment record + GL journal
              if (customerDepositBalance > 0 && isCustomer) {
                await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                  const payNumber = await generateDocumentNumber(tx, 'PAY', now, fiscalYear.id);
                  const jvNumber = await generateDocumentNumber(tx, 'JV', now, fiscalYear.id);

                  // GL journal: DR Ekuitas Saldo Awal / CR Uang Muka Pelanggan (2.1.2)
                  const journal = await tx.journalEntry.create({
                    data: {
                      entryNumber: jvNumber,
                      date: now,
                      narration: `Saldo awal uang muka pelanggan: ${row.name}`,
                      status: 'Submitted',
                      fiscalYearId: fiscalYear.id,
                      createdBy: req.user!.userId,
                      submittedAt: now,
                      items: {
                        create: [
                          { accountId: openingEquityAccount.id, debit: customerDepositBalance, credit: 0, description: `Saldo awal uang muka pelanggan: ${row.name}` },
                          { accountId: customerDepositAccount.id, partyId: party.id, debit: 0, credit: customerDepositBalance, description: `Saldo awal uang muka pelanggan: ${row.name}` },
                        ],
                      },
                    },
                    include: { items: true },
                  });

                  // Payment record so it appears in customer deposit module
                  await tx.payment.create({
                    data: {
                      paymentNumber: payNumber,
                      date: now,
                      paymentType: 'CustomerDeposit',
                      partyId: party.id,
                      accountId: customerDepositAccount.id,
                      amount: customerDepositBalance,
                      status: 'Submitted',
                      notes: `Saldo awal uang muka pelanggan dari import: ${row.name}`,
                      createdBy: req.user!.userId,
                      journalEntryId: journal.id,
                      fiscalYearId: fiscalYear.id,
                      submittedAt: now,
                    },
                  });

                  await tx.accountingLedgerEntry.createMany({
                    data: journal.items.map((item) => ({
                      date: now,
                      accountId: item.accountId,
                      partyId: item.partyId,
                      debit: item.debit,
                      credit: item.credit,
                      referenceType: 'JournalEntry' as const,
                      referenceId: journal.id,
                      description: item.description || `Saldo awal uang muka pelanggan: ${row.name}`,
                      fiscalYearId: fiscalYear.id,
                    })),
                  });

                  await updateBalancesForItems(
                    tx,
                    journal.items.map((i) => ({ accountId: i.accountId, debit: Number(i.debit), credit: Number(i.credit) }))
                  );
                }, { timeout: 15000 });
              }
            }
          }

          success++;
        } catch (err: any) {
          errors.push({ row: 0, message: `Gagal insert "${row.name}": ${err.message}` });
        }
      }

      return res.json({ success, failed: rows.length - success, errors });
    } catch (error: any) {
      logger.error({ error }, 'POST /import/parties error');
      return res.status(400).json({ error: error.message || 'Gagal memproses file.' });
    }
  }
);

export default router;
