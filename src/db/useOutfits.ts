import { useEffect, useState } from 'react';
import type { Outfit } from '@/types/models';
import { useItemsVersion } from './ItemRepositoryContext';
import { useOutfitRepository } from './OutfitRepositoryContext';
import type { OutfitRepository } from './outfitRepository';

function useOutfitQuery<T>(load: (repo: OutfitRepository) => Promise<T>, key: string): T | undefined {
  const repo = useOutfitRepository();
  const version = useItemsVersion(s => s.version);
  const [result, setResult] = useState<{ key: string; value: T }>();
  useEffect(() => {
    let alive = true;
    load(repo)
      .then(value => alive && setResult({ key, value }))
      .catch(e => console.warn('讀取穿搭失敗', e));
    return () => { alive = false; };
    // load 每次 render 都是新函式；以 key 代表查詢內容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, version, key]);
  return result?.key === key ? result.value : undefined;
}

/** undefined = 讀取中，null = 找不到 */
export const useOutfit = (id: string): Outfit | null | undefined => useOutfitQuery(r => r.get(id), `outfit:${id}`);

/** from ~ to（含兩端）；undefined = 讀取中 */
export const useOutfitsInRange = (from: string, to: string): Outfit[] | undefined =>
  useOutfitQuery(r => r.listInRange(from, to), `range:${from}:${to}`);
