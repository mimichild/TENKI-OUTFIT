import { addDays, weekdayOf } from '@/lib/weatherDates';

describe('weatherDates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('gives the weekday of a date (0 = Sunday)', () => {
    expect(weekdayOf('2026-11-03')).toBe(2);
    expect(weekdayOf('2026-11-08')).toBe(0);
  });

});
