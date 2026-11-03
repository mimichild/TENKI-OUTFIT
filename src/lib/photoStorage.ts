import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { copyAsync, moveAsync } from 'expo-file-system/legacy';
import { isOwnedPhotoPath } from './photoPath';

/**
 * DB 只存相對路徑（例如 `photos/<uuid>.jpg`），顯示時才用 resolvePhotoUri 組成完整路徑。
 * iOS 在 App 更新、從備份還原時，Documents 的絕對路徑可能改變，存絕對路徑會讓照片全部失效。
 */
const PHOTO_DIR = 'photos';

function photoDir(): Directory {
  const dir = new Directory(Paths.document, PHOTO_DIR);
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

function extensionOf(uri: string): string {
  const match = /\.([a-z0-9]{2,5})(?:\?.*)?$/i.exec(uri.split('/').pop() ?? '');
  return match ? match[1].toLowerCase() : 'jpg';
}

/** 相對路徑 → 目前可用的完整 URI；暫存檔或其他完整 URI 原樣回傳 */
export function resolvePhotoUri(stored: string | null): string | null {
  if (!stored) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(stored)) return stored;
  return new File(Paths.document, stored).uri;
}

/**
 * 把選到/拍到的照片或去背結果（都在暫存資料夾，系統會清掉）複製到 App 自己的資料夾，回傳相對路徑。
 * 用非同步複製，避免大張照片卡住畫面（新版 File.copy 是同步的）。保留副檔名，去背 PNG 才不會失去透明背景。
 */
export async function savePhoto(sourceUri: string): Promise<string> {
  const name = `${randomUUID()}.${extensionOf(sourceUri)}`;
  await copyAsync({ from: sourceUri, to: new File(photoDir(), name).uri });
  return `${PHOTO_DIR}/${name}`;
}

/** 匯入備份用：把解壓出來的照片「搬」進照片資料夾（同一個磁碟只是改名，不多佔空間），回傳相對路徑 */
export async function adoptPhoto(sourceUri: string): Promise<string> {
  const name = `${randomUUID()}.${extensionOf(sourceUri)}`;
  await moveAsync({ from: sourceUri, to: new File(photoDir(), name).uri });
  return `${PHOTO_DIR}/${name}`;
}

/** 刪除 App 自己存的照片；不是 photos/ 底下的相對路徑一律不碰 */
export function deletePhotos(stored: (string | null | undefined)[]): void {
  for (const path of new Set(stored)) {
    if (!isOwnedPhotoPath(path)) continue;
    try {
      const file = new File(Paths.document, path);
      if (file.exists) file.delete();
    } catch (e) {
      console.warn('刪除照片失敗', path, e);
    }
  }
}

/** 備份匯出／匯入留在暫存資料夾的檔案（含選檔時系統複製來的 DocumentPicker/）；App 啟動時呼叫 */
export function clearBackupTemp(): void {
  for (const name of ['backup-work', 'backup-export', 'DocumentPicker']) {
    try {
      const dir = new Directory(Paths.cache, name);
      if (dir.exists) dir.delete();
    } catch (e) {
      console.warn('清除備份暫存檔失敗', name, e);
    }
  }
}

/**
 * 清掉去背／編輯器留在暫存資料夾的檔案（取消、被新照片取代、已複製進 photos/ 的都不再需要）。
 * App 啟動時呼叫，此時不會有進行中的去背。
 */
export function clearCutoutCache(): void {
  try {
    const dir = new Directory(Paths.cache, 'bg-removal');
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('清除去背暫存檔失敗', e);
  }
}
