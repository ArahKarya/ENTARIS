/**
 * Pengaturan → AIRA (MCP).
 *
 * Entaris adalah server MCP untuk mesin AI (engine AIRA). Tab ini hanya memuat: status + kill switch,
 * info endpoint (URL, header Authorization, health check siap-salin), manajemen token MCP, dan riwayat panggilan.
 * Channel/whitelist, token servis lama, daftar tool & Test Tool sudah dipensiunkan
 * (registrasi pengguna AIRA ada di Manajemen Pengguna).
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
