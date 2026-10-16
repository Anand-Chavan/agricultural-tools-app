import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { writeAudit } from '../lib/audit.js';
import { AppError } from '../lib/errors.js';
import { calcLine, money, qty } from '../lib/money.js';
import { prisma } from '../lib/prisma.js';
import { applyStockChange } from '../services/inventory.js';

export const purchasesRouter = Router();
export const suppliersRouter = Router();

purchasesRouter.use(requireAuth);
suppliersRouter.use(requireAuth);

const supplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

suppliersRouter.get(
  '/',
  requirePermission('purchases:read'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const items = await prisma.supplier.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
    });
    res.json({ items });
  }),
);

suppliersRouter.get(
  '/:id',
  requirePermission('purchases:read'),
  asyncHandler(async (req, res) => {
    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: {
        purchases: {
          orderBy: { purchaseDate: 'desc' },
          take: 50,
          include: { payments: true },
        },
      },
    });
    if (!supplier) throw new AppError(404, 'Supplier not found', 'NOT_FOUND');
    const balanceDue = supplier.purchases.reduce((s, p) => s + Number(p.balanceDue), 0);
    res.json({
      ...supplier,
      balanceDue,
      purchases: supplier.purchases.map((p) => ({
        ...p,
        grandTotal: Number(p.grandTotal),
        amountPaid: Number(p.amountPaid),
        balanceDue: Number(p.balanceDue),
      })),
    });
  }),
);

suppliersRouter.post(
  '/',
  requirePermission('purchases:write'),
  asyncHandler(async (req, res) => {
    const body = supplierSchema.parse(req.body);
    const item = await prisma.supplier.create({
      data: { ...body, email: body.email || null },
    });
    res.status(201).json(item);
  }),
);

suppliersRouter.put(
  '/:id',
  requirePermission('purchases:write'),
  asyncHandler(async (req, res) => {
    const body = supplierSchema.parse(req.body);
    const item = await prisma.supplier.update({
      where: { id: req.params.id },
      data: { ...body, email: body.email || null },
    });
    res.json(item);
  }),
);

const purchaseItemSchema = z.object({
  productId: z.string().min(1),
  quantityOrdered: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative(),
  discount: z.coerce.number().nonnegative().default(0),
  taxRateSnapshot: z.coerce.number().nonnegative().default(0),
});

const purchaseSchema = z.object({
  supplierId: z.string().min(1),
  supplierInvoiceNumber: z.string().optional().nullable(),
  purchaseDate: z.string().optional(),
  otherCharges: z.coerce.number().nonnegative().default(0),
  notes: z.string().optional().nullable(),
  items: z.array(purchaseItemSchema).min(1),
});

async function nextPurchaseNumber(tx: Parameters<typeof applyStockChange>[0]) {
  const count = await tx.purchase.count();
  return `PO-${String(count + 1).padStart(5, '0')}`;
}

function computePurchaseTotals(
  items: z.infer<typeof purchaseItemSchema>[],
  otherCharges: number,
) {
  let subtotal = money(0);
  let discountTotal = money(0);
  let taxTotal = money(0);
  const computed = items.map((item) => {
    const line = calcLine({
      quantity: item.quantityOrdered,
      unitPrice: item.unitCost,
      discount: item.discount,
      taxRate: item.taxRateSnapshot,
    });
    subtotal = money(subtotal.plus(line.base));
    discountTotal = money(discountTotal.plus(line.discount));
    taxTotal = money(taxTotal.plus(line.taxAmount));
    return { ...item, lineTotal: line.lineTotal };
  });
  const grandTotal = money(subtotal.plus(taxTotal).plus(otherCharges));
  return { computed, subtotal, discountTotal, taxTotal, grandTotal };
}

purchasesRouter.get(
  '/',
  requirePermission('purchases:read'),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || '');
    const items = await prisma.purchase.findMany({
      where: status ? { status: status as never } : undefined,
      include: { supplier: true, items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({
      items: items.map((p) => ({
        ...p,
        subtotal: Number(p.subtotal),
        taxTotal: Number(p.taxTotal),
        grandTotal: Number(p.grandTotal),
        amountPaid: Number(p.amountPaid),
        balanceDue: Number(p.balanceDue),
      })),
    });
  }),
);

purchasesRouter.get(
  '/:id',
  requirePermission('purchases:read'),
  asyncHandler(async (req, res) => {
    const purchase = await prisma.purchase.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: true,
        items: { include: { product: true } },
        payments: { orderBy: { paidAt: 'desc' } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!purchase) throw new AppError(404, 'Purchase not found', 'NOT_FOUND');
    res.json({
      ...purchase,
      subtotal: Number(purchase.subtotal),
      discountTotal: Number(purchase.discountTotal),
      taxTotal: Number(purchase.taxTotal),
      otherCharges: Number(purchase.otherCharges),
      grandTotal: Number(purchase.grandTotal),
      amountPaid: Number(purchase.amountPaid),
      balanceDue: Number(purchase.balanceDue),
      items: purchase.items.map((i) => ({
        ...i,
        quantityOrdered: Number(i.quantityOrdered),
        quantityReceived: Number(i.quantityReceived),
        unitCost: Number(i.unitCost),
        discount: Number(i.discount),
        taxRateSnapshot: Number(i.taxRateSnapshot),
        lineTotal: Number(i.lineTotal),
      })),
      payments: purchase.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    });
  }),
);

purchasesRouter.post(
  '/',
  requirePermission('purchases:write'),
  asyncHandler(async (req, res) => {
    const body = purchaseSchema.parse(req.body);
    const totals = computePurchaseTotals(body.items, body.otherCharges);
    const purchase = await prisma.$transaction(async (tx) => {
      const purchaseNumber = await nextPurchaseNumber(tx);
      return tx.purchase.create({
        data: {
          purchaseNumber,
          supplierId: body.supplierId,
          supplierInvoiceNumber: body.supplierInvoiceNumber || null,
          purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : new Date(),
          status: 'DRAFT',
          subtotal: totals.subtotal.toFixed(2),
          discountTotal: totals.discountTotal.toFixed(2),
          taxTotal: totals.taxTotal.toFixed(2),
          otherCharges: money(body.otherCharges).toFixed(2),
          grandTotal: totals.grandTotal.toFixed(2),
          amountPaid: '0',
          balanceDue: totals.grandTotal.toFixed(2),
          notes: body.notes || null,
          createdById: req.user!.id,
          items: {
            create: totals.computed.map((i) => ({
              productId: i.productId,
              quantityOrdered: qty(i.quantityOrdered).toFixed(3),
              quantityReceived: '0',
              unitCost: money(i.unitCost).toFixed(2),
              discount: money(i.discount).toFixed(2),
              taxRateSnapshot: i.taxRateSnapshot,
              lineTotal: i.lineTotal.toFixed(2),
            })),
          },
        },
        include: { items: true, supplier: true },
      });
    });
    res.status(201).json(purchase);
  }),
);

purchasesRouter.post(
  '/:id/receive',
  requirePermission('purchases:receive'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        items: z
          .array(
            z.object({
              purchaseItemId: z.string(),
              quantityReceived: z.coerce.number().nonnegative(),
            }),
          )
          .min(1),
        supplierInvoiceNumber: z.string().optional().nullable(),
      })
      .parse(req.body);

    const purchase = await prisma.$transaction(async (tx) => {
      const existing = await tx.purchase.findUnique({
        where: { id: req.params.id },
        include: { items: true },
      });
      if (!existing) throw new AppError(404, 'Purchase not found', 'NOT_FOUND');
      if (existing.status === 'CANCELLED') {
        throw new AppError(400, 'Cancelled purchase cannot be received', 'INVALID_STATUS');
      }

      for (const recv of body.items) {
        const item = existing.items.find((i) => i.id === recv.purchaseItemId);
        if (!item) throw new AppError(400, 'Invalid purchase item', 'INVALID_ITEM');
        const already = qty(item.quantityReceived);
        const ordered = qty(item.quantityOrdered);
        const incoming = qty(recv.quantityReceived);
        if (incoming.lte(0)) continue;
        if (already.plus(incoming).gt(ordered)) {
          throw new AppError(
            400,
            `Cannot receive more than ordered for item ${item.id}`,
            'OVER_RECEIVE',
          );
        }
        await tx.purchaseItem.update({
          where: { id: item.id },
          data: { quantityReceived: already.plus(incoming).toFixed(3) },
        });
        await applyStockChange(tx, {
          productId: item.productId,
          quantityDelta: incoming,
          movementType: 'PURCHASE_RECEIPT',
          unitCost: item.unitCost,
          referenceType: 'Purchase',
          referenceId: existing.id,
          reason: `Receive ${existing.purchaseNumber}`,
          createdById: req.user!.id,
        });
        await tx.product.update({
          where: { id: item.productId },
          data: { costPrice: money(item.unitCost).toFixed(2) },
        });
      }

      const refreshed = await tx.purchase.findUnique({
        where: { id: existing.id },
        include: { items: true },
      });
      const allReceived = refreshed!.items.every((i) =>
        qty(i.quantityReceived).gte(qty(i.quantityOrdered)),
      );
      const anyReceived = refreshed!.items.some((i) => qty(i.quantityReceived).gt(0));
      const status = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : 'DRAFT';

      const updated = await tx.purchase.update({
        where: { id: existing.id },
        data: {
          status,
          receivedAt: anyReceived ? new Date() : null,
          supplierInvoiceNumber:
            body.supplierInvoiceNumber ?? existing.supplierInvoiceNumber,
        },
        include: { items: true, supplier: true, payments: true },
      });

      await writeAudit(tx, {
        userId: req.user!.id,
        action: 'purchase.receive',
        entityType: 'Purchase',
        entityId: updated.id,
        after: { status: updated.status, purchaseNumber: updated.purchaseNumber },
      });
      return updated;
    });

    res.json(purchase);
  }),
);

purchasesRouter.post(
  '/:id/payments',
  requirePermission('purchases:pay'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        amount: z.coerce.number().positive(),
        method: z.string().min(1),
        reference: z.string().optional().nullable(),
        paidAt: z.string().optional(),
      })
      .parse(req.body);

    const payment = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id: req.params.id } });
      if (!purchase) throw new AppError(404, 'Purchase not found', 'NOT_FOUND');
      const due = money(purchase.balanceDue);
      const amount = money(body.amount);
      if (amount.gt(due)) {
        throw new AppError(400, 'Payment exceeds balance due', 'OVERPAY');
      }
      const created = await tx.supplierPayment.create({
        data: {
          purchaseId: purchase.id,
          amount: amount.toFixed(2),
          method: body.method,
          reference: body.reference || null,
          paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
          createdById: req.user!.id,
        },
      });
      const amountPaid = money(purchase.amountPaid).plus(amount);
      const balanceDue = money(purchase.grandTotal).minus(amountPaid);
      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          amountPaid: amountPaid.toFixed(2),
          balanceDue: balanceDue.toFixed(2),
        },
      });
      return created;
    });
    res.status(201).json(payment);
  }),
);
