import { describe, it, expect } from 'vitest';
import { isLoginRateLimitDisabled } from '../rateLimiter';

describe('isLoginRateLimitDisabled', () => {
  it('is enabled (limiter active) by default', () => {
    expect(isLoginRateLimitDisabled({})).toBe(false);
  });

  it('is disabled in development when explicitly opted out', () => {
    expect(isLoginRateLimitDisabled({ NODE_ENV: 'development', DISABLE_LOGIN_RATE_LIMIT: 'true' })).toBe(true);
  });

  it('never disables the limiter in production', () => {
    expect(isLoginRateLimitDisabled({ NODE_ENV: 'production', DISABLE_LOGIN_RATE_LIMIT: 'true' })).toBe(false);
  });

  it('requires the exact value "true"', () => {
    expect(isLoginRateLimitDisabled({ NODE_ENV: 'development', DISABLE_LOGIN_RATE_LIMIT: '1' })).toBe(false);
  });
});
