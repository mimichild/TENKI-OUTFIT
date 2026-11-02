import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

function photoDir(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

function extensionOf(uri: string): string {
  const match = /\.([a-z0-9]{2,5})(?:\?.*)?$/i.exec(uri.split('/').pop() ?? '');
  return match ? match[1].toLowerCase() : 'jpg';
}

/** 把選到/拍到的照片（多半在暫存資料夾，系統會清掉）複製到 App 自己的資料夾 */
export function savePhoto(sourceUri: string): string {
  const dest = new File(photoDir(), `${randomUUID()}.${extensionOf(sourceUri)}`);
  new File(sourceUri).copy(dest);
  return dest.uri;
}

/** 刪除 App 自己存的照片；不是 App 資料夾裡的檔案一律不碰 */
export function deletePhotos(uris: (string | null | undefined)[]): void {
  const prefix = `${photoDir().uri.replace(/\/$/, '')}/`;
  for (const uri of new Set(uris)) {
    if (!uri || !uri.startsWith(prefix)) continue;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch (e) {
      console.warn('刪除照片失敗', uri, e);
    }
  }
}
