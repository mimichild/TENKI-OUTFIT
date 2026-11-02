import { trashDaysLeft } from '@/lib/itemQueries';

describe('trashDaysLeft', () => {
  const now = '2026-11-02T12:00:00.000Z';
  it('counts remaining days rounding up', () => {
    expect(trashDaysLeft('2026-11-02T12:00:00.000Z', now, 30)).toBe(30);
    expect(trashDaysLeft('2026-10-03T13:00:00.000Z', now, 30)).toBe(1);
    expect(trashDaysLeft('2026-10-10T00:00:00.000Z', now, 30)).toBe(7);
  });
  it('never goes below zero', () => {
    expect(trashDaysLeft('2026-01-01T00:00:00.000Z', now, 30)).toBe(0);
  });
});
