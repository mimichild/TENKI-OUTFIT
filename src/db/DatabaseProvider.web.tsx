import type { ReactNode } from 'react';
import { newId, nowIso } from '@/lib/ids';
import { ItemRepositoryProvider } from './ItemRepositoryContext';
import { createMemoryDatabase } from './memoryItemRepository';
import { createMemoryWeatherRepository } from './memoryWeatherRepository';
import { OutfitRepositoryProvider } from './OutfitRepositoryContext';
import { WeatherProvider } from './WeatherContext';

// Web 預覽只用來看 UI，不開本機資料庫；單品、穿搭與天氣快取放記憶體，重新整理就清空
export const DB_NAME = '';

const { items, outfits } = createMemoryDatabase({ now: nowIso, newId });
const weather = createMemoryWeatherRepository();

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return (
    <ItemRepositoryProvider repository={items}>
      <OutfitRepositoryProvider repository={outfits}>
        <WeatherProvider repository={weather}>{children}</WeatherProvider>
      </OutfitRepositoryProvider>
    </ItemRepositoryProvider>
  );
}
