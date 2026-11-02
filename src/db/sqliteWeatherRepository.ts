import type { SQLiteDatabase } from 'expo-sqlite';
import type { WeatherDay } from '@/types/models';
import { COUNTY_LEVEL_TOWN, toWeatherDay, type WeatherRepository } from './weatherRepository';

type Db = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync' | 'getAllAsync' | 'withExclusiveTransactionAsync'>;

interface WeatherRow {
  county: string;
  town: string;
  date: string;
  max_t: number | null;
  min_t: number | null;
  max_at: number | null;
  min_at: number | null;
  pop: number | null;
  wx_code: string | null;
  wx_text: string | null;
  fetched_at: string;
}

const UPSERT_SQL = `
  INSERT INTO weather_days (county, town, date, max_t, min_t, max_at, min_at, pop, wx_code, wx_text, fetched_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(county, town, date) DO UPDATE SET
    max_t = excluded.max_t, min_t = excluded.min_t, max_at = excluded.max_at, min_at = excluded.min_at,
    pop = excluded.pop, wx_code = excluded.wx_code, wx_text = excluded.wx_text, fetched_at = excluded.fetched_at`;

function rowToDay(r: WeatherRow): WeatherDay {
  return {
    county: r.county,
    town: r.town,
    date: r.date,
    maxT: r.max_t,
    minT: r.min_t,
    maxAT: r.max_at,
    minAT: r.min_at,
    pop: r.pop,
    wxCode: r.wx_code,
    wxText: r.wx_text,
    fetchedAt: r.fetched_at,
  };
}

export function createSqliteWeatherRepository(db: Db): WeatherRepository {
  return {
    async list(county) {
      const rows = await db.getAllAsync<WeatherRow>(
        'SELECT * FROM weather_days WHERE county = ? AND town = ? ORDER BY date',
        [county, COUNTY_LEVEL_TOWN],
      );
      return rows.map(rowToDay);
    },
    async upsert(county, days, fetchedAt) {
      if (days.length === 0) return;
      await db.withExclusiveTransactionAsync(async tx => {
        for (const d of days) {
          const w = toWeatherDay(county, d, fetchedAt);
          await tx.runAsync(UPSERT_SQL, [
            w.county, w.town, w.date, w.maxT, w.minT, w.maxAT, w.minAT, w.pop, w.wxCode, w.wxText, w.fetchedAt,
          ]);
        }
      });
    },
    async lastFetchedAt(county) {
      const row = await db.getFirstAsync<{ last: string | null }>(
        'SELECT MAX(fetched_at) AS last FROM weather_days WHERE county = ? AND town = ?',
        [county, COUNTY_LEVEL_TOWN],
      );
      return row?.last ?? null;
    },
  };
}
