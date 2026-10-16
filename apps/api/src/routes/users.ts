import bcrypt from 'bcrypt';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { writeAudit } from '../lib/audit.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export const usersRouter = Router();
export const rolesRouter = Router();
export const auditRouter = Router();

usersRouter.use(requireAuth);
rolesRouter.use(requireAuth);
auditRouter.use(requireAuth);

usersRouter.get(
  '/',
  requirePermission('users:manage'),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      include: { role: true },
      orderBy: { name: 'asc' },
    });
    res.json({
      items: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role.name,
        roleId: u.roleId,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      })),
    });
  }),
);

usersRouter.post(
  '/',
  requirePermission('users:manage'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        roleId: z.string().min(1),
      })
      .parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (exists) throw new AppError(409, 'Email already in use', 'DUPLICATE_EMAIL');
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash,
        roleId: body.roleId,
      },
      include: { role: true },
    });
    await writeAudit(prisma, {
      userId: req.user!.id,
      action: 'user.create',
      entityType: 'User',
      entityId: user.id,
      after: { email: user.email, role: user.role.name },
    });
    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
      isActive: user.isActive,
    });
  }),
);

usersRouter.patch(
  '/:id',
  requirePermission('users:manage'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        roleId: z.string().optional(),
        isActive: z.boolean().optional(),
        password: z.string().min(8).optional(),
        name: z.string().min(1).optional(),
      })
      .parse(req.body);
    const before = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: true },
    });
    if (!before) throw new AppError(404, 'User not found', 'NOT_FOUND');
    const data: Record<string, unknown> = {};
    if (body.roleId) data.roleId = body.roleId;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.name) data.name = body.name;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.update({
      where: { id: before.id },
      data,
      include: { role: true },
    });
    await writeAudit(prisma, {
      userId: req.user!.id,
      action: 'user.update',
      entityType: 'User',
      entityId: user.id,
      before: { role: before.role.name, isActive: before.isActive },
      after: { role: user.role.name, isActive: user.isActive },
    });
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
      isActive: user.isActive,
    });
  }),
);

rolesRouter.get(
  '/',
  requirePermission('users:manage'),
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
    res.json({
      items: roles.map((r) => ({
        id: r.id,
        name: r.name,
        permissions: r.permissions,
      })),
    });
  }),
);

auditRouter.get(
  '/',
  requirePermission('audit:read'),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 50)));
    const [total, items] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.findMany({
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json({ items, total, page, pageSize });
  }),
);
