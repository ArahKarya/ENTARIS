import { useState } from 'react';
import { toast } from 'sonner';
import { useCompanyPDF } from './useCompanyPDF';
import type { PurchaseOrderPDFData } from './PurchaseOrderPDF';

/** Builds the PO PDF on demand (renderer + template lazy-loaded) and downloads it. */
export function usePurchaseOrderPdf() {
  const company = useCompanyPDF();
  const [busy, setBusy] = useState(false);

  const download = async (po: PurchaseOrderPDFData) => {
    setBusy(true);
    try {
      const [{ pdf }, { default: PurchaseOrderPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./PurchaseOrderPDF'),
      ]);
      const blob = await pdf(<PurchaseOrderPDF po={po} company={company} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${po.poNumber}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Gagal membuat PDF PO.');
    } finally {
      setBusy(false);
    }
  };

  return { download, busy };
}
