import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { TRASH_RETENTION_DAYS } from '@/constants/options';
import { taipeiDate } from '@/lib/cwaWeather';
import { nowIso } from '@/lib/ids';
import { orphanPhotos } from '@/lib/photoGc';
import { clearBackupTemp, clearCutoutCache, deletePhotos, listPhotoFiles } from '@/lib/photoStorage';
import type { ItemRepository } from './itemRepository';

const ItemRepositoryContext = createContext<ItemRepository | null>(null);

/** 每次新增/修改/刪除後 +1，讓各畫面重新讀取 */
export const useItemsVersion = create<{ version: number; bump: () => void }>(set => ({
  version: 0,
  bump: () => set(s => ({ version: s.version + 1 })),
}));

/** 清除暫存區過期的單品（刪掉照片檔），並通知畫面重新讀取 */
async function purgeExpiredTrash(repository: ItemRepository): Promise<void> {
  try {
    const removed = await repository.purgeExpired(TRASH_RETENTION_DAYS);
    deletePhotos(removed.flatMap(i => [i.imageUri, i.originalUri]));
  } finally {
    // 只封存、沒有真正刪除時，穿搭與暫存區也可能變了；一律通知畫面重新讀取
    useItemsVersion.getState().bump();
  }
}

/** photos/ 裡沒有任何單品參照的舊照片（見 orphanPhotos） */
async function deleteOrphanPhotos(repository: ItemRepository, now: string): Promise<void> {
  const files = listPhotoFiles();
  if (files.length === 0) return;
  const orphans = orphanPhotos(files, await repository.photoPaths(), Date.parse(now));
  if (orphans.length > 0) deletePhotos(orphans);
}

/**
 * App 啟動時：清暫存資料夾 → 過期清除 → 孤兒照片清除。每一步失敗只記錄，不影響使用。
 * 此時不會有進行中的去背或匯入。
 */
export async function runStartupCleanup(repository: ItemRepository, now: string): Promise<void> {
  clearCutoutCache();
  clearBackupTemp();
  await purgeExpiredTrash(repository).catch(e => console.warn('清除過期暫存區失敗', e));
  await deleteOrphanPhotos(repository, now).catch(e => console.warn('清除用不到的照片失敗', e));
}

export function ItemRepositoryProvider({ repository, now = nowIso, children }: {
  repository: ItemRepository;
  /** 測試用；預設為現在時間 */
  now?: () => string;
  children: ReactNode;
}) {
  useEffect(() => {
    // 上次清除過期暫存區的台灣日期；App 一直開著跨過午夜、從背景回來時再清一次
    let lastPurgeDay = taipeiDate(now());
    runStartupCleanup(repository, now());
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      const today = taipeiDate(now());
      if (today === lastPurgeDay) return;
      lastPurgeDay = today;
      purgeExpiredTrash(repository).catch(e => console.warn('清除過期暫存區失敗', e));
    });
    return () => sub.remove();
    // now 只在測試替換；以 repository 為準
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository]);

  return <ItemRepositoryContext.Provider value={repository}>{children}</ItemRepositoryContext.Provider>;
}

export function useItemRepository(): ItemRepository {
  const repo = useContext(ItemRepositoryContext);
  if (!repo) throw new Error('useItemRepository 必須在 ItemRepositoryProvider 裡使用');
  return repo;
}
