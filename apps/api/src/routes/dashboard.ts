import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { money } from '../lib/money.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requirePermission('dashboard:read'));

function startOfDayIST(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.format(d);
  return new Date(`${parts}T00:00:00+05:30`);
}

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : startOfDayIST();
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const monthStart = new Date(from);
    monthStart.setDate(1);

    const issuedStatuses = ['ISSUED', 'PAID', 'PARTIALLY_PAID', 'UNPAID', 'REFUNDED'] as const;

    const [todaySales, monthSales, purchaseSpend, lowStock, outstanding, recentInvoices, topProducts, salesTrend] =
      await Promise.all([
        prisma.invoice.aggregate({
          where: {
            status: { in: [...issuedStatuses] },
            issuedAt: { gte: startOfDayIST(), lte: new Date() },
          },
          _sum: { grandTotal: true },
          _count: true,
        }),
        prisma.invoice.aggregate({
          where: {
            status: { in: [...issuedStatuses] },
            issuedAt: { gte: monthStart, lte: to },
          },
          _sum: { grandTotal: true },
        }),
        prisma.purchase.aggregate({
          where: {
            status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] },
            receivedAt: { gte: from, lte: to },
          },
          _sum: { grandTotal: true },
        }),
        prisma.stockBalance.findMany({
          include: { product: true },
        }),
        prisma.invoice.aggregate({
          where: { status: { in: ['UNPAID', 'PARTIALLY_PAID', 'ISSUED'] } },
          _sum: { balanceDue: true },
        }),
        prisma.invoice.findMany({
          where: { status: { not: 'DRAFT' } },
          include: { customer: true },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
        prisma.invoiceItem.groupBy({
          by: ['productId', 'productNameSnapshot'],
          where: {
            invoice: {
              status: { in: [...issuedStatuses] },
              issuedAt: { gte: from, lte: to },
            },
          },
          _sum: { quantity: true, lineTotal: true },
          orderBy: { _sum: { lineTotal: 'desc' } },
          take: 5,
        }),
        prisma.invoice.findMany({
          where: {
            status: { in: [...issuedStatuses] },
            issuedAt: { gte: from, lte: to },
          },
          select: { issuedAt: true, grandTotal: true },
          orderBy: { issuedAt: 'asc' },
        }),
      ]);

    const lowStockItems = lowStock
      .filter((b) => b.product.isActive && Number(b.quantityOnHand) <= Number(b.product.reorderLevel))
      .map((b) => ({
        productId: b.productId,
        sku: b.product.sku,
        name: b.product.name,
        quantityOnHand: Number(b.quantityOnHand),
        reorderLevel: Number(b.product.reorderLevel),
      }));

    // Gross profit only when cost snapshots exist
    const soldLines = await prisma.invoiceItem.findMany({
      where: {
        invoice: { status: { in: [...issuedStatuses] }, issuedAt: { gte: from, lte: to } },
        unitCostSnapshot: { not: null },
      },
      select: { lineTotal: true, taxAmount: true, unitCostSnapshot: true, quantity: true },
    });
    let estimatedGrossProfit: number | null = null;
    if (soldLines.length) {
      const revenueExTax = soldLines.reduce(
        (s, l) => s + Number(l.lineTotal) - Number(l.taxAmount),
        0,
      );
      const cost = soldLines.reduce(
        (s, l) => s + Number(l.unitCostSnapshot) * Number(l.quantity),
        0,
      );
      estimatedGrossProfit = money(revenueExTax - cost).toNumber();
    }

    const trendMap = new Map<string, number>();
    for (const row of salesTrend) {
      if (!row.issuedAt) continue;
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(row.issuedAt);
      trendMap.set(key, (trendMap.get(key) || 0) + Number(row.grandTotal));
    }

    res.json({
      range: { from, to },
      kpis: {
        todaySales: Number(todaySales._sum.grandTotal || 0),
        todayInvoiceCount: todaySales._count,
        monthToDateSales: Number(monthSales._sum.grandTotal || 0),
        purchaseSpend: Number(purchaseSpend._sum.grandTotal || 0),
        lowStockCount: lowStockItems.length,
        outstandingCustomerBalances: Number(outstanding._sum.balanceDue || 0),
        estimatedGrossProfit,
        costingMethod: 'Invoice line unit cost snapshot (approx. weighted last purchase/cost)',
      },
      salesTrend: [...trendMap.entries()].map(([date, total]) => ({ date, total })),
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        name: p.productNameSnapshot,
        quantity: Number(p._sum.quantity || 0),
        salesValue: Number(p._sum.lineTotal || 0),
      })),
      recentInvoices: recentInvoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        customerName: i.customer?.name || i.walkInName || 'Walk-in',
        status: i.status,
        grandTotal: Number(i.grandTotal),
        invoiceDate: i.invoiceDate,
      })),
      lowStockItems,
    });
  }),
);
