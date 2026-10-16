import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { money } from '../lib/money.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requirePermission('reports:read'));

function csvEscape(value: unknown) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function sendCsv(res: import('express').Response, filename: string, headers: string[], rows: unknown[][]) {
  const lines = [headers.join(',')].concat(rows.map((r) => r.map(csvEscape).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\n'));
}

reportsRouter.get(
  '/sales',
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const invoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['ISSUED', 'PAID', 'PARTIALLY_PAID', 'UNPAID', 'REFUNDED'] },
        issuedAt: { gte: from, lte: to },
      },
      include: { customer: true, items: true, returns: true },
      orderBy: { issuedAt: 'asc' },
    });

    const grossSales = invoices.reduce((s, i) => s + Number(i.grandTotal), 0);
    const discounts = invoices.reduce((s, i) => s + Number(i.discountTotal), 0);
    const taxes = invoices.reduce((s, i) => s + Number(i.taxTotal), 0);
    const returns = invoices.reduce(
      (s, i) => s + i.returns.reduce((rs, r) => rs + Number(r.total), 0),
      0,
    );

    const byProduct = new Map<string, { name: string; qty: number; value: number }>();
    for (const inv of invoices) {
      for (const item of inv.items) {
        const cur = byProduct.get(item.productId) || {
          name: item.productNameSnapshot,
          qty: 0,
          value: 0,
        };
        cur.qty += Number(item.quantity);
        cur.value += Number(item.lineTotal);
        byProduct.set(item.productId, cur);
      }
    }

    const summary = {
      from,
      to,
      invoiceCount: invoices.length,
      grossSales: money(grossSales).toNumber(),
      discounts: money(discounts).toNumber(),
      taxes: money(taxes).toNumber(),
      returns: money(returns).toNumber(),
      netSales: money(grossSales - returns).toNumber(),
      byProduct: [...byProduct.entries()].map(([productId, v]) => ({ productId, ...v })),
      invoices: invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        date: i.issuedAt,
        customer: i.customer?.name || i.walkInName,
        grandTotal: Number(i.grandTotal),
        amountPaid: Number(i.amountPaid),
        balanceDue: Number(i.balanceDue),
        status: i.status,
      })),
    };

    if (String(req.query.format) === 'csv') {
      return sendCsv(
        res,
        'sales-report.csv',
        ['Invoice', 'Date', 'Customer', 'Status', 'Grand Total', 'Paid', 'Balance'],
        summary.invoices.map((i) => [
          i.invoiceNumber,
          i.date?.toISOString() || '',
          i.customer,
          i.status,
          i.grandTotal,
          i.amountPaid,
          i.balanceDue,
        ]),
      );
    }
    res.json(summary);
  }),
);

reportsRouter.get(
  '/stock',
  asyncHandler(async (req, res) => {
    const balances = await prisma.stockBalance.findMany({
      include: { product: { include: { category: true } } },
      orderBy: { product: { name: 'asc' } },
    });
    const items = balances.map((b) => {
      const qty = Number(b.quantityOnHand);
      const cost = Number(b.product.costPrice);
      return {
        sku: b.product.sku,
        name: b.product.name,
        category: b.product.category.name,
        quantityOnHand: qty,
        reorderLevel: Number(b.product.reorderLevel),
        isLowStock: qty <= Number(b.product.reorderLevel),
        unitCost: cost,
        valuation: money(qty * cost).toNumber(),
      };
    });
    const totalValuation = money(items.reduce((s, i) => s + i.valuation, 0)).toNumber();
    const payload = {
      costingMethod: 'Current product cost price × on-hand quantity',
      totalValuation,
      lowStockCount: items.filter((i) => i.isLowStock).length,
      items,
    };
    if (String(req.query.format) === 'csv') {
      return sendCsv(
        res,
        'stock-report.csv',
        ['SKU', 'Name', 'Category', 'On Hand', 'Reorder', 'Unit Cost', 'Valuation'],
        items.map((i) => [i.sku, i.name, i.category, i.quantityOnHand, i.reorderLevel, i.unitCost, i.valuation]),
      );
    }
    res.json(payload);
  }),
);

reportsRouter.get(
  '/receivables',
  asyncHandler(async (req, res) => {
    const invoices = await prisma.invoice.findMany({
      where: {
        balanceDue: { gt: 0 },
        status: { in: ['UNPAID', 'PARTIALLY_PAID', 'ISSUED'] },
      },
      include: { customer: true },
      orderBy: { invoiceDate: 'asc' },
    });
    const items = invoices.map((i) => ({
      invoiceNumber: i.invoiceNumber,
      customer: i.customer?.name || i.walkInName,
      invoiceDate: i.invoiceDate,
      grandTotal: Number(i.grandTotal),
      amountPaid: Number(i.amountPaid),
      balanceDue: Number(i.balanceDue),
      status: i.status,
    }));
    if (String(req.query.format) === 'csv') {
      return sendCsv(
        res,
        'receivables.csv',
        ['Invoice', 'Customer', 'Date', 'Total', 'Paid', 'Due', 'Status'],
        items.map((i) => [i.invoiceNumber, i.customer, i.invoiceDate.toISOString(), i.grandTotal, i.amountPaid, i.balanceDue, i.status]),
      );
    }
    res.json({
      totalDue: money(items.reduce((s, i) => s + i.balanceDue, 0)).toNumber(),
      items,
    });
  }),
);

reportsRouter.get(
  '/purchases',
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const purchases = await prisma.purchase.findMany({
      where: { purchaseDate: { gte: from, lte: to } },
      include: { supplier: true },
      orderBy: { purchaseDate: 'desc' },
    });
    const items = purchases.map((p) => ({
      purchaseNumber: p.purchaseNumber,
      supplier: p.supplier.name,
      status: p.status,
      purchaseDate: p.purchaseDate,
      grandTotal: Number(p.grandTotal),
      amountPaid: Number(p.amountPaid),
      balanceDue: Number(p.balanceDue),
    }));
    if (String(req.query.format) === 'csv') {
      return sendCsv(
        res,
        'purchases.csv',
        ['PO', 'Supplier', 'Status', 'Date', 'Total', 'Paid', 'Due'],
        items.map((i) => [i.purchaseNumber, i.supplier, i.status, i.purchaseDate.toISOString(), i.grandTotal, i.amountPaid, i.balanceDue]),
      );
    }
    res.json({
      totalPurchases: money(items.reduce((s, i) => s + i.grandTotal, 0)).toNumber(),
      totalDue: money(items.reduce((s, i) => s + i.balanceDue, 0)).toNumber(),
      items,
    });
  }),
);
