import { useEffect, useState } from 'react';
import type { Item } from '@/types/models';
import type { PieceShape } from './outfitLayout';
import { measurePhoto } from './photoBounds';

/** 量測單品照片的範圍；undefined = 量測中 */
export function usePieceShapes(items: Item[] | undefined): ReadonlyMap<string, PieceShape | null> | undefined {
  const key = items ? items.map(i => `${i.id}:${i.imageUri ?? ''}`).join('|') : null;
  const [result, setResult] = useState<{ key: string; shapes: Map<string, PieceShape | null> }>();
  useEffect(() => {
    if (key === null || !items) return;
    let alive = true;
    Promise.all(items.map(async i => [i.id, await measurePhoto(i.imageUri)] as const)).then(entries => {
      if (alive) setResult({ key, shapes: new Map(entries) });
    });
    return () => {
      alive = false;
    };
    // items 以 key 代表內容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return result && result.key === key ? result.shapes : undefined;
}
