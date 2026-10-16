import { describe, expect, it } from 'vitest';
import { calcLine, money } from './money.js';

describe('money helpers', () => {
  it('rounds half up to 2 decimals', () => {
    expect(money(1.005).toFixed(2)).toBe('1.01');
    expect(money(2.225).toFixed(2)).toBe('2.23');
  });

  it('computes line totals with tax', () => {
    const line = calcLine({ quantity: 2, unitPrice: 100, discount: 10, taxRate: 18 });
    expect(line.base.toFixed(2)).toBe('190.00');
    expect(line.taxAmount.toFixed(2)).toBe('34.20');
    expect(line.lineTotal.toFixed(2)).toBe('224.20');
  });
});
