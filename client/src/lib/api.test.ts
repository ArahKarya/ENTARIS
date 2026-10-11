import { afterEach, describe, expect, it } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import i18n from '@/i18n';
import api, { LANGUAGE_HEADER } from './api';

/** Resolves every request locally and echoes the headers that would have been sent. */
async function sentHeaders(): Promise<Record<string, unknown>> {
  const res = await api.get('/echo', {
    adapter: async (config: InternalAxiosRequestConfig) => ({
      data: config.headers.toJSON(),
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }),
  });
  return res.data as Record<string, unknown>;
}

describe('api language header', () => {
  afterEach(async () => {
    await i18n.changeLanguage('id');
  });

  it('sends the current UI language on every request', async () => {
    expect((await sentHeaders())[LANGUAGE_HEADER]).toBe('id');
    await i18n.changeLanguage('en');
    expect((await sentHeaders())[LANGUAGE_HEADER]).toBe('en');
  });
});
