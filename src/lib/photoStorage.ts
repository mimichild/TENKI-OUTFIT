import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * DB 只存相對路徑（例如 `photos/<uuid>.jpg`），顯示時才用 resolvePhotoUri 組成完整路徑。
 * iOS 在 App 更新、從備份還原時，Documents 的絕對路徑可能改變，存絕對路徑會讓照片全部失效。
 */
const PHOTO_DIR = 'photos';
const OWNED = /^photos\/[\w-]+\.[a-z0-9]+$/;

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

/** 把選到/拍到的照片（多半在暫存資料夾，系統會清掉）複製到 App 自己的資料夾，回傳相對路徑 */
export function savePhoto(sourceUri: string): string {
  const name = `${randomUUID()}.${extensionOf(sourceUri)}`;
  new File(sourceUri).copy(new File(photoDir(), name));
  return `${PHOTO_DIR}/${name}`;
}

/** 刪除 App 自己存的照片；不是 photos/ 底下的相對路徑一律不碰 */
export function deletePhotos(stored: (string | null | undefined)[]): void {
  for (const path of new Set(stored)) {
    if (!path || !OWNED.test(path)) continue;
    try {
      const file = new File(Paths.document, path);
      if (file.exists) file.delete();
    } catch (e) {
      console.warn('刪除照片失敗', path, e);
    }
  }
}
