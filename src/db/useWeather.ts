import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { effectiveCwaKey } from '@/lib/cwaKey';
import { taipeiDate } from '@/lib/cwaWeather';
import { refreshWeather, type RefreshResult } from '@/lib/weatherService';
import { useSettingsStore } from '@/store/settingsStore';
import type { WeatherDay } from '@/types/models';
import { useWeatherDeps } from './WeatherContext';

/** storage = 本機快取讀寫失敗（不是氣象署的問題） */
export type WeatherError = Exclude<RefreshResult['status'], 'ok' | 'fresh' | 'noKey' | 'aborted'> | 'storage';

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

const TAIPEI_OFFSET_MS = 8 * 3_600_000;

/** 距離下一個台灣時間午夜的毫秒數 */
function msUntilTaipeiMidnight(iso: string): number {
  const local = new Date(iso).getTime() + TAIPEI_OFFSET_MS;
  return 86_400_000 - (local % 86_400_000);
}

export function useWeather(): WeatherState {
  const { repository, fetcher, now } = useWeatherDeps();
  const county = useSettingsStore(s => s.county);
  const apiKey = effectiveCwaKey(useSettingsStore(s => s.cwaApiKey));
  const [days, setDays] = useState<WeatherDay[]>();
  const [today, setToday] = useState(() => taipeiDate(now()));
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<WeatherError | null>(null);
  // 新的一次讀取開始時取消上一次（換縣市、換授權碼、下拉更新、畫面關掉）
  const current = useRef<AbortController | null>(null);
  const forcing = useRef(false);

  const run = useCallback(
    async (force: boolean) => {
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;
      const alive = () => !controller.signal.aborted;
      forcing.current = force;
      try {
        const cachedDays = await repository.list(county);
        if (!alive()) return;
        setDays(cachedDays);
        if (!apiKey) return;
        setLoading(true);
        const result = await refreshWeather({
          repo: repository, fetcher, county, apiKey, now: now(), force, signal: controller.signal,
        });
        if (!alive() || result.status === 'aborted') return;
        if (result.status === 'ok') setDays(await repository.list(county));
        if (!alive()) return;
        setError(result.status === 'ok' || result.status === 'fresh' || result.status === 'noKey' ? null : result.status);
      } catch (e) {
        console.warn('讀取天氣失敗', e);
        // fetcher 不會丟例外（失敗都用 status 回報），會丟的只有本機快取的讀寫
        if (alive()) setError('storage');
      } finally {
        if (alive()) {
          setLoading(false);
          setRefreshing(false);
          forcing.current = false;
        }
      }
    },
    [repository, fetcher, now, county, apiKey],
  );

  useEffect(() => {
    setDays(undefined);
    setError(null);
    run(false);
    return () => current.current?.abort();
  }, [run]);

  // App 回到前景：更新「今天」，快取過期就重抓（沒過期時 refreshWeather 不會連網）
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      setToday(taipeiDate(now()));
      run(false);
    });
    return () => sub.remove();
  }, [now, run]);

  // App 一直開著跨過午夜時也更新「今天」
  useEffect(() => {
    const timer = setTimeout(() => {
      setToday(taipeiDate(now()));
      run(false);
    }, msUntilTaipeiMidnight(now()) + 1_000);
    return () => clearTimeout(timer);
  }, [now, run, today]);

  const refresh = useCallback(() => {
    // 已經在強制重抓就不要再送一次（所有使用者共用同一組授權碼額度）
    if (forcing.current) return;
    setRefreshing(true);
    run(true);
  }, [run]);

  return { county, hasKey: apiKey !== '', days, today, loading, refreshing, error, refresh };
}
