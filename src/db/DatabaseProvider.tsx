import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useMemo, type ReactNode } from 'react';
import { newId, nowIso } from '@/lib/ids';
import { ItemRepositoryProvider } from './ItemRepositoryContext';
import { migrate } from './migrations';
import { OutfitRepositoryProvider } from './OutfitRepositoryContext';
import { createSqliteItemRepository } from './sqliteItemRepository';
import { createSqliteOutfitRepository } from './sqliteOutfitRepository';
import { createSqliteWeatherRepository } from './sqliteWeatherRepository';
import { WeatherProvider } from './WeatherContext';

export const DB_NAME = 'tenki-outfit.db';

function Repositories({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const items = useMemo(() => createSqliteItemRepository(db, { now: nowIso, newId }), [db]);
  const outfits = useMemo(() => createSqliteOutfitRepository(db, { now: nowIso, newId }), [db]);
  const weather = useMemo(() => createSqliteWeatherRepository(db), [db]);
  return (
    <ItemRepositoryProvider repository={items}>
      <OutfitRepositoryProvider repository={outfits}>
        <WeatherProvider repository={weather}>{children}</WeatherProvider>
      </OutfitRepositoryProvider>
    </ItemRepositoryProvider>
  );
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
      <Repositories>{children}</Repositories>
    </SQLiteProvider>
  );
}
