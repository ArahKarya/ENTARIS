import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { can, hasCap } from '../services/permissionService';
import type { PermAction } from '../constants/modules';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
    /** 'mcp' bila panggilan berasal dari layer MCP (JWT internal); dicatat auditTrail. */
    via?: 'mcp';
    mcpToken?: string;
    mcpChannel?: string;
    mcpTool?: string;
    mcpApprovalId?: string;
    mcpRef?: string;
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
 * Module permission gate: GET/HEAD need view, other methods need edit. Super-admin always passes.
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

/** Lolos bila punya izin modul mana pun dari daftar (GET→view, selainnya→edit). */
export const requireAnyPerm = (modules: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) return DENY(res);
      const action: PermAction = req.method === 'GET' || req.method === 'HEAD' ? 'view' : 'edit';
      for (const m of modules) {
        if (await can(req.user.role, m, action)) return next();
      }
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
