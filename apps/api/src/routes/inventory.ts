import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { writeAudit } from '../lib/audit.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { qty } from '../lib/money.js';
import { applyStockChange } from '../services/inventory.js';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

inventoryRouter.get(
  '/balances',
  requirePermission('inventory:read'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const lowStock = String(req.query.lowStock || '') === 'true';
    const balances = await prisma.stockBalance.findMany({
      include: {
        product: { include: { category: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } } },
      },
      orderBy: { product: { name: 'asc' } },
    });
    let items = balances.map((b) => ({
      id: b.id,
      productId: b.productId,
      sku: b.product.sku,
      name: b.product.name,
      category: b.product.category.name,
      unit: b.product.unit,
      quantityOnHand: Number(b.quantityOnHand),
      reorderLevel: Number(b.product.reorderLevel),
      isLowStock: Number(b.quantityOnHand) <= Number(b.product.reorderLevel),
      image: b.product.images[0] || null,
      isActive: b.product.isActive,
    }));
    if (q) {
      const qq = q.toLowerCase();
      items = items.filter(
        (i) => i.name.toLowerCase().includes(qq) || i.sku.toLowerCase().includes(qq),
      );
    }
    if (lowStock) items = items.filter((i) => i.isLowStock && i.isActive);
    res.json({ items });
  }),
);

inventoryRouter.get(
  '/movements',
  requirePermission('inventory:read'),
  asyncHandler(async (req, res) => {
    const productId = String(req.query.productId || '');
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 50)));
    const where = productId ? { productId } : {};
    const [total, rows] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json({
      items: rows.map((m) => ({
        ...m,
        quantityDelta: Number(m.quantityDelta),
        unitCost: m.unitCost == null ? null : Number(m.unitCost),
      })),
      total,
      page,
      pageSize,
    });
  }),
);

inventoryRouter.post(
  '/adjustments',
  requirePermission('inventory:adjust'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        productId: z.string().min(1),
        quantityDelta: z.coerce.number().refine((n) => n !== 0),
        reason: z.string().min(3),
        unitCost: z.coerce.number().nonnegative().optional(),
        movementType: z
          .enum(['OPENING', 'DAMAGE_WRITE_OFF', 'MANUAL_ADJUSTMENT'])
          .default('MANUAL_ADJUSTMENT'),
      })
      .parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const movement = await applyStockChange(tx, {
        productId: body.productId,
        quantityDelta: body.quantityDelta,
        movementType: body.movementType,
        unitCost: body.unitCost,
        referenceType: 'adjustment',
        reason: body.reason,
        createdById: req.user!.id,
      });
      await writeAudit(tx, {
        userId: req.user!.id,
        action: 'inventory.adjust',
        entityType: 'StockMovement',
        entityId: movement.id,
        after: {
          productId: body.productId,
          quantityDelta: qty(body.quantityDelta).toNumber(),
          reason: body.reason,
          movementType: body.movementType,
        },
      });
      return movement;
    });

    res.status(201).json(result);
  }),
);

inventoryRouter.post(
  '/opening',
  requirePermission('inventory:adjust'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
        unitCost: z.coerce.number().nonnegative().optional(),
        reason: z.string().min(3).default('Opening stock'),
      })
      .parse(req.body);

    const existing = await prisma.stockMovement.findFirst({
      where: { productId: body.productId, movementType: 'OPENING' },
    });
    if (existing) {
      throw new AppError(
        409,
        'Opening stock already recorded for this product; use a manual adjustment',
        'OPENING_EXISTS',
      );
    }

    const movement = await prisma.$transaction(async (tx) =>
      applyStockChange(tx, {
        productId: body.productId,
        quantityDelta: body.quantity,
        movementType: 'OPENING',
        unitCost: body.unitCost,
        referenceType: 'opening',
        reason: body.reason,
        createdById: req.user!.id,
      }),
    );
    res.status(201).json(movement);
  }),
);
