import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { writeAudit } from '../lib/audit.js';
import { money, qty } from '../lib/money.js';

export const productsRouter = Router();
export const categoriesRouter = Router();

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads', 'products');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 5_242_880) },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new AppError(400, 'Only JPEG, PNG, or WebP images are allowed', 'INVALID_FILE'));
    }
    cb(null, true);
  },
});

const productSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  categoryId: z.string().min(1),
  productType: z.enum(['MANUFACTURED', 'RESOLD']).default('MANUFACTURED'),
  description: z.string().optional().nullable(),
  unit: z.string().min(1).default('pcs'),
  costPrice: z.coerce.number().nonnegative(),
  sellingPrice: z.coerce.number().nonnegative(),
  taxRateId: z.string().optional().nullable(),
  reorderLevel: z.coerce.number().nonnegative().default(0),
  barcode: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  dimensions: z.string().optional().nullable(),
  weight: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

productsRouter.use(requireAuth);

productsRouter.get(
  '/',
  requirePermission('products:read'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const categoryId = String(req.query.categoryId || '');
    const status = String(req.query.status || 'active');
    const lowStock = String(req.query.lowStock || '') === 'true';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));

    const where: Record<string, unknown> = {};
    if (status === 'active') where.isActive = true;
    if (status === 'archived') where.isActive = false;
    if (categoryId) where.categoryId = categoryId;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: {
          category: true,
          taxRate: true,
          images: { orderBy: { sortOrder: 'asc' } },
          stockBalances: true,
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    let items = rows.map((p) => {
      const onHand = p.stockBalances.reduce((s, b) => s + Number(b.quantityOnHand), 0);
      return {
        ...p,
        costPrice: Number(p.costPrice),
        sellingPrice: Number(p.sellingPrice),
        reorderLevel: Number(p.reorderLevel),
        quantityOnHand: onHand,
        isLowStock: onHand <= Number(p.reorderLevel),
      };
    });
    if (lowStock) items = items.filter((p) => p.isLowStock);

    // Hide cost from sales role without products:cost
    const payload = !req.user?.permissions.includes('products:cost')
      ? items.map(({ costPrice: _c, ...rest }) => rest)
      : items;

    res.json({ items: payload, total, page, pageSize });
  }),
);

productsRouter.get(
  '/:id',
  requirePermission('products:read'),
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        taxRate: true,
        images: { orderBy: { sortOrder: 'asc' } },
        stockBalances: true,
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { createdBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!product) throw new AppError(404, 'Product not found', 'NOT_FOUND');
    const onHand = product.stockBalances.reduce((s, b) => s + Number(b.quantityOnHand), 0);
    const payload: Record<string, unknown> = {
      ...product,
      costPrice: Number(product.costPrice),
      sellingPrice: Number(product.sellingPrice),
      reorderLevel: Number(product.reorderLevel),
      quantityOnHand: onHand,
      movements: product.movements.map((m) => ({
        ...m,
        quantityDelta: Number(m.quantityDelta),
        unitCost: m.unitCost == null ? null : Number(m.unitCost),
      })),
    };
    if (!req.user?.permissions.includes('products:cost')) {
      delete payload.costPrice;
      payload.movements = (payload.movements as Array<Record<string, unknown>>).map((m) => {
        const { unitCost: _u, ...rest } = m;
        return rest;
      });
    }
    res.json(payload);
  }),
);

productsRouter.post(
  '/',
  requirePermission('products:write'),
  asyncHandler(async (req, res) => {
    const body = productSchema.parse(req.body);
    if (!req.user?.permissions.includes('products:cost') && body.costPrice !== 0) {
      // Sales shouldn't set cost; force from existing or zero for create denied
      throw new AppError(403, 'Cannot set cost price', 'FORBIDDEN');
    }
    const existing = await prisma.product.findUnique({ where: { sku: body.sku } });
    if (existing) throw new AppError(409, 'SKU already exists', 'DUPLICATE_SKU');

    const product = await prisma.product.create({
      data: {
        ...body,
        costPrice: money(body.costPrice).toFixed(2),
        sellingPrice: money(body.sellingPrice).toFixed(2),
        reorderLevel: qty(body.reorderLevel).toFixed(3),
        taxRateId: body.taxRateId || null,
      },
      include: { category: true, images: true, stockBalances: true },
    });
    await prisma.stockBalance.create({
      data: { productId: product.id, locationId: null, quantityOnHand: 0 },
    });
    await writeAudit(prisma, {
      userId: req.user!.id,
      action: 'product.create',
      entityType: 'Product',
      entityId: product.id,
      after: { sku: product.sku, name: product.name },
    });
    res.status(201).json(product);
  }),
);

productsRouter.put(
  '/:id',
  requirePermission('products:write'),
  asyncHandler(async (req, res) => {
    const body = productSchema.parse(req.body);
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Product not found', 'NOT_FOUND');

    const canCost = req.user!.permissions.includes('products:cost');
    const data = {
      ...body,
      costPrice: canCost
        ? money(body.costPrice).toFixed(2)
        : existing.costPrice,
      sellingPrice: money(body.sellingPrice).toFixed(2),
      reorderLevel: qty(body.reorderLevel).toFixed(3),
      taxRateId: body.taxRateId || null,
    };

    const skuClash = await prisma.product.findFirst({
      where: { sku: body.sku, NOT: { id: existing.id } },
    });
    if (skuClash) throw new AppError(409, 'SKU already exists', 'DUPLICATE_SKU');

    const product = await prisma.product.update({
      where: { id: existing.id },
      data,
      include: { category: true, images: true, stockBalances: true },
    });

    if (canCost && Number(existing.costPrice) !== Number(body.costPrice)) {
      await writeAudit(prisma, {
        userId: req.user!.id,
        action: 'product.price_change',
        entityType: 'Product',
        entityId: product.id,
        before: { costPrice: Number(existing.costPrice), sellingPrice: Number(existing.sellingPrice) },
        after: { costPrice: Number(product.costPrice), sellingPrice: Number(product.sellingPrice) },
      });
    }
    res.json(product);
  }),
);

productsRouter.post(
  '/:id/archive',
  requirePermission('products:write'),
  asyncHandler(async (req, res) => {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    await writeAudit(prisma, {
      userId: req.user!.id,
      action: 'product.archive',
      entityType: 'Product',
      entityId: product.id,
    });
    res.json(product);
  }),
);

productsRouter.post(
  '/:id/images',
  requirePermission('products:write'),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError(400, 'Image file is required', 'MISSING_FILE');
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw new AppError(404, 'Product not found', 'NOT_FOUND');
    const count = await prisma.productImage.count({ where: { productId: product.id } });
    const image = await prisma.productImage.create({
      data: {
        productId: product.id,
        storageKey: `products/${req.file.filename}`,
        altText: String(req.body.altText || product.name),
        sortOrder: count,
      },
    });
    res.status(201).json(image);
  }),
);

categoriesRouter.use(requireAuth);

categoriesRouter.get(
  '/',
  requirePermission('products:read'),
  asyncHandler(async (_req, res) => {
    const items = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    res.json({ items });
  }),
);

categoriesRouter.post(
  '/',
  requirePermission('products:write'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({ name: z.string().min(1), description: z.string().optional() })
      .parse(req.body);
    const item = await prisma.category.create({ data: body });
    res.status(201).json(item);
  }),
);
