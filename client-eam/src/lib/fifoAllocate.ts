// Bagi Batch Otomatis (FIFO): pecah total qty menjadi alokasi per batch
// mengikuti urutan FIFO dari endpoint /inventory/items/:id/batches (sudah
// terurut tanggal tertua + qtyAvailable akurat, termasuk absorpsi konsumsi
// legacy). Murni prefill form di client — validasi & posting tetap di server.
import api from './api';
import type { Batch } from '../components/BatchPicker';

export interface FifoAllocation {
  batch: Batch;
  qty: number;
}

export interface FifoResult {
  allocations: FifoAllocation[];
  /** Sisa qty yang tidak tertampung batch mana pun (perlu baris WAC). */
  shortfall: number;
  totalAvailable: number;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export async function fetchBatches(itemId: string, warehouseId: string): Promise<Batch[]> {
  const res = await api.get(`/inventory/items/${itemId}/batches`, {
    params: { warehouseId },
  });
  return (res.data?.data ?? []) as Batch[];
}

/**
 * Alokasikan totalQty ke batches secara FIFO.
 * @param claimed qty per movementId yang SUDAH dipakai baris lain di form
 *                yang sama (item+gudang sama) — mencegah dobel alokasi.
 */
export function allocateFifo(
  batches: Batch[],
  totalQty: number,
  claimed?: Map<string, number>,
): FifoResult {
  const allocations: FifoAllocation[] = [];
  let remaining = round3(totalQty);
  let totalAvailable = 0;

  for (const batch of batches) {
    const alreadyClaimed = claimed?.get(batch.id) ?? 0;
    const available = round3(Math.max(0, batch.qtyAvailable - alreadyClaimed));
    totalAvailable = round3(totalAvailable + available);
    if (remaining <= 0 || available <= 0) continue;

    const take = round3(Math.min(remaining, available));
    if (take <= 0) continue;
    allocations.push({ batch, qty: take });
    remaining = round3(remaining - take);
  }

  return { allocations, shortfall: remaining > 0 ? remaining : 0, totalAvailable };
}
