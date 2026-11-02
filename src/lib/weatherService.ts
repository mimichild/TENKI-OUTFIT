import type { WeatherRepository } from '@/db/weatherRepository';
import { taipeiDate, type FetchForecastResult } from './cwaWeather';

/** 快取超過 3 小時才重新抓（氣象署 1 週預報一天更新兩次） */
export const WEATHER_STALE_MS = 3 * 3_600_000;

export type RefreshResult = { status: 'ok' | 'fresh' } | Exclude<FetchForecastResult, { status: 'ok' }>;

export interface RefreshOptions {
  repo: WeatherRepository;
  fetcher: (args: { apiKey: string; county: string }) => Promise<FetchForecastResult>;
  county: string;
  apiKey: string;
  /** ISO 時間 */
  now: string;
  /** 下拉更新：不管快取新不新都重抓 */
  force?: boolean;
}

/**
 * 抓預報寫入快取：
 * - 只寫今天（台灣時間）以後的日期，過去日期保留當時的資料當歷史
 * - 晚上抓的「今天」只剩夜間時段，若已有今天的資料就不覆蓋
 */
export async function refreshWeather({ repo, fetcher, county, apiKey, now, force = false }: RefreshOptions): Promise<RefreshResult> {
  if (!force) {
    const last = await repo.lastFetchedAt(county);
    if (last !== null && new Date(now).getTime() - new Date(last).getTime() < WEATHER_STALE_MS) {
      return { status: 'fresh' };
    }
  }

  const result = await fetcher({ apiKey, county });
  if (result.status !== 'ok') return result;

  const today = taipeiDate(now);
  const cached = await repo.list(county);
  const hasToday = cached.some(d => d.date === today);
  const days = result.days.filter(d => d.date > today || (d.date === today && (d.hasDaytime || !hasToday)));
  await repo.upsert(county, days, now);
  return { status: 'ok' };
}
