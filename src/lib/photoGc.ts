import { isOwnedPhotoPath } from './photoPath';

/** photos/ 裡的一個檔案；modifiedAt 是毫秒，讀不到時為 null */
export interface PhotoFile {
  path: string;
  modifiedAt: number | null;
}

/** 新增單品時照片先存進 photos/、才寫 DB；1 小時內的檔案一律不刪，避免刪到正在存的單品 */
export const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** 沒有任何單品（含暫存區、已封存）參照、且超過 1 小時的 App 照片 */
export function orphanPhotos(files: PhotoFile[], used: Iterable<string>, now: number): string[] {
  const usedSet = new Set(used);
  return files
    .filter(f => isOwnedPhotoPath(f.path) && !usedSet.has(f.path))
    .filter(f => f.modifiedAt !== null && now - f.modifiedAt > ORPHAN_MIN_AGE_MS)
    .map(f => f.path);
}
