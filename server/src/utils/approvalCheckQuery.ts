/** documentType + numeric amount from the query, or null when either is missing/invalid. */
export function parseApprovalCheckQuery(query: Record<string, unknown>): { documentType: string; amount: number } | null {
  const documentType = typeof query.documentType === 'string' ? query.documentType.trim() : '';
  const rawAmount = typeof query.amount === 'string' ? query.amount.trim() : '';
  const amount = Number(rawAmount);
  if (!documentType || rawAmount === '' || !Number.isFinite(amount)) return null;
  return { documentType, amount };
}
