import { useItemsVersion } from '@/db/ItemRepositoryContext';
import type { OutfitInput, OutfitRepository } from '@/db/outfitRepository';
import type { Item, Outfit } from '@/types/models';
import { deletePhotos } from './photoStorage';

// 穿搭變動會改到單品的「最近使用」，所以和單品共用同一個版本號，讓服裝牆與穿搭畫面一起重新讀取
const notifyChanged = () => useItemsVersion.getState().bump();
const deletePhotosOf = (items: Item[]) => deletePhotos(items.flatMap(i => [i.imageUri, i.originalUri]));

/** 新增（id 為 null）或修改穿搭；日期必填，不合法時丟 OutfitValidationError */
export async function saveOutfit(repo: OutfitRepository, id: string | null, input: OutfitInput): Promise<Outfit | null> {
  if (id === null) {
    const created = await repo.create(input);
    notifyChanged();
    return created;
  }
  const result = await repo.update(id, input);
  if (result) deletePhotosOf(result.purged);
  notifyChanged();
  return result?.outfit ?? null;
}

export async function deleteOutfit(repo: OutfitRepository, id: string): Promise<void> {
  deletePhotosOf(await repo.delete(id));
  notifyChanged();
}
