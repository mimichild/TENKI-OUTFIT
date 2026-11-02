import type { DailyForecast } from '@/lib/cwaWeather';
import type { WeatherDay } from '@/types/models';

/** v1 只做到縣市，town 一律存空字串（schema 保留 town 欄位給之後的鄉鎮層級） */
export const COUNTY_LEVEL_TOWN = '';

/** 天氣快取：實機用 SQLite，Web 預覽與測試用記憶體版本 */
export interface WeatherRepository {
  /** 該縣市所有已快取的日期，日期由舊到新 */
  list(county: string): Promise<WeatherDay[]>;
  /** 同日期覆蓋 */
  upsert(county: string, days: DailyForecast[], fetchedAt: string): Promise<void>;
  /** 該縣市最近一次寫入的時間，沒有資料時為 null */
  lastFetchedAt(county: string): Promise<string | null>;
}

export function toWeatherDay(county: string, d: DailyForecast, fetchedAt: string): WeatherDay {
  return {
    county,
    town: COUNTY_LEVEL_TOWN,
    date: d.date,
    maxT: d.maxT,
    minT: d.minT,
    maxAT: d.maxAT,
    minAT: d.minAT,
    pop: d.pop,
    wxCode: d.wxCode,
    wxText: d.wxText,
    fetchedAt,
  };
}
