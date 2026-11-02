import { useItemsVersion } from '@/db/ItemRepositoryContext';
import type { ItemInput, ItemRepository } from '@/db/itemRepository';
import type { Item } from '@/types/models';
import { deletePhotos, savePhoto } from './photoStorage';

/** keep：照片不變；replace：換成新選的照片（暫存 URI）；remove：刪掉照片 */
export type PhotoChange = { kind: 'keep' } | { kind: 'replace'; uri: string } | { kind: 'remove' };

const notifyChanged = () => useItemsVersion.getState().bump();

/**
 * 新增或修改單品並處理照片檔：新照片先複製進 App 資料夾，存檔成功後才刪舊照片。
 * 第 3 階段接上去背後，imageUri 會改成去背結果，originalUri 保留原圖。
 */
export async function saveItem(
  repo: ItemRepository,
  existing: Item | null,
  input: ItemInput,
  photo: PhotoChange,
): Promise<Item | null> {
  let photos = { imageUri: existing?.imageUri ?? null, originalUri: existing?.originalUri ?? null };
  if (photo.kind === 'replace') {
    const saved = savePhoto(photo.uri);
    photos = { imageUri: saved, originalUri: saved };
  } else if (photo.kind === 'remove') {
    photos = { imageUri: null, originalUri: null };
  }

  const data: ItemInput = { ...input, ...photos };
  let result: Item | null;
  try {
    result = existing ? await repo.update(existing.id, data) : await repo.create(data);
  } catch (e) {
    if (photo.kind === 'replace') deletePhotos([photos.imageUri]);
    throw e;
  }

  if (existing && photo.kind !== 'keep') deletePhotos([existing.imageUri, existing.originalUri]);
  notifyChanged();
  return result;
}

export async function moveItemToTrash(repo: ItemRepository, id: string): Promise<void> {
  await repo.moveToTrash(id);
  notifyChanged();
}

export async function restoreItem(repo: ItemRepository, id: string): Promise<void> {
  await repo.restore(id);
  notifyChanged();
}

export async function purgeItem(repo: ItemRepository, id: string): Promise<void> {
  const removed = await repo.purge(id);
  if (removed) deletePhotos([removed.imageUri, removed.originalUri]);
  notifyChanged();
}
