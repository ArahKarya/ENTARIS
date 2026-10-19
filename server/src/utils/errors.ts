import { Response } from 'express';
import { logger } from '../lib/logger';

export class BusinessError extends Error {
  /** Stable machine-readable code for clients; the message may be translated. */
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
  }
}

/**
 * Standardized error handler for route catch blocks.
 * Handles BusinessError, Prisma errors, and transaction timeouts consistently.
 */
export function handleRouteError(res: Response, error: any, context: string, fallbackMsg: string) {
  if (error instanceof BusinessError) {
    return res.status(400).json(error.code ? { error: error.message, code: error.code } : { error: error.message });
  }
  if (error?.code === 'P2025') {
    return res.status(400).json({ error: 'Data terkait tidak ditemukan. Periksa referensi yang dipilih.' });
  }
  if (error?.code === 'P2002') {
    return res.status(400).json({ error: 'Data duplikat terdeteksi. Silakan coba lagi.' });
  }
  if (error?.code === 'P2003') {
    return res.status(400).json({ error: 'Referensi data tidak valid. Periksa data yang dipilih.' });
  }
  if (error?.message?.includes('Transaction already closed') || error?.message?.includes('Unable to start')) {
    logger.error({ error }, `Transaction timeout: ${context}`);
    return res.status(503).json({ error: 'Server sibuk, silakan coba lagi dalam beberapa detik.' });
  }
  logger.error({ error, stack: error?.stack, code: error?.code }, context);
  return res.status(500).json({ error: fallbackMsg });
}
