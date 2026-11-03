import type { BackupStore, ImportCounts } from '@/db/sqliteBackupStore';
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
import { isOwnedPhotoPath } from './photoPath';

export interface ZipEntry {
  path: string;
  /** 解壓後的大小（bytes） */
  size: number;
}

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
  /** zip 裡的檔案（不含資料夾）；不是 zip 時丟例外 */
  listZip(zip: string): Promise<ZipEntry[]>;
  /** 只解出指定的檔案（路徑由 listZip 取得） */
  unzip(zip: string, dir: string, entries: string[]): Promise<void>;
  /** 匯出的 zip 要放的位置（暫存資料夾） */
  exportTarget(fileName: string): string;
  /** 手機剩餘空間（bytes） */
  freeSpace(): number;
}

export interface BackupPhotos {
  /** DB 裡的相對路徑 → 檔案 uri */
  uri(rel: string): string;
  /** 把暫存資料夾裡的照片「搬」進 App 的照片資料夾（新檔名），回傳相對路徑 */
  adopt(sourceUri: string): Promise<string>;
  remove(rels: string[]): void;
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
export type PrepareResult =
  | PreparedImport
  | { ok: false; reason: 'notBackup' | 'newerVersion' | 'corrupt' }
  | { ok: false; reason: 'noSpace'; neededMb: number };

/** 另一個匯出／匯入還在進行（例如離開畫面後又回來再按一次） */
export class BackupBusyError extends Error {
  constructor() {
    super('another backup operation is running');
    this.name = 'BackupBusyError';
  }
}

// 匯出、讀取、匯入全部互斥：鎖放在模組層級，不靠畫面元件（畫面卸載再進來是新的元件）
let running = false;
async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  if (running) throw new BackupBusyError();
  running = true;
  try {
    return await fn();
  } finally {
    running = false;
  }
}

const TAIPEI_OFFSET_MS = 8 * 3_600_000;
/** 解壓、搬照片之外再留的空間（DB 寫入、系統） */
const SPACE_MARGIN = 50 * 1024 * 1024;

/** tenki-outfit-backup-YYYYMMDD-HHmm.zip（台灣時間） */
export function backupFileName(nowIso: string): string {
  const s = new Date(new Date(nowIso).getTime() + TAIPEI_OFFSET_MS).toISOString();
  return `tenki-outfit-backup-${s.slice(0, 10).replaceAll('-', '')}-${s.slice(11, 13)}${s.slice(14, 16)}.zip`;
}

const join = (dir: string, rel: string) => `${dir}/${rel}`;

export function exportBackup(deps: BackupDeps): Promise<{ uri: string; fileName: string }> {
  return exclusive(async () => {
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
        // 只打包 App 自己的照片；匯入時其他路徑一律不採用
        if (!isOwnedPhotoPath(rel)) {
          console.warn('匯出略過不是 App 照片資料夾的路徑', rel);
          continue;
        }
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
  });
}

export function prepareImport(
  deps: Pick<BackupDeps, 'files' | 'schemaVersion'>,
  zipUri: string,
): Promise<PrepareResult> {
  return exclusive(async () => {
    const result = await readBackup(deps, zipUri);
    // 選檔時系統複製到 App 暫存資料夾的 zip：用不到了就刪掉
    if (!result.ok) deps.files.remove(zipUri);
    return result;
  });
}

async function readBackup(deps: Pick<BackupDeps, 'files' | 'schemaVersion'>, zipUri: string): Promise<PrepareResult> {
  const { files } = deps;
  let entries: ZipEntry[];
  try {
    entries = await files.listZip(zipUri);
  } catch {
    return { ok: false, reason: 'notBackup' };
  }
  if (!entries.some(e => e.path === MANIFEST_NAME)) return { ok: false, reason: 'notBackup' };
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

  // 照片解壓後搬進照片資料夾（同一個磁碟只是改名），最多再多佔一份照片的空間
  const used = new Set(photoPathsOf(parsed.manifest.data));
  const needed = entries.filter(e => used.has(e.path)).reduce((sum, e) => sum + e.size, 0) + SPACE_MARGIN;
  if (files.freeSpace() < needed) return { ok: false, reason: 'noSpace', neededMb: Math.ceil(needed / 1024 / 1024) };

  return {
    ok: true,
    zipUri,
    manifest: parsed.manifest,
    summary: summarizeBackup(parsed.manifest.data),
    entries: new Set(entries.map(e => e.path)),
  };
}

/** 不匯入了（取消）：刪掉選檔時複製來的 zip */
export function discardImport(deps: Pick<BackupDeps, 'files'>, prepared: PreparedImport): void {
  deps.files.remove(prepared.zipUri);
}

/**
 * 匯入。順序：解出需要的照片 → 搬成新檔名 → 一個交易寫入 DB → 刪掉「匯入前有單品用、匯入後沒有」的照片。
 * 任何一步失敗：刪掉這次搬進來的照片，DB 不動（交易回復），原本的照片不動。
 * 回傳寫入的件數（算法同匯入前的摘要；合併時只算新加入的）。
 */
export function applyImport(deps: BackupDeps, prepared: PreparedImport, mode: ImportMode): Promise<ImportCounts> {
  return exclusive(async () => {
    try {
      return await importBackup(deps, prepared, mode);
    } finally {
      deps.files.remove(prepared.zipUri);
    }
  });
}

async function importBackup(deps: BackupDeps, prepared: PreparedImport, mode: ImportMode): Promise<ImportCounts> {
  const { store, files, photos } = deps;
  const { manifest, entries, zipUri } = prepared;
  const data = mode === 'merge' ? filterNewRows(manifest.data, await store.existingKeys()) : manifest.data;
  // 清照片只看「這次匯入讓它沒人用」的：不掃整個資料夾，才不會刪到同時新增的單品剛存進來的照片
  const usedBefore = await store.photoPaths();
  // 只解出這次要用的照片；manifest 裡的路徑都已檢查過是 photos/<檔名>
  const needed = photoPathsOf(data).filter(rel => entries.has(rel));
  const work = files.workDir();
  const adopted = new Map<string, string>();
  let counts: ImportCounts = { items: 0, trash: 0, outfits: 0 };
  try {
    if (needed.length > 0) await files.unzip(zipUri, work, needed);
    for (const rel of needed) adopted.set(rel, await photos.adopt(join(work, rel)));
    const remapped = remapPhotoPaths(data, adopted);
    // 交易 COMMIT 後才出錯時用這個估計值（合併時可能略多）
    const { items, trash, outfits } = summarizeBackup(remapped);
    counts = { items, trash, outfits };
    counts = mode === 'replace' ? await store.replaceAll(remapped) : await store.merge(remapped);
  } catch (e) {
    // 極少數情況交易已經 COMMIT、之後才出錯（例如關閉連線失敗）：DB 已經用到新照片，就不能刪
    const committed = await isCommitted(store, [...adopted.values()]);
    if (!committed) {
      photos.remove([...adopted.values()]);
      throw e;
    }
    console.warn('匯入已寫入，之後的步驟出錯', e);
  } finally {
    files.remove(work);
  }

  // 寫入成功之後的整理：失敗也不影響匯入結果
  try {
    const usedAfter = new Set(await store.photoPaths());
    photos.remove(usedBefore.filter(rel => !usedAfter.has(rel)));
  } catch (e) {
    console.warn('清除沒用到的照片失敗', e);
  }
  try {
    if (mode === 'replace') deps.settings.apply(manifest.settings);
  } catch (e) {
    console.warn('套用備份的設定失敗', e);
  }
  try {
    deps.notify();
  } catch (e) {
    console.warn('通知畫面更新失敗', e);
  }
  return counts;
}

async function isCommitted(store: BackupStore, newPhotos: string[]): Promise<boolean> {
  if (newPhotos.length === 0) return false;
  try {
    const used = new Set(await store.photoPaths());
    return newPhotos.some(p => used.has(p));
  } catch {
    return false;
  }
}
