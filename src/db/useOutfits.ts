import type { Outfit } from '@/types/models';
import { useItemsVersion } from './ItemRepositoryContext';
import { useOutfitRepository } from './OutfitRepositoryContext';
import type { OutfitRepository } from './outfitRepository';
import { useQuery, type QueryResult } from './useQuery';

function useOutfitQueryBase<T>(load: (repo: OutfitRepository) => Promise<T>, key: string): QueryResult<T> {
  const repo = useOutfitRepository();
  const version = useItemsVersion(s => s.version);
  return useQuery(() => load(repo), key, [repo, version]);
}

/** value：null = 找不到 */
export const useOutfitQuery = (id: string): QueryResult<Outfit | null> =>
  useOutfitQueryBase(r => r.get(id), `outfit:${id}`);
/** from ~ to（含兩端） */
export const useOutfitsInRangeQuery = (from: string, to: string): QueryResult<Outfit[]> =>
  useOutfitQueryBase(r => r.listInRange(from, to), `range:${from}:${to}`);

/** undefined = 讀取中，null = 找不到 */
export const useOutfit = (id: string): Outfit | null | undefined => useOutfitQuery(id).value;
/** from ~ to（含兩端）；undefined = 讀取中 */
export const useOutfitsInRange = (from: string, to: string): Outfit[] | undefined => useOutfitsInRangeQuery(from, to).value;
