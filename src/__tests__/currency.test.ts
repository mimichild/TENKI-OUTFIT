import { formatPrice, sumPrices } from '@/lib/currency';

describe('formatPrice', () => {
  it('formats TWD without decimals', () => {
    expect(formatPrice(1290, 'TWD')).toBe('NT$1,290');
  });
  it('formats JPY without decimals', () => {
    expect(formatPrice(5000, 'JPY')).toBe('¥5,000');
  });
  it('formats USD with two decimals', () => {
    expect(formatPrice(19.5, 'USD')).toBe('US$19.50');
  });
  it('shows a dash for missing price', () => {
    expect(formatPrice(null, 'TWD')).toBe('—');
  });
});

describe('sumPrices', () => {
  it('ignores items without a price', () => {
    expect(sumPrices([{ price: 100 }, { price: null }, { price: 250 }])).toBe(350);
  });
  it('returns 0 for an empty list', () => {
    expect(sumPrices([])).toBe(0);
  });
});

describe('formatPrice edge cases', () => {
  it('does not show a minus sign when the rounded value is zero', () => {
    expect(formatPrice(-0.4, 'TWD')).toBe('NT$0');
  });
  it('shows a dash for non-finite values', () => {
    expect(formatPrice(Infinity, 'TWD')).toBe('—');
  });
});
