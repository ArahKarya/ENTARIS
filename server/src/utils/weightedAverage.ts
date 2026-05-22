import Decimal from 'decimal.js';

/**
 * Recalculate weighted average cost after a stock-in movement.
 *
 * Formula:
 *   newAvgCost = (currentQty × currentAvgCost + inQty × inUnitCost) / (currentQty + inQty)
 *
 * @param currentQty  - Current stock quantity BEFORE the new movement
 * @param currentAvgCost - Current weighted average cost per unit
 * @param inQty - Quantity being added
 * @param inUnitCost - Unit cost of the incoming stock
 * @returns New weighted average cost (rounded to 2 decimals)
 */
export function calcWeightedAverage(
  currentQty: number | Decimal,
  currentAvgCost: number | Decimal,
  inQty: number | Decimal,
  inUnitCost: number | Decimal,
): number {
  const cQty = new Decimal(currentQty.toString());
  const cCost = new Decimal(currentAvgCost.toString());
  const iQty = new Decimal(inQty.toString());
  const iCost = new Decimal(inUnitCost.toString());

  // Guard: if current stock is negative or zero (oversold), WAC formula
  // produces absurd values (sometimes negative, sometimes inflated). The
  // sensible fallback is to anchor the average to the incoming cost itself —
  // treat the inbound as the new reference price since the previous "stock"
  // was already invalid. Otherwise small inbound qty + huge negative balance
  // can push avg cost to millions, corrupting downstream COGS.
  if (cQty.lte(0)) {
    return iCost.toDecimalPlaces(2).toNumber();
  }

  const totalQty = cQty.plus(iQty);
  if (totalQty.lte(0)) {
    // Pathological: incoming qty smaller than (negative of) current. Anchor
    // to inCost as well — there's no meaningful weighted value.
    return iCost.toDecimalPlaces(2).toNumber();
  }

  const totalValue = cQty.times(cCost).plus(iQty.times(iCost));
  return totalValue.div(totalQty).toDecimalPlaces(2).toNumber();
}
