import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { writeAudit } from '../lib/audit.js';
import { AppError } from '../lib/errors.js';
import { calcLine, money, qty } from '../lib/money.js';
import { prisma } from '../lib/prisma.js';
import { applyStockChange, getAvailableQty } from '../services/inventory.js';

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

const lineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative().optional(),
  discount: z.coerce.number().nonnegative().default(0),
});

const invoiceSchema = z.object({
  customerId: z.string().optional().nullable(),
  walkInName: z.string().optional().nullable(),
  invoiceDate: z.string().optional(),
  notes: z.string().optional().nullable(),
  items: z.array(lineSchema).min(1),
  payment: z
    .object({
      amount: z.coerce.number().nonnegative(),
      method: z.string().min(1),
      reference: z.string().optional().nullable(),
    })
    .optional(),
});

async function allocateInvoiceNumber(tx: Parameters<typeof applyStockChange>[0]) {
  const seq = await tx.invoiceSequence.upsert({
    where: { id: 'default' },
    create: { id: 'default', prefix: 'INV', nextNumber: 1 },
    update: {},
  });
  const number = `${seq.prefix}-${String(seq.nextNumber).padStart(5, '0')}`;
  await tx.invoiceSequence.update({
    where: { id: 'default' },
    data: { nextNumber: seq.nextNumber + 1 },
  });
  return number;
}

function refreshInvoiceStatus(amountPaid: ReturnType<typeof money>, grandTotal: ReturnType<typeof money>) {
  if (amountPaid.lte(0)) return 'UNPAID' as const;
  if (amountPaid.gte(grandTotal)) return 'PAID' as const;
  return 'PARTIALLY_PAID' as const;
}

invoicesRouter.get(
  '/',
  requirePermission('sales:read'),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || '');
    const q = String(req.query.q || '').trim();
    const items = await prisma.invoice.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(q
          ? {
              OR: [
                { invoiceNumber: { contains: q, mode: 'insensitive' } },
                { walkInName: { contains: q, mode: 'insensitive' } },
                { customer: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: { customer: true, items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({
      items: items.map((i) => ({
        ...i,
        subtotal: Number(i.subtotal),
        taxTotal: Number(i.taxTotal),
        grandTotal: Number(i.grandTotal),
        amountPaid: Number(i.amountPaid),
        balanceDue: Number(i.balanceDue),
      })),
    });
  }),
);

invoicesRouter.get(
  '/:id',
  requirePermission('sales:read'),
  asyncHandler(async (req, res) => {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        items: { include: { product: { include: { images: { take: 1 } } } } },
        payments: { orderBy: { paidAt: 'desc' }, include: { createdBy: { select: { name: true } } } },
        returns: { include: { items: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!invoice) throw new AppError(404, 'Invoice not found', 'NOT_FOUND');
    res.json({
      ...invoice,
      subtotal: Number(invoice.subtotal),
      discountTotal: Number(invoice.discountTotal),
      taxTotal: Number(invoice.taxTotal),
      grandTotal: Number(invoice.grandTotal),
      amountPaid: Number(invoice.amountPaid),
      balanceDue: Number(invoice.balanceDue),
      items: invoice.items.map((i) => ({
        ...i,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        unitCostSnapshot: i.unitCostSnapshot == null ? null : Number(i.unitCostSnapshot),
        discount: Number(i.discount),
        taxRateSnapshot: Number(i.taxRateSnapshot),
        taxAmount: Number(i.taxAmount),
        lineTotal: Number(i.lineTotal),
      })),
      payments: invoice.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    });
  }),
);

invoicesRouter.post(
  '/',
  requirePermission('sales:write'),
  asyncHandler(async (req, res) => {
    const body = invoiceSchema.parse(req.body);
    if (!body.customerId && !body.walkInName) {
      throw new AppError(400, 'Select a customer or enter a walk-in name', 'CUSTOMER_REQUIRED');
    }

    const products = await prisma.product.findMany({
      where: { id: { in: body.items.map((i) => i.productId) }, isActive: true },
      include: { taxRate: true },
    });
    if (products.length !== body.items.length) {
      throw new AppError(400, 'One or more products are invalid or inactive', 'INVALID_PRODUCT');
    }
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = money(0);
    let discountTotal = money(0);
    let taxTotal = money(0);
    const lines = body.items.map((item) => {
      const product = byId.get(item.productId)!;
      const unitPrice = money(item.unitPrice ?? product.sellingPrice);
      const line = calcLine({
        quantity: item.quantity,
        unitPrice,
        discount: item.discount,
        taxRate: product.taxRate?.rate ?? 0,
      });
      subtotal = money(subtotal.plus(line.base));
      discountTotal = money(discountTotal.plus(line.discount));
      taxTotal = money(taxTotal.plus(line.taxAmount));
      return {
        product,
        ...line,
        skuSnapshot: product.sku,
        productNameSnapshot: product.name,
        unitCostSnapshot: product.costPrice,
      };
    });
    const grandTotal = money(subtotal.plus(taxTotal));

    const invoice = await prisma.invoice.create({
      data: {
        customerId: body.customerId || null,
        walkInName: body.walkInName || null,
        status: 'DRAFT',
        invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : new Date(),
        subtotal: subtotal.toFixed(2),
        discountTotal: discountTotal.toFixed(2),
        taxTotal: taxTotal.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
        amountPaid: '0',
        balanceDue: grandTotal.toFixed(2),
        notes: body.notes || null,
        createdById: req.user!.id,
        items: {
          create: lines.map((l) => ({
            productId: l.product.id,
            skuSnapshot: l.skuSnapshot,
            productNameSnapshot: l.productNameSnapshot,
            quantity: l.quantity.toFixed(3),
            unitPrice: l.unitPrice.toFixed(2),
            unitCostSnapshot: money(l.unitCostSnapshot).toFixed(2),
            discount: l.discount.toFixed(2),
            taxRateSnapshot: l.taxRate.toFixed(4),
            taxAmount: l.taxAmount.toFixed(2),
            lineTotal: l.lineTotal.toFixed(2),
          })),
        },
      },
      include: { items: true, customer: true },
    });
    res.status(201).json(invoice);
  }),
);

invoicesRouter.post(
  '/:id/issue',
  requirePermission('sales:issue'),
  asyncHandler(async (req, res) => {
    const paymentBody = z
      .object({
        amount: z.coerce.number().nonnegative().optional(),
        method: z.string().optional(),
        reference: z.string().optional().nullable(),
      })
      .parse(req.body ?? {});

    const invoice = await prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findUnique({
        where: { id: req.params.id },
        include: { items: true },
      });
      if (!existing) throw new AppError(404, 'Invoice not found', 'NOT_FOUND');
      if (existing.status !== 'DRAFT') {
        throw new AppError(400, 'Only draft invoices can be issued', 'INVALID_STATUS');
      }

      for (const item of existing.items) {
        const available = await getAvailableQty(tx, item.productId);
        if (available.lt(qty(item.quantity))) {
          throw new AppError(
            400,
            `Insufficient stock for ${item.productNameSnapshot} (available ${available.toFixed(3)})`,
            'INSUFFICIENT_STOCK',
          );
        }
      }

      const invoiceNumber = await allocateInvoiceNumber(tx);

      for (const item of existing.items) {
        await applyStockChange(tx, {
          productId: item.productId,
          quantityDelta: qty(item.quantity).neg(),
          movementType: 'SALE',
          unitCost: item.unitCostSnapshot,
          referenceType: 'Invoice',
          referenceId: existing.id,
          reason: `Sale ${invoiceNumber}`,
          createdById: req.user!.id,
        });
      }

      let amountPaid = money(0);
      const payAmount = money(paymentBody.amount ?? 0);
      const payMethod = String(paymentBody.method ?? 'CASH');
      if (payAmount.gt(0)) {
        if (payAmount.gt(money(existing.grandTotal))) {
          throw new AppError(400, 'Payment exceeds invoice total', 'OVERPAY');
        }
        amountPaid = payAmount;
        await tx.customerPayment.create({
          data: {
            invoiceId: existing.id,
            amount: payAmount.toFixed(2),
            method: payMethod,
            reference: paymentBody.reference ?? null,
            createdById: req.user!.id,
          },
        });
      }

      const balanceDue = money(existing.grandTotal).minus(amountPaid);
      const status = refreshInvoiceStatus(amountPaid, money(existing.grandTotal));

      const updated = await tx.invoice.update({
        where: { id: existing.id },
        data: {
          invoiceNumber,
          status,
          issuedAt: new Date(),
          amountPaid: amountPaid.toFixed(2),
          balanceDue: balanceDue.toFixed(2),
        },
        include: {
          items: true,
          customer: true,
          payments: true,
        },
      });

      await writeAudit(tx, {
        userId: req.user!.id,
        action: 'invoice.issue',
        entityType: 'Invoice',
        entityId: updated.id,
        after: {
          invoiceNumber: updated.invoiceNumber,
          grandTotal: Number(updated.grandTotal),
          status: updated.status,
        },
      });
      return updated;
    });

    res.json(invoice);
  }),
);

invoicesRouter.post(
  '/:id/payments',
  requirePermission('sales:pay'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        amount: z.coerce.number().positive(),
        method: z.string().min(1),
        reference: z.string().optional().nullable(),
        paidAt: z.string().optional(),
      })
      .parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: req.params.id } });
      if (!invoice) throw new AppError(404, 'Invoice not found', 'NOT_FOUND');
      if (['DRAFT', 'VOIDED'].includes(invoice.status)) {
        throw new AppError(400, 'Cannot pay this invoice status', 'INVALID_STATUS');
      }
      const amount = money(body.amount);
      if (amount.gt(money(invoice.balanceDue))) {
        throw new AppError(400, 'Payment exceeds balance due', 'OVERPAY');
      }
      const payment = await tx.customerPayment.create({
        data: {
          invoiceId: invoice.id,
          amount: amount.toFixed(2),
          method: body.method,
          reference: body.reference || null,
          paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
          createdById: req.user!.id,
        },
      });
      const amountPaid = money(invoice.amountPaid).plus(amount);
      const balanceDue = money(invoice.grandTotal).minus(amountPaid);
      const status = refreshInvoiceStatus(amountPaid, money(invoice.grandTotal));
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: amountPaid.toFixed(2),
          balanceDue: balanceDue.toFixed(2),
          status,
        },
      });
      await writeAudit(tx, {
        userId: req.user!.id,
        action: 'invoice.payment',
        entityType: 'Invoice',
        entityId: invoice.id,
        after: { amount: amount.toNumber(), method: body.method },
      });
      return payment;
    });
    res.status(201).json(result);
  }),
);

invoicesRouter.post(
  '/:id/void',
  requirePermission('sales:void'),
  asyncHandler(async (req, res) => {
    const body = z.object({ reason: z.string().min(3) }).parse(req.body);
    const invoice = await prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findUnique({
        where: { id: req.params.id },
        include: { items: true },
      });
      if (!existing) throw new AppError(404, 'Invoice not found', 'NOT_FOUND');
      if (existing.status === 'DRAFT') {
        throw new AppError(400, 'Delete or discard draft instead of voiding', 'INVALID_STATUS');
      }
      if (existing.status === 'VOIDED') {
        throw new AppError(400, 'Invoice already voided', 'ALREADY_VOIDED');
      }
      for (const item of existing.items) {
        await applyStockChange(tx, {
          productId: item.productId,
          quantityDelta: item.quantity,
          movementType: 'CUSTOMER_RETURN',
          unitCost: item.unitCostSnapshot,
          referenceType: 'InvoiceVoid',
          referenceId: existing.id,
          reason: body.reason,
          createdById: req.user!.id,
        });
      }
      const updated = await tx.invoice.update({
        where: { id: existing.id },
        data: {
          status: 'VOIDED',
          amountPaid: '0',
          balanceDue: '0',
          notes: `${existing.notes || ''}\nVOID: ${body.reason}`.trim(),
        },
        include: { items: true, customer: true },
      });
      await writeAudit(tx, {
        userId: req.user!.id,
        action: 'invoice.void',
        entityType: 'Invoice',
        entityId: updated.id,
        after: { reason: body.reason },
      });
      return updated;
    });
    res.json(invoice);
  }),
);

invoicesRouter.post(
  '/:id/returns',
  requirePermission('sales:return'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        reason: z.string().min(3),
        restock: z.boolean().default(true),
        items: z
          .array(
            z.object({
              invoiceItemId: z.string(),
              quantity: z.coerce.number().positive(),
            }),
          )
          .min(1),
      })
      .parse(req.body);

    const saleReturn = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: req.params.id },
        include: { items: true, returns: { include: { items: true } } },
      });
      if (!invoice) throw new AppError(404, 'Invoice not found', 'NOT_FOUND');
      if (!['ISSUED', 'PAID', 'PARTIALLY_PAID', 'UNPAID', 'REFUNDED'].includes(invoice.status)) {
        throw new AppError(400, 'Invoice cannot accept returns', 'INVALID_STATUS');
      }

      const previouslyReturned = new Map<string, ReturnType<typeof qty>>();
      for (const r of invoice.returns) {
        for (const ri of r.items) {
          const key = ri.invoiceItemId || ri.productId;
          previouslyReturned.set(
            key,
            qty(previouslyReturned.get(key) || 0).plus(ri.quantity),
          );
        }
      }

      let subtotal = money(0);
      let taxTotal = money(0);
      const createItems = [];

      for (const row of body.items) {
        const item = invoice.items.find((i) => i.id === row.invoiceItemId);
        if (!item) throw new AppError(400, 'Invalid invoice item', 'INVALID_ITEM');
        const already = previouslyReturned.get(item.id) || qty(0);
        const returning = qty(row.quantity);
        if (already.plus(returning).gt(qty(item.quantity))) {
          throw new AppError(400, `Return qty exceeds sold qty for ${item.productNameSnapshot}`, 'OVER_RETURN');
        }
        const ratio = returning.div(qty(item.quantity));
        const lineTax = money(money(item.taxAmount).mul(ratio));
        const lineTotal = money(money(item.lineTotal).mul(ratio));
        const lineSub = money(lineTotal.minus(lineTax));
        subtotal = money(subtotal.plus(lineSub));
        taxTotal = money(taxTotal.plus(lineTax));
        createItems.push({
          productId: item.productId,
          invoiceItemId: item.id,
          quantity: returning.toFixed(3),
          unitPrice: money(item.unitPrice).toFixed(2),
          taxAmount: lineTax.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
          unitCostSnapshot: item.unitCostSnapshot,
        });
      }

      const count = await tx.saleReturn.count();
      const returnNumber = `CN-${String(count + 1).padStart(5, '0')}`;
      const total = money(subtotal.plus(taxTotal));

      const created = await tx.saleReturn.create({
        data: {
          returnNumber,
          invoiceId: invoice.id,
          status: 'COMPLETED',
          reason: body.reason,
          restock: body.restock,
          subtotal: subtotal.toFixed(2),
          taxTotal: taxTotal.toFixed(2),
          total: total.toFixed(2),
          createdById: req.user!.id,
          items: {
            create: createItems.map(({ unitCostSnapshot: _u, ...rest }) => rest),
          },
        },
        include: { items: true },
      });

      if (body.restock) {
        for (const item of createItems) {
          await applyStockChange(tx, {
            productId: item.productId,
            quantityDelta: item.quantity,
            movementType: 'CUSTOMER_RETURN',
            unitCost: item.unitCostSnapshot,
            referenceType: 'SaleReturn',
            referenceId: created.id,
            reason: body.reason,
            createdById: req.user!.id,
          });
        }
      }

      const newPaid = money(invoice.amountPaid).minus(total);
      const clampedPaid = newPaid.lt(0) ? money(0) : newPaid;
      const balanceDue = money(invoice.grandTotal).minus(clampedPaid);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: clampedPaid.toFixed(2),
          balanceDue: balanceDue.lt(0) ? '0' : balanceDue.toFixed(2),
          status: 'REFUNDED',
        },
      });

      await writeAudit(tx, {
        userId: req.user!.id,
        action: 'invoice.return',
        entityType: 'SaleReturn',
        entityId: created.id,
        after: { returnNumber, total: total.toNumber(), reason: body.reason },
      });
      return created;
    });

    res.status(201).json(saleReturn);
  }),
);
