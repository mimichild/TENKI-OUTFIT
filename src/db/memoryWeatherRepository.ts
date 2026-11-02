import type { WeatherDay } from '@/types/models';
import { toWeatherDay, type WeatherRepository } from './weatherRepository';

export function createMemoryWeatherRepository(seed: WeatherDay[] = []): WeatherRepository {
  const rows = new Map<string, WeatherDay>();
  const keyOf = (county: string, date: string) => `${county}|${date}`;
  for (const d of seed) rows.set(keyOf(d.county, d.date), d);

  const forCounty = (county: string) => [...rows.values()].filter(d => d.county === county);

  return {
    async list(county) {
      return forCounty(county).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({ ...d }));
    },
    async upsert(county, days, fetchedAt) {
      for (const d of days) rows.set(keyOf(county, d.date), toWeatherDay(county, d, fetchedAt));
    },
    async lastFetchedAt(county) {
      return forCounty(county).reduce<string | null>((max, d) => (max === null || d.fetchedAt > max ? d.fetchedAt : max), null);
    },
  };
}
