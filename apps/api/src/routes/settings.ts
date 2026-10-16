import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { writeAudit } from '../lib/audit.js';
import { prisma } from '../lib/prisma.js';
import { getSetting, setSetting } from '../lib/settings.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

const defaultSettings = {
  businessName: 'Agricultural Tools Co. (Demo)',
  address: 'Example Industrial Area, Maharashtra, India',
  phone: '+91 90000 00000',
  email: 'demo@agricultural-tools.example',
  gstin: 'DEMO-GSTIN-REPLACE',
  invoicePrefix: 'INV',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  lowStockDefault: 10,
  paymentMethods: ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT'],
  units: ['pcs', 'set', 'kg', 'dozen'],
  allowNegativeStock: false,
  invoiceTerms: 'Goods once sold are returnable only as per company policy. Tax configuration must be confirmed by your accountant before production use.',
  taxWarning:
    'Tax rates and tax invoice fields are configurable placeholders. A qualified local accountant must confirm applicable obligations before production use.',
};

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const stored = await getSetting<Partial<typeof defaultSettings>>('business', {});
    const taxRates = await prisma.taxRate.findMany({ orderBy: { name: 'asc' } });
    const sequence = await prisma.invoiceSequence.findUnique({ where: { id: 'default' } });
    res.json({
      settings: { ...defaultSettings, ...stored },
      taxRates: taxRates.map((t) => ({
        id: t.id,
        name: t.name,
        rate: Number(t.rate),
        isActive: t.isActive,
      })),
      invoiceSequence: sequence,
    });
  }),
);

settingsRouter.put(
  '/',
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        businessName: z.string().min(1),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        gstin: z.string().optional(),
        invoicePrefix: z.string().min(1),
        currency: z.string().min(1),
        timezone: z.string().min(1),
        lowStockDefault: z.coerce.number().nonnegative(),
        paymentMethods: z.array(z.string()).min(1),
        units: z.array(z.string()).min(1),
        allowNegativeStock: z.boolean(),
        invoiceTerms: z.string().optional(),
      })
      .parse(req.body);

    const before = await getSetting('business', defaultSettings);
    await setSetting('business', { ...defaultSettings, ...body });
    await setSetting('allowNegativeStock', body.allowNegativeStock);
    await prisma.invoiceSequence.upsert({
      where: { id: 'default' },
      create: { id: 'default', prefix: body.invoicePrefix, nextNumber: 1 },
      update: { prefix: body.invoicePrefix },
    });
    await writeAudit(prisma, {
      userId: req.user!.id,
      action: 'settings.update',
      entityType: 'BusinessSetting',
      entityId: 'business',
      before,
      after: body,
    });
    res.json({ settings: { ...defaultSettings, ...body } });
  }),
);

settingsRouter.post(
  '/tax-rates',
  requirePermission('settings:manage'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        rate: z.coerce.number().nonnegative(),
        isActive: z.boolean().default(true),
      })
      .parse(req.body);
    const tax = await prisma.taxRate.create({
      data: { name: body.name, rate: body.rate, isActive: body.isActive },
    });
    res.status(201).json({ ...tax, rate: Number(tax.rate) });
  }),
);
