import type { BackupStore } from '@/db/sqliteBackupStore';
import {
  buildManifest,
  filterNewRows,
  MANIFEST_NAME,
  parseManifest,
  photoPathsOf,
  remapPhotoPaths,
  summarizeBackup,
  type BackupManifest,
  type BackupSettings,
} from './backupFormat';

/** 檔案與 zip 操作（手機版用 expo-file-system + react-native-zip-archive；測試用假的） */
export interface BackupFiles {
  /** 新的暫存工作資料夾（uri）；裡面的檔案用 `${dir}/${相對路徑}` 存取 */
  workDir(): string;
  /** 刪除檔案或資料夾；不存在時不做事 */
  remove(uri: string): void;
  exists(uri: string): boolean;
  writeText(uri: string, text: string): void;
  readText(uri: string): Promise<string>;
  /** 複製檔案；目的地的資料夾不存在時建立 */
  copy(from: string, to: string): Promise<void>;
  zip(dir: string, target: string): Promise<void>;
  /** zip 裡的檔案路徑；不是 zip 時丟例外 */
  listZip(zip: string): Promise<string[]>;
  /** 只解出指定的檔案（路徑由 listZip 取得） */
  unzip(zip: string, dir: string, entries: string[]): Promise<void>;
  /** 匯出的 zip 要放的位置（暫存資料夾） */
  exportTarget(fileName: string): string;
}

export interface BackupPhotos {
  /** DB 裡的相對路徑 → 檔案 uri */
  uri(rel: string): string;
  /** 複製進 App 的照片資料夾（新檔名），回傳相對路徑 */
  save(sourceUri: string): Promise<string>;
  remove(rels: string[]): void;
  /** 照片資料夾裡的全部檔案（相對路徑） */
  list(): string[];
}

export interface BackupDeps {
  store: BackupStore;
  files: BackupFiles;
  photos: BackupPhotos;
  settings: { get(): BackupSettings; apply(s: BackupSettings): void };
  /** 匯入後通知畫面重新讀取 */
  notify(): void;
  now(): string;
  appVersion: string;
  schemaVersion: number;
}

export type ImportMode = 'replace' | 'merge';

export type PreparedImport = {
  ok: true;
  zipUri: string;
  manifest: BackupManifest;
  summary: ReturnType<typeof summarizeBackup>;
  /** zip 裡的檔案 */
  entries: ReadonlySet<string>;
};
export type PrepareResult = PreparedImport | { ok: false; reason: 'notBackup' | 'newerVersion' | 'corrupt' };

const TAIPEI_OFFSET_MS = 8 * 3_600_000;

/** tenki-outfit-backup-YYYYMMDD-HHmm.zip（台灣時間） */
export function backupFileName(nowIso: string): string {
  const s = new Date(new Date(nowIso).getTime() + TAIPEI_OFFSET_MS).toISOString();
  return `tenki-outfit-backup-${s.slice(0, 10).replaceAll('-', '')}-${s.slice(11, 13)}${s.slice(14, 16)}.zip`;
}

const join = (dir: string, rel: string) => `${dir}/${rel}`;

export async function exportBackup(deps: BackupDeps): Promise<{ uri: string; fileName: string }> {
  const { store, files, photos } = deps;
  const data = await store.dump();
  const exportedAt = deps.now();
  const manifest = buildManifest(data, deps.settings.get(), {
    schemaVersion: deps.schemaVersion, appVersion: deps.appVersion, exportedAt,
  });
  const work = files.workDir();
  try {
    files.writeText(join(work, MANIFEST_NAME), JSON.stringify(manifest));
    for (const rel of photoPathsOf(data)) {
      const src = photos.uri(rel);
      // 照片檔不見了（例如被系統清掉）就略過；匯入時該單品照片會是空的
      if (files.exists(src)) await files.copy(src, join(work, rel));
    }
    const fileName = backupFileName(exportedAt);
    const uri = files.exportTarget(fileName);
    files.remove(uri);
    await files.zip(work, uri);
    return { uri, fileName };
  } finally {
    files.remove(work);
  }
}

export async function prepareImport(deps: Pick<BackupDeps, 'files' | 'schemaVersion'>, zipUri: string): Promise<PrepareResult> {
  const { files } = deps;
  let entries: string[];
  try {
    entries = await files.listZip(zipUri);
  } catch {
    return { ok: false, reason: 'notBackup' };
  }
  if (!entries.includes(MANIFEST_NAME)) return { ok: false, reason: 'notBackup' };
  const work = files.workDir();
  let text: string;
  try {
    await files.unzip(zipUri, work, [MANIFEST_NAME]);
    text = await files.readText(join(work, MANIFEST_NAME));
  } catch {
    return { ok: false, reason: 'corrupt' };
  } finally {
    files.remove(work);
  }
  const parsed = parseManifest(text, { schemaVersion: deps.schemaVersion });
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    zipUri,
    manifest: parsed.manifest,
    summary: summarizeBackup(parsed.manifest.data),
    entries: new Set(entries),
  };
}

/**
 * 匯入。順序：解出需要的照片 → 複製成新檔名 → 一個交易寫入 DB → 刪掉沒有單品用到的照片。
 * 任何一步失敗：刪掉這次複製的照片，DB 不動（交易回復），原本的照片不動。
 * 回傳寫入的單品、穿搭數（合併時只算新加入的）。
 */
export async function applyImport(
  deps: BackupDeps,
  prepared: PreparedImport,
  mode: ImportMode,
): Promise<{ items: number; outfits: number }> {
  const { store, files, photos } = deps;
  const { manifest, entries, zipUri } = prepared;
  const data = mode === 'merge' ? filterNewRows(manifest.data, await store.existingKeys()) : manifest.data;
  // 只解出這次要用的照片；manifest 裡的路徑都已檢查過是 photos/<檔名>
  const needed = photoPathsOf(data).filter(rel => entries.has(rel));
  const work = files.workDir();
  const copied = new Map<string, string>();
  let result: { items: number; outfits: number };
  try {
    if (needed.length > 0) await files.unzip(zipUri, work, needed);
    for (const rel of needed) copied.set(rel, await photos.save(join(work, rel)));
    const remapped = remapPhotoPaths(data, copied);
    if (mode === 'replace') {
      await store.replaceAll(remapped);
      result = { items: remapped.items.length, outfits: remapped.outfits.length };
    } else {
      const counts = await store.merge(remapped);
      result = { items: counts.items, outfits: counts.outfits };
    }
  } catch (e) {
    photos.remove([...copied.values()]);
    throw e;
  } finally {
    files.remove(work);
  }

  // 寫入成功之後的整理，失敗也不影響匯入結果
  try {
    const used = new Set(photoPathsOf(await store.dump()));
    photos.remove(photos.list().filter(rel => !used.has(rel)));
  } catch (e) {
    console.warn('清除沒用到的照片失敗', e);
  }
  if (mode === 'replace') deps.settings.apply(manifest.settings);
  deps.notify();
  return result;
}
