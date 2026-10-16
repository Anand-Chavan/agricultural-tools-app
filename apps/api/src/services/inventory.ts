import type { MovementType, Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { Decimal, qty, type DecimalInstance, type DecimalValue } from '../lib/money.js';
import { allowNegativeStock } from '../lib/settings.js';

type Tx = Prisma.TransactionClient;

export async function applyStockChange(
  tx: Tx,
  input: {
    productId: string;
    quantityDelta: DecimalValue;
    movementType: MovementType;
    unitCost?: DecimalValue | null;
    referenceType?: string;
    referenceId?: string;
    reason?: string;
    createdById?: string | null;
  },
) {
  const delta = qty(input.quantityDelta);
  if (delta.isZero()) {
    throw new AppError(400, 'Stock quantity delta cannot be zero', 'INVALID_QTY');
  }

  let balance = await tx.stockBalance.findFirst({
    where: { productId: input.productId, locationId: null },
  });

  if (!balance) {
    balance = await tx.stockBalance.create({
      data: { productId: input.productId, locationId: null, quantityOnHand: 0 },
    });
  }

  const next = qty(balance.quantityOnHand).plus(delta);
  const allowNeg = await allowNegativeStock();
  if (next.lt(0) && !allowNeg) {
    throw new AppError(400, 'Insufficient stock for this operation', 'INSUFFICIENT_STOCK');
  }

  await tx.stockBalance.update({
    where: { id: balance.id },
    data: { quantityOnHand: next.toFixed(3) },
  });

  return tx.stockMovement.create({
    data: {
      productId: input.productId,
      movementType: input.movementType,
      quantityDelta: delta.toFixed(3),
      unitCost: input.unitCost == null ? undefined : new Decimal(input.unitCost).toFixed(2),
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      reason: input.reason,
      createdById: input.createdById ?? undefined,
    },
  });
}

export async function getAvailableQty(tx: Tx, productId: string): Promise<DecimalInstance> {
  const balance = await tx.stockBalance.findFirst({
    where: { productId, locationId: null },
  });
  return qty(balance?.quantityOnHand ?? 0);
}
