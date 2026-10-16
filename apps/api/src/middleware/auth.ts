import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { hasPermission, type Permission } from '../lib/permissions.js';
import { prisma } from '../lib/prisma.js';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
};

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.session.userId) return next();
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      include: { role: true },
    });
    if (!user || !user.isActive) {
      req.session.userId = undefined;
      return next();
    }
    const permissions = Array.isArray(user.role.permissions)
      ? (user.role.permissions as string[])
      : [];
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
      permissions,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
  next();
}

export function requirePermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
    if (!hasPermission(req.user.permissions, perms)) {
      return next(new AppError(403, 'You do not have permission for this action', 'FORBIDDEN'));
    }
    next();
  };
}
