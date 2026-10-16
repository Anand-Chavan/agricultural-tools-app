import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export const customersRouter = Router();
customersRouter.use(requireAuth);

const phoneSchema = z
  .string()
  .optional()
  .nullable()
  .refine(
    (v) => !v || /^[+]?[\d\s()-]{7,20}$/.test(v),
    'Enter a valid phone number',
  );

const customerSchema = z.object({
  name: z.string().min(1),
  phone: phoneSchema,
  email: z.string().email().optional().nullable().or(z.literal('')),
  billingAddress: z.string().optional().nullable(),
  shippingAddress: z.string().optional().nullable(),
  businessName: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

customersRouter.get(
  '/',
  requirePermission('customers:read'),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const items = await prisma.customer.findMany({
      where: {
        isWalkIn: false,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
    });

    const balances = await prisma.invoice.groupBy({
      by: ['customerId'],
      where: {
        customerId: { in: items.map((c) => c.id) },
        status: { in: ['ISSUED', 'PARTIALLY_PAID', 'UNPAID', 'PAID'] },
      },
      _sum: { balanceDue: true, grandTotal: true },
    });
    const map = new Map(balances.map((b) => [b.customerId, b]));
    res.json({
      items: items.map((c) => ({
        ...c,
        outstandingBalance: Number(map.get(c.id)?._sum.balanceDue || 0),
        totalPurchases: Number(map.get(c.id)?._sum.grandTotal || 0),
      })),
    });
  }),
);

customersRouter.get(
  '/:id',
  requirePermission('customers:read'),
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        invoices: {
          orderBy: { invoiceDate: 'desc' },
          include: { payments: true, returns: true },
        },
      },
    });
    if (!customer) throw new AppError(404, 'Customer not found', 'NOT_FOUND');
    const outstandingBalance = customer.invoices.reduce(
      (s, i) => s + Number(i.balanceDue),
      0,
    );
    const totalPurchases = customer.invoices
      .filter((i) => i.status !== 'VOIDED' && i.status !== 'DRAFT')
      .reduce((s, i) => s + Number(i.grandTotal), 0);
    res.json({
      ...customer,
      outstandingBalance,
      totalPurchases,
      invoices: customer.invoices.map((i) => ({
        ...i,
        grandTotal: Number(i.grandTotal),
        amountPaid: Number(i.amountPaid),
        balanceDue: Number(i.balanceDue),
      })),
    });
  }),
);

customersRouter.post(
  '/',
  requirePermission('customers:write'),
  asyncHandler(async (req, res) => {
    const body = customerSchema.parse(req.body);
    let duplicatePhone = false;
    if (body.phone) {
      const existing = await prisma.customer.findFirst({
        where: { phone: body.phone, isWalkIn: false },
      });
      duplicatePhone = Boolean(existing);
    }
    const item = await prisma.customer.create({
      data: { ...body, email: body.email || null },
    });
    res.status(201).json({ ...item, duplicatePhoneWarning: duplicatePhone });
  }),
);

customersRouter.put(
  '/:id',
  requirePermission('customers:write'),
  asyncHandler(async (req, res) => {
    const body = customerSchema.parse(req.body);
    let duplicatePhone = false;
    if (body.phone) {
      const existing = await prisma.customer.findFirst({
        where: { phone: body.phone, isWalkIn: false, NOT: { id: req.params.id } },
      });
      duplicatePhone = Boolean(existing);
    }
    const item = await prisma.customer.update({
      where: { id: req.params.id },
      data: { ...body, email: body.email || null },
    });
    res.json({ ...item, duplicatePhoneWarning: duplicatePhone });
  }),
);
