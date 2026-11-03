import { createContext, useContext, type ReactNode } from 'react';
import type { BackupStore } from './sqliteBackupStore';

/** Web 預覽沒有備份功能，值為 null */
const BackupStoreContext = createContext<BackupStore | null>(null);

export function BackupStoreProvider({ store, children }: { store: BackupStore; children: ReactNode }) {
  return <BackupStoreContext.Provider value={store}>{children}</BackupStoreContext.Provider>;
}

export function useBackupStore(): BackupStore | null {
  return useContext(BackupStoreContext);
}
