import { describe, expect, it } from 'vitest';
import { formatINR } from './client';

describe('formatINR', () => {
  it('formats Indian currency', () => {
    expect(formatINR(1234.5)).toContain('1,234.50');
  });
});
