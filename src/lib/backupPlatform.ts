import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { listContents, unzip, zip } from 'react-native-zip-archive';
import TenkiFileExport from '../../modules/tenki-file-export';
import type { BackupFiles } from './backupService';

/** 手機版：檔案與 zip 操作、分享、選資料夾、選檔。Web 版見 backupPlatform.web.ts */
export const backupSupported = true;

const WORK_DIR = 'backup-work';
const EXPORT_DIR = 'backup-export';

/** react-native-zip-archive 要的是檔案路徑，不是 file:// URI */
export function toPath(uri: string): string {
  if (!uri.startsWith('file://')) return uri;
  const raw = uri.slice('file://'.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    // 沒有編碼的 %（不是 %XX）會讓 decodeURIComponent 丟例外；原樣使用
    return raw;
  }
}

const trimSlash = (uri: string) => uri.replace(/\/+$/, '');

function ensureParent(uri: string): void {
  const parent = new File(uri).parentDirectory;
  if (!parent.exists) parent.create({ idempotent: true, intermediates: true });
}

export const backupFiles: BackupFiles = {
  workDir() {
    const dir = new Directory(Paths.cache, WORK_DIR, randomUUID());
    dir.create({ idempotent: true, intermediates: true });
    return trimSlash(dir.uri);
  },
  remove(uri) {
    try {
      const info = Paths.info(uri);
      if (!info.exists) return;
      if (info.isDirectory) new Directory(uri).delete();
      else new File(uri).delete();
    } catch (e) {
      console.warn('刪除暫存檔失敗', uri, e);
    }
  },
  exists: uri => new File(uri).exists,
  writeText(uri, text) {
    ensureParent(uri);
    new File(uri).write(text);
  },
  readText: uri => new File(uri).text(),
  async copy(from, to) {
    ensureParent(to);
    await copyAsync({ from, to });
  },
  async zip(dir, target) {
    ensureParent(target);
    await zip(toPath(dir), toPath(target));
  },
  async listZip(source) {
    const entries = await listContents(toPath(source));
    return entries.filter(e => !e.isDirectory).map(e => ({ path: e.path, size: e.size }));
  },
  async unzip(source, dir, entries) {
    await unzip(toPath(source), toPath(dir), { entries });
  },
  exportTarget(fileName) {
    const dir = new Directory(Paths.cache, EXPORT_DIR);
    if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
    return new File(dir, fileName).uri;
  },
  freeSpace: () => Paths.availableDiskSpace,
};

export async function shareBackup(uri: string, dialogTitle: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType: 'application/zip', UTI: 'public.zip-archive', dialogTitle });
}

/** Android 才有「存到資料夾」（iOS 的分享選單有「儲存到檔案」） */
export const canSaveToFolder = Platform.OS === 'android' && TenkiFileExport !== null;

const isCancel = (e: unknown) =>
  e instanceof Error && ((e as { code?: string }).code === 'ERR_PICKER_CANCELLED' || /cancel/i.test(e.message));

/** 選資料夾後串流複製過去，回傳實際檔名（同名時系統會改名）；使用者取消回傳 null */
export async function saveBackupToFolder(uri: string, fileName: string): Promise<string | null> {
  if (!TenkiFileExport) throw new Error('save to folder is not supported');
  let dir: Awaited<ReturnType<typeof Directory.pickDirectoryAsync>>;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
  const dest = dir.createFile(fileName, 'application/zip');
  // 原生端失敗時會刪掉建好的檔案，資料夾裡不會留下壞掉的備份
  await TenkiFileExport.copyToContentUriAsync(uri, dest.uri);
  return displayName(dest.uri) ?? fileName;
}

/** content://…/document/primary%3ADownload%2Fx%20(1).zip → x (1).zip；看不出來時回傳 null */
export function displayName(contentUri: string): string | null {
  try {
    const name = decodeURIComponent(contentUri).split(/[/:]/).pop() ?? '';
    return name.endsWith('.zip') ? name : null;
  } catch {
    return null;
  }
}

/** 選備份檔（系統會複製到 App 的暫存資料夾）；取消回傳 null */
export async function pickBackupFile(): Promise<string | null> {
  // 不限制檔案類型：Google Drive 等來源的 zip 類型標示不一，選錯的檔案由 prepareImport 擋下
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}
