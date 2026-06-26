import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { verifyToken } from '../utils/auth';
import { prisma } from '../lib/prisma';
import { can, hasCap } from '../services/permissionService';
import { logger } from '../lib/logger';
import type { PermAction } from '../constants/modules';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

/**
 * Bandingkan dua string secara timing-safe. Samakan panjang dulu agar
 * crypto.timingSafeEqual tak melempar saat panjang berbeda (dan agar perbedaan
 * panjang tidak bocor lewat early-throw). Mengembalikan false bila salah satu
 * kosong/null.
 */
function safeTokenEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  // Panjang berbeda → tetap lakukan compare panjang-tetap untuk hindari throw,
  // lalu paksa false. Pakai panjang maksimum agar timingSafeEqual tak throw.
  const len = Math.max(ab.length, bb.length);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ab.copy(pa);
  bb.copy(pb);
  const equalContent = timingSafeEqual(pa, pb);
  return equalContent && ab.length === bb.length;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // ── AIRA embedded service-token (Tahap A+.0) ────────────────────────────
  // AIRA = sistem terpercaya tertanam. Bila header x-aira-service-token ADA,
  // cocokkan timing-safe ke ai_settings.service_token. Cocok → identity system
  // role Admin (super-admin FULL), LEWATI JWT/blacklist/CSRF. Salah → 401 tegas
  // (tak fallback ke JWT). Tak ada header → jalur JWT user biasa apa adanya.
  const serviceTokenHeader = req.headers['x-aira-service-token'] as string | undefined;
  if (serviceTokenHeader !== undefined) {
    const setting = await prisma.aiSetting.findFirst();
    const stored = setting?.serviceToken ?? null;
    if (stored && safeTokenEqual(serviceTokenHeader, stored)) {
      req.user = { userId: 'aira-system', role: 'Admin' };
      logger.info({ by: 'aira-system' }, 'service-token auth');
      return next();
    }
    return res.status(401).json({ error: 'invalid service token' });
  }

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
