import { useItemsVersion } from '@/db/ItemRepositoryContext';
import type { ItemInput, ItemRepository } from '@/db/itemRepository';
import type { Item } from '@/types/models';
import { deletePhotos, savePhoto } from './photoStorage';

/**
 * keep：照片不變；remove：刪掉照片；
 * replace：換成新照片（暫存 URI）。originalUri 是原圖，imageUri 是顯示用的去背圖；沒去背時兩者相同
 */
export type PhotoChange =
  | { kind: 'keep' }
  | { kind: 'replace'; originalUri: string; imageUri: string }
  | { kind: 'remove' };

const notifyChanged = () => useItemsVersion.getState().bump();

/** 複製原圖與去背圖；任一張失敗就回收已複製的檔案再丟出錯誤 */
async function copyNewPhotos(photo: { originalUri: string; imageUri: string }) {
  const originalUri = await savePhoto(photo.originalUri);
  if (photo.imageUri === photo.originalUri) return { imageUri: originalUri, originalUri };
  try {
    return { imageUri: await savePhoto(photo.imageUri), originalUri };
  } catch (e) {
    deletePhotos([originalUri]);
    throw e;
  }
}

/** 新增或修改單品並處理照片檔：新照片先複製進 App 資料夾，存檔成功後才刪舊照片 */
export async function saveItem(
  repo: ItemRepository,
  existing: Item | null,
  input: ItemInput,
  photo: PhotoChange,
): Promise<Item | null> {
  let photos: { imageUri: string | null; originalUri: string | null } = {
    imageUri: existing?.imageUri ?? null,
    originalUri: existing?.originalUri ?? null,
  };
  if (photo.kind === 'replace') {
    photos = await copyNewPhotos(photo);
  } else if (photo.kind === 'remove') {
    photos = { imageUri: null, originalUri: null };
  }

  const data: ItemInput = { ...input, ...photos };
  let result: Item | null;
  try {
    result = existing ? await repo.update(existing.id, data) : await repo.create(data);
  } catch (e) {
    if (photo.kind === 'replace') deletePhotos([photos.imageUri, photos.originalUri]);
    throw e;
  }

  if (result === null) {
    // 單品已不存在：回收剛複製的新照片，舊照片不動
    if (photo.kind === 'replace') deletePhotos([photos.imageUri, photos.originalUri]);
    return null;
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
