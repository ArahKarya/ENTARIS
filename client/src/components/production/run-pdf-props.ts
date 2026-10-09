import type { ProductionRunPDFProps } from '../../lib/pdf/ProductionRunPDF';
import type { useCompanyPDF } from '../../lib/pdf/useCompanyPDF';

// ─── Helper: map run + company → PDF props ────────────────────────────────
export function buildPdfProps(run: any, company: ReturnType<typeof useCompanyPDF>): ProductionRunPDFProps {
  const allItems: any[] = run.items ?? [];
  const mapItem = (line: any) => {
    const batchRef = line.sourceMovement
      ? `${line.sourceMovement.referenceNumber || line.sourceMovement.movementNumber} (${new Date(line.sourceMovement.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })})`
      : null;
    const lineCost = line.batchUnitCost != null
      ? Number(line.batchUnitCost)
      : line.unitPrice != null
        ? Number(line.unitPrice)
        : Number(line.item?.averageCost ?? 0);
    return {
      code: line.item?.code ?? null,
      name: line.item?.name ?? '',
      qty: Number(line.quantity),
      unit: line.item?.unit ?? '',
      unitCost: lineCost,
      isByProduct: line.isByProduct,
      batchRef,
    };
  };

  const inputLines = allItems.filter((i) => i.lineType === 'Input').map(mapItem);
  const outputLines = allItems.filter((i) => i.lineType === 'Output').map(mapItem);
  const byproductLines = allItems
    .filter((i) => i.lineType === 'ByProduct' || i.isByProduct)
    .filter((i) => i.lineType !== 'Output')
    .map(mapItem);

  const costs = (run.runCosts ?? []).map((c: any) => ({
    description: c.description,
    costSide: c.costSide,
    basis: c.basis,
    rate: Number(c.rate),
    qtyBasis: Number(c.qtyBasis),
    totalAmount: Number(c.totalAmount),
    accountLabel: c.costAccount
      ? `${c.costAccount.accountNumber} ${c.costAccount.name}`
      : null,
  }));

  const totalMainQty = outputLines.reduce((s, o) => s + o.qty, 0);

  // Resolve warehouse: prefer header (Phase-5 future) else first line
  const firstWh = allItems[0]?.warehouse;

  return {
    runNumber: run.runNumber,
    date: run.date,
    warehouseName: firstWh ? `${firstWh.code} · ${firstWh.name}` : null,
    referenceNumber: run.referenceNumber ?? null,
    notes: run.notes ?? null,
    yieldPct: run.yieldPct != null ? Number(run.yieldPct) : null,
    processes: Array.isArray(run.runProcesses)
      ? run.runProcesses.map((rp: any) => rp.process?.name).filter(Boolean)
      : [],
    inputs: inputLines,
    outputs: outputLines,
    byproducts: byproductLines,
    costs,
    totals: {
      totalMaterialCost: Number(run.totalMaterialCost ?? 0),
      totalCostInputSide: Number(run.totalCostInputSide ?? 0),
      totalCostOutputSide: Number(run.totalCostOutputSide ?? 0),
      totalByproductValue: Number(run.totalByproductValue ?? 0),
      computedHpp: run.computedHpp != null ? Number(run.computedHpp) : null,
      hppManualOverride: !!run.hppManualOverride,
      mainOutputQty: totalMainQty,
    },
    company: {
      name: company.name,
      address: company.address,
      phone: company.phone,
      email: company.email,
      taxId: company.taxId,
      logoUrl: company.logoUrl,
    },
    createdByName: run.createdBy?.fullName ?? null,
  };
}
