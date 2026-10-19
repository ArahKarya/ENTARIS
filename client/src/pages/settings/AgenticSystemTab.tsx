/**
 * Settings → AIRA (MCP): status and kill switch, endpoint info, MCP tokens and call history.
 * AIRA user registration lives in User Management.
 */
import React from 'react';
import { McpStatusCard, McpEndpointCard } from './aira/McpStatusCards';
import { McpTokensCard } from './aira/McpTokensCard';
import { McpCallsCard } from './aira/McpCallsCard';

export const AgenticSystemTab: React.FC = () => (
  <div className="space-y-5">
    <McpStatusCard />
    <McpEndpointCard />
    <McpTokensCard />
    <McpCallsCard />
  </div>
);
