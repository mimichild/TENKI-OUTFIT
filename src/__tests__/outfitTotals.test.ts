import { outfitTotal } from '@/lib/outfitTotals';

const piece = (price: number | null) => ({ item: { price } });

describe('outfitTotal', () => {
  it('adds up the prices that were filled in', () => {
    expect(outfitTotal([piece(790), piece(null), piece(1290.5)])).toBe(2080.5);
  });
  it('is null when no item has a price', () => {
    expect(outfitTotal([piece(null)])).toBeNull();
    expect(outfitTotal([])).toBeNull();
  });
  it('counts a price of 0 as filled in', () => {
    expect(outfitTotal([piece(0)])).toBe(0);
  });
});
