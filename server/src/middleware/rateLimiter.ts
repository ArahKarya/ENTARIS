import rateLimit from 'express-rate-limit';

/**
 * Dev/QA-only escape hatch: automated UI runs (Playwright) log in repeatedly and
 * would otherwise lock themselves out. Never active in production, regardless of env.
 */
export function isLoginRateLimitDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV !== 'production' && env.DISABLE_LOGIN_RATE_LIMIT === 'true';
}

/** Max 10 login attempts per IP per 15 minutes. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
  skipSuccessfulRequests: true,
  skip: () => isLoginRateLimitDisabled(),
});
