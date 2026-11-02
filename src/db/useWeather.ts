import { useCallback, useEffect, useRef, useState } from 'react';
import { effectiveCwaKey } from '@/lib/cwaKey';
import { taipeiDate } from '@/lib/cwaWeather';
import { refreshWeather, type RefreshResult } from '@/lib/weatherService';
import { useSettingsStore } from '@/store/settingsStore';
import type { WeatherDay } from '@/types/models';
import { useWeatherDeps } from './WeatherContext';

export type WeatherError = Exclude<RefreshResult['status'], 'ok' | 'fresh' | 'noKey'>;

export interface WeatherState {
  county: string;
  hasKey: boolean;
  /** undefined = 還沒讀到快取 */
  days: WeatherDay[] | undefined;
  today: string;
  /** 正在向氣象署抓資料 */
  loading: boolean;
  /** 下拉更新中 */
  refreshing: boolean;
  error: WeatherError | null;
  refresh: () => void;
}

export function useWeather(): WeatherState {
  const { repository, fetcher, now } = useWeatherDeps();
  const county = useSettingsStore(s => s.county);
  const apiKey = effectiveCwaKey(useSettingsStore(s => s.cwaApiKey));
  const [days, setDays] = useState<WeatherDay[]>();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<WeatherError | null>(null);
  // 切換縣市或授權碼後，丟掉前一次還沒回來的結果
  const runId = useRef(0);

  const run = useCallback(
    async (force: boolean) => {
      const id = ++runId.current;
      const alive = () => id === runId.current;
      try {
        const cachedDays = await repository.list(county);
        if (!alive()) return;
        setDays(cachedDays);
        if (!apiKey.trim()) return;
        setLoading(true);
        const result = await refreshWeather({ repo: repository, fetcher, county, apiKey, now: now(), force });
        if (!alive()) return;
        if (result.status === 'ok') setDays(await repository.list(county));
        if (!alive()) return;
        setError(result.status === 'ok' || result.status === 'fresh' || result.status === 'noKey' ? null : result.status);
      } catch (e) {
        console.warn('讀取天氣失敗', e);
        if (alive()) setError('badResponse');
      } finally {
        if (alive()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [repository, fetcher, now, county, apiKey],
  );

  useEffect(() => {
    setDays(undefined);
    setError(null);
    run(false);
  }, [run]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    run(true);
  }, [run]);

  return {
    county,
    hasKey: apiKey.trim() !== '',
    days,
    today: taipeiDate(now()),
    loading,
    refreshing,
    error,
    refresh,
  };
}
