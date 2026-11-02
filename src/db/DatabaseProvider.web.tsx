import type { ReactNode } from 'react';
import { newId, nowIso } from '@/lib/ids';
import { ItemRepositoryProvider } from './ItemRepositoryContext';
import { createMemoryItemRepository } from './memoryItemRepository';
import { createMemoryWeatherRepository } from './memoryWeatherRepository';
import { WeatherProvider } from './WeatherContext';

// Web 預覽只用來看 UI，不開本機資料庫；單品與天氣快取放記憶體，重新整理就清空
export const DB_NAME = '';

const items = createMemoryItemRepository({ now: nowIso, newId });
const weather = createMemoryWeatherRepository();

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return (
    <ItemRepositoryProvider repository={items}>
      <WeatherProvider repository={weather}>{children}</WeatherProvider>
    </ItemRepositoryProvider>
  );
}
