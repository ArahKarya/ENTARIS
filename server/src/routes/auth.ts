import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { generateToken } from '../utils/auth';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { loginRateLimiter } from '../middleware/rateLimiter';
import { getEffectiveForClient } from '../services/permissionService';
import { logger } from '../lib/logger';
import { resolveLanguage } from '../utils/language';
import { companyDefaultLanguage } from '../services/companyLanguage';

const router = Router();

// Optional cross-subdomain cookie support (only needed when the session must be
// shared across subdomains). Set COOKIE_DOMAIN to a parent domain (e.g. ".example.com") in production to
// share the session across subdomains. Unset → host-only cookie. Never applied
// outside production (domain attribute is not settable for plain "localhost").
const COOKIE_DOMAIN = process.env.NODE_ENV === 'production' ? (process.env.COOKIE_DOMAIN?.trim() || undefined) : undefined;


router.post('/login', loginRateLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Email dan password wajib diisi.' });
  }

  try {
    // Support login by email or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: username },
          { username: username },
        ],
      },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    const token = generateToken({ userId: user.id, role: user.role });

    // Set JWT as HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // 'strict' would drop the cookie on top-level cross-site navigations (e.g. links from Telegram/email, or across subdomains when COOKIE_DOMAIN is set)
      domain: COOKIE_DOMAIN,
      maxAge: 24 * 60 * 60 * 1000, // 24h
      path: '/',
    });

    // Set CSRF token as non-HttpOnly cookie (readable by JS)
    const csrfToken = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf-token', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      domain: COOKIE_DOMAIN,
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    const [access, companyLanguage] = await Promise.all([
      getEffectiveForClient(user.role),
      companyDefaultLanguage(),
    ]);
    return res.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        language: resolveLanguage(user.language, companyLanguage),
        languagePreference: user.language ?? null,
        isSuperAdmin: access.isSuperAdmin,
        permissions: access.permissions,
        caps: access.caps,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Login error');
    return res.status(500).json({ error: 'Login gagal.' });
  }
});

// GET /api/auth/me — return current user from cookie/token
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, username: true, fullName: true, role: true, isActive: true, language: true },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User tidak ditemukan atau tidak aktif.' });
    }
    const [access, companyLanguage] = await Promise.all([
      getEffectiveForClient(user.role),
      companyDefaultLanguage(),
    ]);
    const { language: languagePreference, ...profile } = user;
    return res.json({
      user: {
        ...profile,
        language: resolveLanguage(languagePreference, companyLanguage),
        languagePreference,
        isSuperAdmin: access.isSuperAdmin,
        permissions: access.permissions,
        caps: access.caps,
      },
    });
  } catch (error) {
    logger.error({ error }, 'GET /auth/me error');
    return res.status(500).json({ error: 'Gagal mengambil data user.' });
  }
});

// POST /api/auth/logout — clear cookies and blacklist token
router.post('/logout', authMiddleware, async (req: AuthRequest, res) => {
  const token = req.cookies?.token || req.headers.authorization?.substring(7);
  if (token) {
    try {
      const decoded = jwt.decode(token) as Record<string, unknown> | null;
      await prisma.tokenBlacklist.create({
        data: {
          token,
          userId: req.user!.userId,
          expiresAt: new Date(((decoded?.exp as number) || 0) * 1000),
        },
      });
    } catch {
      // ignore if already blacklisted
    }
  }
  res.clearCookie('token', { path: '/', domain: COOKIE_DOMAIN });
  res.clearCookie('csrf-token', { path: '/', domain: COOKIE_DOMAIN });
  return res.json({ message: 'Logged out successfully.' });
});

export default router;
