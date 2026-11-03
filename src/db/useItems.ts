import type { Item } from '@/types/models';
import { useItemRepository, useItemsVersion } from './ItemRepositoryContext';
import type { ItemRepository } from './itemRepository';
import { useQuery, type QueryResult } from './useQuery';

function useRepoQuery<T>(load: (repo: ItemRepository) => Promise<T>, key: string): QueryResult<T> {
  const repo = useItemRepository();
  const version = useItemsVersion(s => s.version);
  return useQuery(() => load(repo), key, [repo, version]);
}

export const useActiveItemsQuery = (): QueryResult<Item[]> => useRepoQuery(r => r.list(), 'active');
export const useTrashItemsQuery = (): QueryResult<Item[]> => useRepoQuery(r => r.listTrash(), 'trash');
/** value：null = 找不到或已在暫存區 */
export const useItemQuery = (id: string): QueryResult<Item | null> =>
  useRepoQuery(async r => {
    const item = await r.get(id);
    return item && item.deletedAt === null ? item : null;
  }, `item:${id}`);

/** undefined = 讀取中 */
export const useActiveItems = (): Item[] | undefined => useActiveItemsQuery().value;
export const useTrashItems = (): Item[] | undefined => useTrashItemsQuery().value;
/** undefined = 讀取中，null = 找不到或已在暫存區 */
export const useItem = (id: string): Item | null | undefined => useItemQuery(id).value;
