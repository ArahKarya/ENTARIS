/**
 * An account referenced by a SystemAccountMapping (e.g. AR, AP, COGS) is wired
 * into automatic postings. Renumbering it silently changes reports/grouping, so
 * the accountNumber is frozen while any mapping points at it. Name edits stay allowed.
 * Returns an Indonesian error message, or null when the change is allowed.
 */
export function systemAccountRenumberError(
  currentNumber: string,
  requestedNumber: string | undefined | null,
  mappedRoles: readonly string[],
): string | null {
  if (!requestedNumber || requestedNumber === currentNumber) return null;
  if (mappedRoles.length === 0) return null;
  const roles = [...new Set(mappedRoles)].join(', ');
  return `Nomor akun ${currentNumber} tidak dapat diubah karena dipakai sebagai akun sistem (${roles}). Ubah dulu pemetaan di Pengaturan → Akun Sistem, atau ubah nama akun saja.`;
}
