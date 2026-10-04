import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { requirePerm, AuthRequest } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreateUserSchema, UpdateUserSchema, ChangePasswordSchema } from '../utils/schemas';
import { handleRouteError } from '../utils/errors';
import { randomBytes } from 'crypto';
import { getBotUsername, sendTestToChat } from '../services/telegramService';
import { logger } from '../lib/logger';
import { parseListPaging } from '../utils/listQuery';
import { buildUserOrderBy, buildUserWhere, summarizeUsers } from '../services/userList';

const router = Router();

// GET /api/users — list users (Admin only).
// Legacy contract kept: ?page&limit(default 50, max 200)&search → { data, total, page, limit }.
// New optional params: role, status (active|inactive), sort (see services/userList).
router.get('/', requirePerm('users'), async (req, res) => {
  try {
    const built = buildUserWhere(req.query);
    if (!built.ok) return res.status(400).json({ error: built.error });
    const { page, limit: take, skip } = parseListPaging(req.query, { defaultLimit: 50, maxLimit: 200 });

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: built.where,
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          telegramChatId: true,
        },
        orderBy: buildUserOrderBy(req.query.sort),
        skip,
        take,
      }),
      prisma.user.count({ where: built.where }),
    ]);

    // Jangan bocorkan chatId mentah — hanya status tertaut.
    const data = users.map(({ telegramChatId, ...u }) => ({ ...u, telegramLinked: !!telegramChatId }));
    return res.json({ data, total, page, limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /users', 'Gagal mengambil data user.');
  }
});

// GET /api/users/summary — KPI counts with the same filters as the list (Admin only)
router.get('/summary', requirePerm('users'), async (req, res) => {
  try {
    const built = buildUserWhere(req.query);
    if (!built.ok) return res.status(400).json({ error: built.error });
    const rows = await prisma.user.findMany({
      where: built.where,
      select: { isActive: true, telegramChatId: true },
    });
    return res.json(summarizeUsers(rows));
  } catch (error) {
    return handleRouteError(res, error, 'GET /users/summary', 'Gagal mengambil ringkasan user.');
  }
});

// POST /api/users — create new user (Admin only)
router.post('/', requirePerm('users'), async (req, res) => {
  const body = validateBody(CreateUserSchema, req.body, res);
  if (!body) return;

  try {
    // Validasi role harus ada (RBAC dinamis).
    const roleExists = await prisma.role.findUnique({ where: { key: body.role } });
    if (!roleExists) {
      return res.status(400).json({ error: 'Role tidak valid.' });
    }

    // Check unique username
    const existingUsername = await prisma.user.findUnique({ where: { username: body.username } });
    if (existingUsername) {
      return res.status(400).json({ error: 'Username sudah digunakan.' });
    }

    // Check unique email
    const existingEmail = await prisma.user.findUnique({ where: { email: body.email } });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email sudah digunakan.' });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.create({
      data: {
        username: body.username,
        email: body.email,
        fullName: body.fullName,
        passwordHash,
        role: body.role as any,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return res.status(201).json(user);
  } catch (error) {
    return handleRouteError(res, error, 'POST /users', 'Gagal membuat user.');
  }
});

// PUT /api/users/me/password — change own password (any authenticated user)
router.put('/me/password', async (req: AuthRequest, res) => {
  const body = validateBody(ChangePasswordSchema, req.body, res);
  if (!body) return;

  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User tidak ditemukan.' });
    }

    const isValid = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Password saat ini salah.' });
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Blacklist current token so old sessions are invalidated
    const currentToken = req.cookies?.token || req.headers.authorization?.substring(7);
    if (currentToken) {
      const decoded = jwt.decode(currentToken) as Record<string, unknown> | null;
      await prisma.tokenBlacklist.upsert({
        where: { token: currentToken },
        create: {
          token: currentToken,
          userId,
          expiresAt: new Date(((decoded?.exp as number) || 0) * 1000),
        },
        update: {},
      });
    }

    return res.json({ message: 'Password berhasil diubah.' });
  } catch (error) {
    return handleRouteError(res, error, 'PUT /users/me/password', 'Gagal mengubah password.');
  }
});

// PUT /api/users/:id — update user (Admin only)
router.put('/:id', requirePerm('users'), async (req, res) => {
  const id = req.params.id as string;
  const body = validateBody(UpdateUserSchema, req.body, res);
  if (!body) return;

  try {
    // Validasi role bila diubah (RBAC dinamis).
    if (body.role !== undefined) {
      const roleExists = await prisma.role.findUnique({ where: { key: body.role } });
      if (!roleExists) {
        return res.status(400).json({ error: 'Role tidak valid.' });
      }
    }

    // Check unique username if changing
    if (body.username) {
      const existing = await prisma.user.findFirst({
        where: { username: body.username, NOT: { id } },
      });
      if (existing) {
        return res.status(400).json({ error: 'Username sudah digunakan.' });
      }
    }

    // Check unique email if changing
    if (body.email) {
      const existing = await prisma.user.findFirst({
        where: { email: body.email, NOT: { id } },
      });
      if (existing) {
        return res.status(400).json({ error: 'Email sudah digunakan.' });
      }
    }

    const updateData: any = {};
    if (body.username !== undefined) updateData.username = body.username;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.fullName !== undefined) updateData.fullName = body.fullName;
    if (body.role !== undefined) updateData.role = body.role;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.password) {
      updateData.passwordHash = await bcrypt.hash(body.password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    return res.json(user);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'User tidak ditemukan.' });
    return handleRouteError(res, error, 'PUT /users/:id', 'Gagal mengupdate user.');
  }
});

// PATCH /api/users/:id/toggle — toggle isActive (Admin only)
router.patch('/:id/toggle', requirePerm('users'), async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  try {
    // Prevent admin from deactivating themselves
    if (req.user?.userId === id) {
      return res.status(400).json({ error: 'Tidak dapat menonaktifkan akun sendiri.' });
    }

    const current = await prisma.user.findUnique({ where: { id }, select: { isActive: true } });
    if (!current) {
      return res.status(404).json({ error: 'User tidak ditemukan.' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isActive: !current.isActive },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    return res.json(user);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /users/:id/toggle', 'Gagal mengubah status user.');
  }
});

// POST /api/users/:id/telegram-link — generate kode tautan + deep link (Admin)
router.post('/:id/telegram-link', requirePerm('users'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
    // kode acak 6 char (huruf/angka tanpa ambigu)
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = randomBytes(6);
    for (let i = 0; i < 6; i++) code += alphabet[bytes[i]! % alphabet.length];
    await prisma.user.update({ where: { id }, data: { telegramLinkCode: code, telegramChatId: null } });
    const botUsername = await getBotUsername();
    const deepLink = botUsername ? `https://t.me/${botUsername}?start=${code}` : null;
    return res.json({ code, botUsername, deepLink });
  } catch (error) {
    return handleRouteError(res, error, 'POST /users/:id/telegram-link', 'Gagal membuat kode tautan Telegram.');
  }
});

// POST /api/users/:id/telegram-test — kirim japri uji ke user (Admin)
router.post('/:id/telegram-test', requirePerm('users'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const user = await prisma.user.findUnique({ where: { id }, select: { telegramChatId: true, fullName: true } });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
    if (!user.telegramChatId) {
      return res.status(400).json({ error: 'User belum menautkan Telegram.' });
    }
    const result = await sendTestToChat(user.telegramChatId);
    if (!result.ok) return res.status(400).json({ error: `Gagal kirim: ${result.error}` });
    return res.json({ message: `Pesan uji terkirim ke Telegram ${user.fullName}.` });
  } catch (error) {
    return handleRouteError(res, error, 'POST /users/:id/telegram-test', 'Gagal mengirim pesan uji.');
  }
});

// DELETE /api/users/:id/telegram — putuskan tautan (Admin)
router.delete('/:id/telegram', requirePerm('users'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    await prisma.user.update({ where: { id }, data: { telegramChatId: null, telegramLinkCode: null } });
    return res.json({ message: 'Tautan Telegram diputus.' });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /users/:id/telegram', 'Gagal memutus tautan Telegram.');
  }
});

export default router;
