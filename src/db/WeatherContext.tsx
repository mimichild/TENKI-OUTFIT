import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { fetchForecast, type FetchForecastResult } from '@/lib/cwaWeather';
import { nowIso } from '@/lib/ids';
import type { WeatherRepository } from './weatherRepository';

export interface WeatherDeps {
  repository: WeatherRepository;
  fetcher: (args: { apiKey: string; county: string; signal?: AbortSignal }) => Promise<FetchForecastResult>;
  now: () => string;
}

const WeatherContext = createContext<WeatherDeps | null>(null);

interface Props extends Partial<Omit<WeatherDeps, 'repository'>> {
  repository: WeatherRepository;
  children: ReactNode;
}

export function WeatherProvider({ repository, fetcher = fetchForecast, now = nowIso, children }: Props) {
  const value = useMemo(() => ({ repository, fetcher, now }), [repository, fetcher, now]);
  return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>;
}

export function useWeatherDeps(): WeatherDeps {
  const deps = useContext(WeatherContext);
  if (!deps) throw new Error('useWeatherDeps 必須在 WeatherProvider 裡使用');
  return deps;
}
