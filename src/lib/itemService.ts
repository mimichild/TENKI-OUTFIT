import { useItemsVersion } from '@/db/ItemRepositoryContext';
import type { ItemInput, ItemRepository } from '@/db/itemRepository';
import type { Item } from '@/types/models';
import { measurePhoto } from './photoBounds';
import { deletePhotos, resolvePhotoUri, savePhoto } from './photoStorage';

/**
 * keep：照片不變；remove：刪掉照片；
 * replace：換成新照片（暫存 URI）。originalUri 是原圖，imageUri 是顯示用的去背圖；沒去背時兩者相同
 */
export type PhotoChange =
  | { kind: 'keep' }
  | { kind: 'replace'; originalUri: string; imageUri: string }
  | { kind: 'remove' };

const notifyChanged = () => useItemsVersion.getState().bump();

/**
 * 複製原圖與去背圖；任一張失敗就回收已複製的檔案再丟出錯誤。
 * keptOriginal：原圖就是單品已存的照片（重新編輯去背時），直接沿用、不再複製
 */
async function copyNewPhotos(photo: { originalUri: string; imageUri: string }, keptOriginal: string | null) {
  const originalUri = keptOriginal ?? (await savePhoto(photo.originalUri));
  if (photo.imageUri === photo.originalUri) return { imageUri: originalUri, originalUri };
  try {
    return { imageUri: await savePhoto(photo.imageUri), originalUri };
  } catch (e) {
    if (!keptOriginal) deletePhotos([originalUri]);
    throw e;
  }
}

/** 新照片的原圖是否就是單品已存的原圖（沒有另存原圖時是顯示用的照片）；是的話回傳它的相對路徑 */
function storedOriginal(existing: Item | null, originalUri: string): string | null {
  const stored = existing ? existing.originalUri ?? existing.imageUri : null;
  return stored && resolvePhotoUri(stored) === originalUri ? stored : null;
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
  const kept = photo.kind === 'replace' ? storedOriginal(existing, photo.originalUri) : null;
  /** 存檔失敗或單品不見時要回收的新檔（沿用的原圖不算） */
  const newFiles = () => [photos.imageUri, photos.originalUri].filter(p => p !== kept);
  if (photo.kind === 'replace') {
    photos = await copyNewPhotos(photo, kept);
  } else if (photo.kind === 'remove') {
    photos = { imageUri: null, originalUri: null };
  }

  const data: ItemInput = { ...input, ...photos };
  let result: Item | null;
  try {
    result = existing ? await repo.update(existing.id, data) : await repo.create(data);
  } catch (e) {
    if (photo.kind === 'replace') deletePhotos(newFiles());
    throw e;
  }

  if (result === null) {
    // 單品已不存在：回收剛複製的新照片，舊照片不動
    if (photo.kind === 'replace') deletePhotos(newFiles());
    return null;
  }
  if (existing && photo.kind !== 'keep') deletePhotos([existing.imageUri, existing.originalUri].filter(p => p !== kept));
  // 新照片先量好範圍（存進快取），之後打開穿搭畫面就不用等
  if (photo.kind === 'replace') void measurePhoto(photos.imageUri);
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
  // 改為封存（過去穿搭還用到）時不刪照片
  const removed = await repo.purge(id);
  deletePhotos(removed.flatMap(i => [i.imageUri, i.originalUri]));
  notifyChanged();
}
