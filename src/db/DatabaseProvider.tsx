import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useMemo, type ReactNode } from 'react';
import { newId, nowIso } from '@/lib/ids';
import { ItemRepositoryProvider } from './ItemRepositoryContext';
import { migrate } from './migrations';
import { createSqliteItemRepository } from './sqliteItemRepository';

export const DB_NAME = 'tenki-outfit.db';

function Repositories({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const items = useMemo(() => createSqliteItemRepository(db, { now: nowIso, newId }), [db]);
  return <ItemRepositoryProvider repository={items}>{children}</ItemRepositoryProvider>;
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
      <Repositories>{children}</Repositories>
    </SQLiteProvider>
  );
}
