export type CurrencyCode = 'TWD' | 'JPY' | 'USD' | 'EUR' | 'KRW' | 'HKD';

interface CurrencyInfo {
  symbol: string;
  decimals: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  TWD: { symbol: 'NT$', decimals: 0 },
  JPY: { symbol: '¥', decimals: 0 },
  USD: { symbol: 'US$', decimals: 2 },
  EUR: { symbol: '€', decimals: 2 },
  KRW: { symbol: '₩', decimals: 0 },
  HKD: { symbol: 'HK$', decimals: 2 },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatPrice(amount: number | null | undefined, currency: CurrencyCode): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  const { symbol, decimals } = CURRENCIES[currency];
  const fixed = Math.abs(amount).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const sign = amount < 0 && Number(fixed) !== 0 ? '-' : '';
  return `${sign}${symbol}${groupThousands(int)}${frac ? `.${frac}` : ''}`;
}

export function sumPrices(items: { price: number | null }[]): number {
  return items.reduce((total, item) => total + (item.price ?? 0), 0);
}
