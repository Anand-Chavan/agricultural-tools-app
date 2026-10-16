import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { config } from 'dotenv';
import path from 'node:path';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';

config({ path: path.resolve(process.cwd(), '../../.env') });
config();
process.env.NODE_ENV = 'test';

const app = createApp();

async function loginAs(email: string) {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email, password: 'ChangeMe123!' });
  expect(login.status).toBe(200);
  return { agent, csrf: 'test' };
}

describe('invoice and stock flows', () => {
  beforeAll(async () => {
    // ensure seed data exists
    const admin = await prisma.user.findUnique({ where: { email: 'admin@demo.local' } });
    if (!admin) throw new Error('Run db:seed before integration tests');
  });

  it('blocks sales role from settings and cost mutation pathways', async () => {
    const { agent, csrf } = await loginAs('sales@demo.local');
    const settings = await agent.put('/api/settings').send({
      businessName: 'Hack',
      invoicePrefix: 'INV',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      lowStockDefault: 1,
      paymentMethods: ['CASH'],
      units: ['pcs'],
      allowNegativeStock: true,
    });
    expect(settings.status).toBe(403);

    const product = await prisma.product.findFirst({ where: { isActive: true } });
    const update = await agent.put(`/api/products/${product!.id}`).send({
      sku: product!.sku,
      name: product!.name,
      categoryId: product!.categoryId,
      productType: product!.productType,
      unit: product!.unit,
      costPrice: 1,
      sellingPrice: Number(product!.sellingPrice),
      reorderLevel: Number(product!.reorderLevel),
      isActive: true,
    });
    expect(update.status).toBe(403);
  });

  it('issues unique invoice numbers and decrements stock once', async () => {
    const { agent } = await loginAs('admin@demo.local');
    const product = await prisma.product.findFirst({
      where: { isActive: true },
      include: { stockBalances: true },
    });
    const before = Number(product!.stockBalances[0]?.quantityOnHand || 0);
    const customer = await prisma.customer.findFirst({ where: { isWalkIn: false } });

    const draft = await agent.post('/api/invoices').send({
      customerId: customer!.id,
      items: [{ productId: product!.id, quantity: 1 }],
    });
    expect(draft.status).toBe(201);

    const issued = await agent
      .post(`/api/invoices/${draft.body.id}/issue`)
      .send({ amount: 50, method: 'CASH' });
    expect(issued.status).toBe(200);
    expect(issued.body.invoiceNumber).toMatch(/^INV-\d+$/);
    expect(Number(issued.body.amountPaid)).toBe(50);

    const bal = await prisma.stockBalance.findFirst({ where: { productId: product!.id } });
    expect(Number(bal!.quantityOnHand)).toBe(before - 1);

    const movements = await prisma.stockMovement.count({
      where: { referenceType: 'Invoice', referenceId: draft.body.id, movementType: 'SALE' },
    });
    expect(movements).toBe(1);
  });

  it('blocks issue when stock is insufficient', async () => {
    const { agent } = await loginAs('admin@demo.local');
    const product = await prisma.product.findFirst({
      where: { isActive: true },
      include: { stockBalances: true },
    });
    const onHand = Number(product!.stockBalances[0]?.quantityOnHand || 0);
    const draft = await agent.post('/api/invoices').send({
      walkInName: 'Stock Test',
      items: [{ productId: product!.id, quantity: onHand + 1000 }],
    });
    expect(draft.status).toBe(201);
    const issued = await agent.post(`/api/invoices/${draft.body.id}/issue`).send({});
    expect(issued.status).toBe(400);
    expect(issued.body.error.code).toBe('INSUFFICIENT_STOCK');
  });
});
