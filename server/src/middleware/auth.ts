import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { can, hasCap } from '../services/permissionService';
import type { PermAction } from '../constants/modules';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // Extract token: prefer cookie, fall back to Authorization header
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.substring(7)
      : null);

  if (!token) {
    return res.status(401).json({ error: 'Akses ditolak: Token tidak ditemukan.' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Akses ditolak: Token tidak valid atau kadaluarsa.' });
  }

  // Check if token has been revoked (blacklisted)
  const isBlacklisted = await prisma.tokenBlacklist.findUnique({ where: { token } });
  if (isBlacklisted) {
    return res.status(401).json({ error: 'Token has been revoked.' });
  }

  // CSRF validation for state-changing requests using cookie auth
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const csrfFromHeader = req.headers['x-csrf-token'] as string;
    const csrfFromCookie = req.cookies?.['csrf-token'];
    if (!csrfFromHeader || !csrfFromCookie || csrfFromHeader !== csrfFromCookie) {
      // Only enforce CSRF if using cookie auth (not Bearer token)
      if (req.cookies?.token && !req.headers.authorization) {
        return res.status(403).json({ error: 'Invalid CSRF token.' });
      }
    }
  }

  req.user = payload;
  next();
};

export const roleMiddleware = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Akses ditolak: Tidak memiliki izin.' });
    }
    next();
  };
};

const DENY = (res: Response) => res.status(403).json({ error: 'Akses ditolak: Tidak memiliki izin.' });

/**
 * Gate berbasis IZIN modul (RBAC dinamis). Aksi diinfer dari HTTP method:
 * GET/HEAD → view, selainnya → edit. Super-admin lolos. Dipakai di mount router
 * transaksional (index.ts) — menggantikan roleMiddleware berbasis nama role.
 */
export const requirePerm = (module: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return DENY(res);
      const action: PermAction = req.method === 'GET' || req.method === 'HEAD' ? 'view' : 'edit';
      if (await can(req.user.role, module, action)) return next();
      return DENY(res);
    } catch {
      return DENY(res);
    }
  };
};

/**
 * Gate untuk router DATA REFERENSI (master data): GET selalu lolos (data dipakai
 * banyak form), tulis (POST/PUT/PATCH/DELETE) butuh izin `edit` modul.
 */
export const requireWrite = (module: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    try {
      if (req.user && (await can(req.user.role, module, 'edit'))) return next();
      return DENY(res);
    } catch {
      return DENY(res);
    }
  };
};

/** Gate berbasis CAPABILITY (hak sensitif: cancel/decide/dll). Super-admin lolos. */
export const requireCap = (capability: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user && (await hasCap(req.user.role, capability))) return next();
      return DENY(res);
    } catch {
      return DENY(res);
    }
  };
};
