import { SQLiteProvider } from 'expo-sqlite';
import type { ReactNode } from 'react';
import { migrate } from './migrations';

export const DB_NAME = 'tenki-outfit.db';

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
      {children}
    </SQLiteProvider>
  );
}
