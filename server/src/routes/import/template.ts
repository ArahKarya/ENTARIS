import { Router } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { logger } from '../../lib/logger';

const router = Router();

// GET /api/import/template/:type
// Download current data as editable Excel template for re-upload
router.get(
  '/template/:type',
  async (req: AuthRequest, res) => {
    const { type } = req.params;

    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Data');

      if (type === 'coa') {
        sheet.columns = [
          { header: 'accountNumber', key: 'accountNumber', width: 15 },
          { header: 'name', key: 'name', width: 35 },
          { header: 'rootType', key: 'rootType', width: 12 },
          { header: 'accountType', key: 'accountType', width: 12 },
          { header: 'parentNumber', key: 'parentNumber', width: 15 },
          { header: 'isGroup', key: 'isGroup', width: 10 },
          { header: 'openingBalance', key: 'openingBalance', width: 18 },
        ];

        const accounts = await prisma.account.findMany({
          include: { parent: { select: { accountNumber: true } } },
          orderBy: { accountNumber: 'asc' },
        });

        for (const acc of accounts) {
          sheet.addRow({
            accountNumber: acc.accountNumber,
            name: acc.name,
            rootType: acc.rootType,
            accountType: acc.accountType,
            parentNumber: acc.parent?.accountNumber ?? '',
            isGroup: acc.isGroup ? 'true' : 'false',
            openingBalance: Number(acc.balance),
          });
        }
      } else if (type === 'parties') {
        sheet.columns = [
          { header: 'name', key: 'name', width: 30 },
          { header: 'partyType', key: 'partyType', width: 12 },
          { header: 'phone', key: 'phone', width: 18 },
          { header: 'email', key: 'email', width: 25 },
          { header: 'address', key: 'address', width: 40 },
          { header: 'taxId', key: 'taxId', width: 20 },
          { header: 'openingBalance', key: 'openingBalance', width: 18 },
          { header: 'depositBalance', key: 'depositBalance', width: 18 },
          { header: 'customerDepositBalance', key: 'customerDepositBalance', width: 22 },
        ];

        const parties = await prisma.party.findMany({
          where: { isActive: true, isDummy: false },
          orderBy: { name: 'asc' },
        });

        for (const p of parties) {
          sheet.addRow({
            name: p.name,
            partyType: p.partyType,
            phone: p.phone ?? '',
            email: p.email ?? '',
            address: p.address ?? '',
            taxId: p.taxId ?? '',
            openingBalance: Number(p.outstandingAmount),
            depositBalance: Number(p.depositBalance),
            customerDepositBalance: Number(p.customerDepositBalance),
          });
        }
      } else if (type === 'inventory') {
        sheet.columns = [
          { header: 'code', key: 'code', width: 15 },
          { header: 'name', key: 'name', width: 30 },
          { header: 'unit', key: 'unit', width: 10 },
          { header: 'category', key: 'category', width: 20 },
          { header: 'description', key: 'description', width: 35 },
          { header: 'minimumStock', key: 'minimumStock', width: 15 },
          { header: 'openingQty', key: 'openingQty', width: 15 },
          { header: 'openingPrice', key: 'openingPrice', width: 18 },
        ];

        const items = await prisma.inventoryItem.findMany({
          where: { isActive: true, isDummy: false },
          orderBy: { code: 'asc' },
        });

        for (const item of items) {
          sheet.addRow({
            code: item.code,
            name: item.name,
            unit: item.unit,
            category: item.category ?? '',
            description: item.description ?? '',
            minimumStock: Number(item.minimumStock),
            openingQty: '',
            openingPrice: '',
          });
        }
      } else {
        return res.status(400).json({ error: `Tipe "${type}" tidak didukung. Gunakan: coa, parties, inventory.` });
      }

      // Style header row
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F0FE' },
      };

      const safeName = type.replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="template_${safeName}.xlsx"`);

      const buffer = await workbook.xlsx.writeBuffer();
      return res.send(Buffer.from(buffer as ArrayBuffer));
    } catch (error: any) {
      logger.error({ error }, `GET /import/template/${type} error`);
      return res.status(500).json({ error: 'Gagal membuat template.' });
    }
  }
);

export default router;
