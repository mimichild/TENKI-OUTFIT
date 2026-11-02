import real from './fixtures/cwa-f-d0047-091-real-taipei.json';
import { parseForecast } from '@/lib/cwaWeather';

// 2026-11-02 20:00 左右抓的真實回傳（臺北市），確認解析和真實格式一致
describe('parseForecast with a real CWA response', () => {
  const days = parseForecast(real, '臺北市');

  it('produces one entry per date, 7–8 days, all fields filled', () => {
    expect(days.length).toBeGreaterThanOrEqual(7);
    expect(days.length).toBeLessThanOrEqual(8);
    for (const d of days) {
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.maxT).not.toBeNull();
      expect(d.minT).not.toBeNull();
      expect(d.maxAT).not.toBeNull();
      expect(d.minAT).not.toBeNull();
      expect(d.wxCode).toMatch(/^\d{2}$/);
      expect(d.wxText).toBeTruthy();
      expect(d.maxT!).toBeGreaterThanOrEqual(d.minT!);
    }
  });

  it('marks the evening-only first day as having no daytime period', () => {
    expect(days[0]).toMatchObject({ date: '2026-11-02', hasDaytime: false });
    expect(days[1].hasDaytime).toBe(true);
  });
});
