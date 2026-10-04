import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { redactSecrets } from '../utils/redact';
import { captureBeforeSnapshot } from './auditSnapshot';

export const auditTrailMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);

  // Before-state for registered documents/masters (never throws; null on skip).
  const before =
    req.user && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
      ? await captureBeforeSnapshot(req.method, req.originalUrl)
      : null;

  res.json = function (body) {
    if (req.user && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const actionMap: Record<string, string> = {
        POST: 'CREATE',
        PUT: 'UPDATE',
        PATCH: 'UPDATE',
        DELETE: 'DELETE',
      };

      // req.originalUrl = '/api/sales/invoices' → extract 'sales'
      const segments = req.originalUrl.replace(/^\/api\//, '').split('/').filter(Boolean);
      const entityType = segments[0] || 'unknown';

      void prisma.auditLog
        .create({
          data: {
            userId: req.user!.userId,
            action: actionMap[req.method],
            entityType,
            entityId: (body && body.id) ? String(body.id) : (before?.id ?? 'N/A'),
            oldValues: (before?.snapshot ?? undefined) as object | undefined,
            newValues: redactSecrets(body) as object,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          },
        })
        .catch((err) => logger.error({ err }, 'Audit log write failed'));
    }
    return originalJson(body);
  };

  next();
};
