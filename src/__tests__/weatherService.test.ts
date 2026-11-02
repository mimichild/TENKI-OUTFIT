import { createMemoryWeatherRepository } from '@/db/memoryWeatherRepository';
import type { DailyForecast, FetchForecastResult } from '@/lib/cwaWeather';
import { WEATHER_STALE_MS, refreshWeather } from '@/lib/weatherService';

const day = (date: string, maxT: number, hasDaytime = true): DailyForecast => ({
  date, maxT, minT: maxT - 5, maxAT: maxT, minAT: maxT - 6, pop: 10, wxCode: '01', wxText: '晴天', hasDaytime,
});

// 2026-11-03 20:00 台灣時間
const NOW = '2026-11-03T12:00:00.000Z';

function setup(result: FetchForecastResult) {
  const repo = createMemoryWeatherRepository();
  const fetcher = jest.fn().mockResolvedValue(result);
  const run = (opts: { force?: boolean; now?: string } = {}) =>
    refreshWeather({ repo, fetcher, county: '臺北市', apiKey: 'k', now: opts.now ?? NOW, force: opts.force });
  return { repo, fetcher, run };
}

describe('refreshWeather', () => {
  it('fetches and stores today and future days, never past days', async () => {
    const { repo, run } = setup({ status: 'ok', days: [day('2026-11-02', 30), day('2026-11-03', 25), day('2026-11-04', 24)] });
    await expect(run()).resolves.toEqual({ status: 'ok' });
    expect((await repo.list('臺北市')).map(d => d.date)).toEqual(['2026-11-03', '2026-11-04']);
  });

  it('keeps the cached past day untouched', async () => {
    const { repo, run } = setup({ status: 'ok', days: [day('2026-11-02', 30)] });
    await repo.upsert('臺北市', [day('2026-11-02', 18)], 'old');
    await run({ force: true });
    expect(await repo.list('臺北市')).toEqual([expect.objectContaining({ date: '2026-11-02', maxT: 18, fetchedAt: 'old' })]);
  });

  it('keeps cached today when the new forecast lost the daytime period', async () => {
    const { repo, run } = setup({ status: 'ok', days: [day('2026-11-03', 19, false), day('2026-11-04', 24)] });
    await repo.upsert('臺北市', [day('2026-11-03', 26)], 'morning');
    await run({ force: true });
    const days = await repo.list('臺北市');
    expect(days[0]).toMatchObject({ date: '2026-11-03', maxT: 26, fetchedAt: 'morning' });
    expect(days[1]).toMatchObject({ date: '2026-11-04', fetchedAt: NOW });
  });

  it('stores night-only today when nothing is cached for today', async () => {
    const { repo, run } = setup({ status: 'ok', days: [day('2026-11-03', 19, false)] });
    await run();
    expect(await repo.list('臺北市')).toEqual([expect.objectContaining({ maxT: 19 })]);
  });

  it('skips the network when the cache is fresh, unless forced', async () => {
    const { repo, fetcher, run } = setup({ status: 'ok', days: [] });
    const recent = new Date(new Date(NOW).getTime() - WEATHER_STALE_MS + 60_000).toISOString();
    await repo.upsert('臺北市', [day('2026-11-03', 25)], recent);
    await expect(run()).resolves.toEqual({ status: 'fresh' });
    expect(fetcher).not.toHaveBeenCalled();
    await run({ force: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches when the cache is older than the stale window', async () => {
    const { repo, fetcher, run } = setup({ status: 'ok', days: [] });
    const old = new Date(new Date(NOW).getTime() - WEATHER_STALE_MS).toISOString();
    await repo.upsert('臺北市', [day('2026-11-03', 25)], old);
    await run();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches when the cached time is in the future (device clock was ahead)', async () => {
    const { repo, fetcher, run } = setup({ status: 'ok', days: [] });
    await repo.upsert('臺北市', [day('2026-11-03', 25)], '2026-11-04T12:00:00.000Z');
    await run();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('passes the abort signal to the fetcher', async () => {
    const { fetcher } = setup({ status: 'aborted' });
    const repo = createMemoryWeatherRepository();
    const signal = new AbortController().signal;
    await refreshWeather({ repo, fetcher, county: '臺北市', apiKey: 'k', now: NOW, signal });
    expect(fetcher).toHaveBeenCalledWith({ apiKey: 'k', county: '臺北市', signal });
  });

  it('passes fetch failures through and leaves the cache alone', async () => {
    const { repo, run } = setup({ status: 'unauthorized' });
    await repo.upsert('臺北市', [day('2026-11-03', 25)], 'old');
    await expect(run({ force: true })).resolves.toEqual({ status: 'unauthorized' });
    expect(await repo.list('臺北市')).toHaveLength(1);
  });
});
