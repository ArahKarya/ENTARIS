import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { redactSecrets } from '../utils/redact';

export const auditTrailMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);

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
            entityId: (body && body.id) ? String(body.id) : 'N/A',
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
