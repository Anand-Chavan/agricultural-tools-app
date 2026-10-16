import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// decimal.js typings are awkward under NodeNext; use a narrow runtime wrapper.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DecimalCtor: any = require('decimal.js');
DecimalCtor.set({ precision: 20, rounding: DecimalCtor.ROUND_HALF_UP });

export type DecimalValue = string | number | { toString(): string };
export type DecimalInstance = {
  toFixed: (dp?: number) => string;
  toNumber: () => number;
  plus: (n: DecimalValue | DecimalInstance) => DecimalInstance;
  minus: (n: DecimalValue | DecimalInstance) => DecimalInstance;
  mul: (n: DecimalValue | DecimalInstance) => DecimalInstance;
  div: (n: DecimalValue | DecimalInstance) => DecimalInstance;
  neg: () => DecimalInstance;
  lt: (n: DecimalValue | DecimalInstance) => boolean;
  lte: (n: DecimalValue | DecimalInstance) => boolean;
  gt: (n: DecimalValue | DecimalInstance) => boolean;
  gte: (n: DecimalValue | DecimalInstance) => boolean;
  isZero: () => boolean;
  toDecimalPlaces: (dp: number, rounding?: number) => DecimalInstance;
};

export const Decimal = DecimalCtor as {
  new (value?: DecimalValue): DecimalInstance;
  set: (opts: Record<string, unknown>) => void;
  ROUND_HALF_UP: number;
};

export function money(value: DecimalValue): DecimalInstance {
  return new Decimal(value || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function qty(value: DecimalValue): DecimalInstance {
  return new Decimal(value || 0).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

export function toNumber(value: DecimalValue): number {
  return money(value).toNumber();
}

export function toMoneyString(value: DecimalValue): string {
  return money(value).toFixed(2);
}

export function calcLine(params: {
  quantity: DecimalValue;
  unitPrice: DecimalValue;
  discount?: DecimalValue;
  taxRate?: DecimalValue;
}) {
  const quantity = qty(params.quantity);
  const unitPrice = money(params.unitPrice);
  const discount = money(params.discount ?? 0);
  const taxRate = new Decimal(params.taxRate ?? 0);
  const base = money(quantity.mul(unitPrice).minus(discount));
  const taxAmount = money(base.mul(taxRate).div(100));
  const lineTotal = money(base.plus(taxAmount));
  return { quantity, unitPrice, discount, taxRate, base, taxAmount, lineTotal };
}
