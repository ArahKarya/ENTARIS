import { describe, expect, it } from 'vitest';
import { DECISION_LABEL, DECISION_TONE, healthCurl, hermesAddCommand, initializeCurl, mcpUrl, normalizeBaseUrl } from './mcpEndpoint';

describe('mcpEndpoint', () => {
  it('normalises the base URL and builds /mcp', () => {
    expect(normalizeBaseUrl(' https://erp.example.com/// ')).toBe('https://erp.example.com');
    expect(mcpUrl('http://100.101.203.54:3001/')).toBe('http://100.101.203.54:3001/mcp');
  });

  it('builds the copy-ready Hermes command and health curl', () => {
    expect(hermesAddCommand('https://erp.example.com')).toBe('hermes mcp add entaris --url https://erp.example.com/mcp --auth header');
    expect(healthCurl('https://erp.example.com/')).toBe('curl -s https://erp.example.com/mcp/health');
  });

  it('initialize example carries the bearer header and the JSON-RPC body', () => {
    const c = initializeCurl('http://x:3001', 'entmcp_abc');
    expect(c).toContain("Authorization: Bearer entmcp_abc");
    expect(c).toContain('"method":"initialize"');
    expect(initializeCurl('http://x')).toContain('<TOKEN_MCP>');
  });

  it('every decision has a label and a tone', () => {
    for (const d of ['allowed', 'queued', 'denied', 'error', 'inflight'] as const) {
      expect(DECISION_LABEL[d]).toBeTruthy();
      expect(DECISION_TONE[d]).toBeTruthy();
    }
  });
});
