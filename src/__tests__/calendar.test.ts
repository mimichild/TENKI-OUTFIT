import { addMonths, monthGrid, monthOf, weekOf } from '@/lib/calendar';

describe('calendar', () => {
  it('builds a Sunday-first month grid padded with neighbouring days', () => {
    const weeks = monthGrid('2026-11');
    // 2026-11-01 是星期日
    expect(weeks[0]).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    expect(weeks).toHaveLength(5);
    expect(weeks[4]).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05']);
  });

  it('pads the first week with days of the previous month', () => {
    // 2026-10-01 是星期四
    expect(monthGrid('2026-10')[0]).toEqual(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(monthGrid('2026-02').every(w => w.length === 7)).toBe(true);
  });

  it('moves between months across years', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-11', -13)).toBe('2025-10');
    expect(monthOf('2026-11-02')).toBe('2026-11');
  });

  it('returns the Sunday-to-Saturday week containing a date', () => {
    expect(weekOf('2026-11-04')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    expect(weekOf('2026-11-01')[0]).toBe('2026-11-01');
    expect(weekOf('2026-12-31')).toEqual(['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
});
