import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { create } from 'zustand';
import { TRASH_RETENTION_DAYS } from '@/constants/options';
import { clearCutoutCache, deletePhotos } from '@/lib/photoStorage';
import type { ItemRepository } from './itemRepository';

const ItemRepositoryContext = createContext<ItemRepository | null>(null);

/** 每次新增/修改/刪除後 +1，讓各畫面重新讀取 */
export const useItemsVersion = create<{ version: number; bump: () => void }>(set => ({
  version: 0,
  bump: () => set(s => ({ version: s.version + 1 })),
}));

export function ItemRepositoryProvider({ repository, children }: { repository: ItemRepository; children: ReactNode }) {
  useEffect(() => {
    clearCutoutCache();
    repository
      .purgeExpired(TRASH_RETENTION_DAYS)
      .then(removed => {
        if (removed.length === 0) return;
        deletePhotos(removed.flatMap(i => [i.imageUri, i.originalUri]));
        useItemsVersion.getState().bump();
      })
      .catch(e => console.warn('清除過期暫存區失敗', e));
  }, [repository]);

  return <ItemRepositoryContext.Provider value={repository}>{children}</ItemRepositoryContext.Provider>;
}

export function useItemRepository(): ItemRepository {
  const repo = useContext(ItemRepositoryContext);
  if (!repo) throw new Error('useItemRepository 必須在 ItemRepositoryProvider 裡使用');
  return repo;
}
