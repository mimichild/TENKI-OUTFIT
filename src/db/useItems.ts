import { useEffect, useState } from 'react';
import type { Item } from '@/types/models';
import { useItemRepository, useItemsVersion } from './ItemRepositoryContext';
import type { ItemRepository } from './itemRepository';

function useRepoQuery<T>(load: (repo: ItemRepository) => Promise<T>, key: string): T | undefined {
  const repo = useItemRepository();
  const version = useItemsVersion(s => s.version);
  const [result, setResult] = useState<{ key: string; value: T }>();
  useEffect(() => {
    let alive = true;
    load(repo)
      .then(value => alive && setResult({ key, value }))
      .catch(e => console.warn('讀取單品失敗', e));
    return () => { alive = false; };
    // load 每次 render 都是新函式；以 key 代表查詢內容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, version, key]);
  return result?.key === key ? result.value : undefined;
}

/** undefined = 讀取中 */
export const useActiveItems = (): Item[] | undefined => useRepoQuery(r => r.list(), 'active');
export const useTrashItems = (): Item[] | undefined => useRepoQuery(r => r.listTrash(), 'trash');
/** undefined = 讀取中，null = 找不到或已在暫存區 */
export const useItem = (id: string): Item | null | undefined =>
  useRepoQuery(async r => {
    const item = await r.get(id);
    return item && item.deletedAt === null ? item : null;
  }, `item:${id}`);
