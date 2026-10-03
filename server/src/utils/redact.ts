export const REDACTED = '[REDACTED]';

// Keys whose values must never be persisted in audit logs (compared lowercase).
const SECRET_KEYS = new Set([
  'servicetoken',
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'apitoken',
  'bottoken',
]);

/**
 * Return a deep copy of `value` with secret-looking keys masked. Used before
 * writing request/response payloads to the audit trail. Never mutates input.
 */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, v]) => [
      key,
      SECRET_KEYS.has(key.toLowerCase()) && v !== null && v !== '' ? REDACTED : redactSecrets(v),
    ]),
  );
}
