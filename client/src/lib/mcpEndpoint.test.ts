import { describe, expect, it } from 'vitest';
import { CALL_DECISIONS, DECISION_TONE, decisionLabel, authorizationHeader, healthCurl, initializeCurl, mcpUrl, normalizeBaseUrl } from './mcpEndpoint';

describe('mcpEndpoint', () => {
  it('normalises the base URL and builds /mcp', () => {
    expect(normalizeBaseUrl(' https://erp.example.com/// ')).toBe('https://erp.example.com');
    expect(mcpUrl('http://10.0.0.5:3001/')).toBe('http://10.0.0.5:3001/mcp');
  });

  it('builds the engine-neutral Authorization header and health curl', () => {
    expect(authorizationHeader()).toBe('Authorization: Bearer <TOKEN_MCP>');
    expect(authorizationHeader('entmcp_abc')).toBe('Authorization: Bearer entmcp_abc');
    expect(healthCurl('https://erp.example.com/')).toBe('curl -s https://erp.example.com/mcp/health');
  });

  it('initialize example carries the bearer header and the JSON-RPC body', () => {
    const c = initializeCurl('http://x:3001', 'entmcp_abc');
    expect(c).toContain("Authorization: Bearer entmcp_abc");
    expect(c).toContain('"method":"initialize"');
    expect(initializeCurl('http://x')).toContain('<TOKEN_MCP>');
  });

  it('every decision has a label and a tone', () => {
    for (const d of CALL_DECISIONS) {
      expect(decisionLabel(d)).toBeTruthy();
      expect(decisionLabel(d)).not.toContain('mcp.decision');
      expect(DECISION_TONE[d]).toBeTruthy();
    }
    expect(decisionLabel('queued')).toBe('Menunggu persetujuan');
    expect(decisionLabel('unknown')).toBe('unknown');
  });
});
