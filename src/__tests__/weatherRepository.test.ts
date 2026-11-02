import { createMemoryWeatherRepository } from '@/db/memoryWeatherRepository';
import { createSqliteWeatherRepository } from '@/db/sqliteWeatherRepository';
import type { WeatherRepository } from '@/db/weatherRepository';
import type { DailyForecast } from '@/lib/cwaWeather';

const day = (date: string, maxT: number): DailyForecast => ({
  date, maxT, minT: maxT - 5, maxAT: maxT + 1, minAT: maxT - 6, pop: 30, wxCode: '04', wxText: '多雲', hasDaytime: true,
});

describe('memory weather repository', () => {
  let repo: WeatherRepository;
  beforeEach(() => { repo = createMemoryWeatherRepository(); });

  it('upserts and reads days per county, sorted by date', async () => {
    await repo.upsert('臺北市', [day('2026-11-04', 24), day('2026-11-03', 25)], '2026-11-03T01:00:00.000Z');
    await repo.upsert('新北市', [day('2026-11-03', 18)], '2026-11-03T01:00:00.000Z');
    const days = await repo.list('臺北市');
    expect(days.map(d => [d.date, d.maxT])).toEqual([['2026-11-03', 25], ['2026-11-04', 24]]);
    expect(days[0]).toMatchObject({ county: '臺北市', town: '', fetchedAt: '2026-11-03T01:00:00.000Z' });
  });

  it('overwrites the same date', async () => {
    await repo.upsert('臺北市', [day('2026-11-03', 25)], 'a');
    await repo.upsert('臺北市', [day('2026-11-03', 20)], 'b');
    expect(await repo.list('臺北市')).toEqual([expect.objectContaining({ maxT: 20, fetchedAt: 'b' })]);
  });

  it('reports the newest fetchedAt for a county', async () => {
    expect(await repo.lastFetchedAt('臺北市')).toBeNull();
    await repo.upsert('臺北市', [day('2026-11-03', 25)], '2026-11-03T01:00:00.000Z');
    await repo.upsert('臺北市', [day('2026-11-04', 25)], '2026-11-03T05:00:00.000Z');
    expect(await repo.lastFetchedAt('臺北市')).toBe('2026-11-03T05:00:00.000Z');
  });
});

describe('sqlite weather repository', () => {
  function makeDb() {
    return {
      runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue(null),
      withExclusiveTransactionAsync: jest.fn(async (fn: (tx: unknown) => Promise<void>) => fn(db)),
    };
  }
  let db: ReturnType<typeof makeDb>;
  beforeEach(() => { db = makeDb(); });

  it('upserts every day inside one transaction with town = ""', async () => {
    const repo = createSqliteWeatherRepository(db as never);
    await repo.upsert('臺北市', [day('2026-11-03', 25), day('2026-11-04', 24)], 'T');
    expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(db.runAsync).toHaveBeenCalledTimes(2);
    const [sql, params] = db.runAsync.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO weather_days[\s\S]*ON CONFLICT\(county, town, date\) DO UPDATE/);
    expect(params).toEqual(['臺北市', '', '2026-11-03', 25, 20, 26, 19, 30, '04', '多雲', 'T']);
  });

  it('skips the transaction when there is nothing to write', async () => {
    await createSqliteWeatherRepository(db as never).upsert('臺北市', [], 'T');
    expect(db.withExclusiveTransactionAsync).not.toHaveBeenCalled();
  });

  it('maps rows to WeatherDay', async () => {
    db.getAllAsync.mockResolvedValue([{
      county: '臺北市', town: '', date: '2026-11-03', max_t: 25, min_t: 20, max_at: 26, min_at: 19,
      pop: null, wx_code: '04', wx_text: '多雲', fetched_at: 'T',
    }]);
    const days = await createSqliteWeatherRepository(db as never).list('臺北市');
    expect(db.getAllAsync.mock.calls[0][1]).toEqual(['臺北市', '']);
    expect(days).toEqual([{
      county: '臺北市', town: '', date: '2026-11-03', maxT: 25, minT: 20, maxAT: 26, minAT: 19,
      pop: null, wxCode: '04', wxText: '多雲', fetchedAt: 'T',
    }]);
  });

  it('reads lastFetchedAt', async () => {
    db.getFirstAsync.mockResolvedValue({ last: 'T2' });
    expect(await createSqliteWeatherRepository(db as never).lastFetchedAt('臺北市')).toBe('T2');
  });
});
