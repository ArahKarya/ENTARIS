import type { AiSetting } from '@prisma/client';

export type PublicAiSetting = Omit<AiSetting, 'serviceToken'> & { hasServiceToken: boolean };

/**
 * Client-safe view of the AI settings row. The service token grants Admin-level
 * access via the x-aira-service-token header, so it must never leave the server
 * (API responses are also persisted by the audit trail). Only report whether
 * one is configured.
 */
export function toPublicAiSetting(setting: AiSetting): PublicAiSetting {
  const { serviceToken, ...rest } = setting;
  return { ...rest, hasServiceToken: !!serviceToken };
}
