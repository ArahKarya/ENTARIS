/** Server error message (`{ error }` body) or a fallback. */
export function apiError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' && data.error ? data.error : fallback;
}
