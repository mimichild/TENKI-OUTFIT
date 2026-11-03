import { sanitizeSettings, type Settings } from '@/store/settingsStore';
import { isOwnedPhotoPath } from './photoPath';

/**
 * 備份檔（zip）內容：`manifest.json`（本檔定義的格式）＋ `photos/` 底下的照片檔。
 * data 直接存 DB 欄位（snake_case），匯入時照欄位寫回；照片路徑是 DB 裡的相對路徑 `photos/<檔名>`。
 * 氣象署授權碼不在設定裡，一律不備份。
 */
export const BACKUP_FORMAT = 'tenki-outfit-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MANIFEST_NAME = 'manifest.json';

export type BackupSettings = Pick<Settings, 'language' | 'county' | 'currency' | 'themeColor'>;

export interface BackupItemRow {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number | null;
  /** JSON 陣列字串 */
  occasions: string;
  seasons: string;
  image_uri: string | null;
  original_uri: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  deleted_at: string | null;
  archived_at: string | null;
}

export interface BackupOutfitRow {
  id: string;
  name: string;
  date: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackupPlacementRow {
  outfit_id: string;
  item_id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  z: number;
}

export interface BackupWeatherRow {
  county: string;
  town: string;
  date: string;
  max_t: number | null;
  min_t: number | null;
  max_at: number | null;
  min_at: number | null;
  pop: number | null;
  wx_code: string | null;
  wx_text: string | null;
  fetched_at: string;
}

export interface BackupData {
  items: BackupItemRow[];
  outfits: BackupOutfitRow[];
  outfit_items: BackupPlacementRow[];
  weather_days: BackupWeatherRow[];
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  /** 匯出時的 DB 版本（PRAGMA user_version） */
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  settings: BackupSettings;
  data: BackupData;
}

export type ParseResult =
  | { ok: true; manifest: BackupManifest }
  | { ok: false; reason: 'notBackup' | 'newerVersion' | 'corrupt' };

export function buildManifest(
  data: BackupData,
  settings: BackupSettings,
  meta: { schemaVersion: number; appVersion: string; exportedAt: string },
): BackupManifest {
  const { language, county, currency, themeColor } = settings;
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    ...meta,
    settings: { language, county, currency, themeColor },
    data,
  };
}

class Corrupt extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function str(o: Obj, key: string, fallback?: string): string {
  const v = o[key];
  if (typeof v === 'string') return v;
  if (v === undefined && fallback !== undefined) return fallback;
  throw new Corrupt(key);
}
function id(o: Obj, key: string): string {
  const v = str(o, key);
  if (v === '') throw new Corrupt(key);
  return v;
}
/** 缺欄位（舊版 DB 沒有）視為 null */
function strOrNull(o: Obj, key: string): string | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  throw new Corrupt(key);
}
const isTime = (v: string) => !Number.isNaN(Date.parse(v));
/** 必填的時間欄位（ISO 字串） */
function time(o: Obj, key: string): string {
  const v = id(o, key);
  if (!isTime(v)) throw new Corrupt(key);
  return v;
}
/** 可為 null 的時間欄位；格式錯（例如手動改成 "0"）會讓暫存區期限算錯，視為損壞 */
function timeOrNull(o: Obj, key: string): string | null {
  const v = strOrNull(o, key);
  if (v !== null && !isTime(v)) throw new Corrupt(key);
  return v;
}
function num(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  throw new Corrupt(key);
}
function numOrNull(o: Obj, key: string): number | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  return num(o, key);
}
function rows(data: Obj, key: string): Obj[] {
  const v = data[key];
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every(isObj)) throw new Corrupt(key);
  return v;
}
/** 不是 App 自己的照片路徑（例如 `../`、完整 URI）一律清掉，避免匯入時讀寫 App 資料夾以外的檔案 */
const photo = (o: Obj, key: string) => {
  const v = strOrNull(o, key);
  return isOwnedPhotoPath(v) ? v : null;
};
function unique<T>(list: T[], keyOf: (v: T) => string): void {
  const seen = new Set<string>();
  for (const v of list) {
    const k = keyOf(v);
    if (seen.has(k)) throw new Corrupt(`duplicate ${k}`);
    seen.add(k);
  }
}

function parseData(raw: unknown): BackupData {
  if (!isObj(raw)) throw new Corrupt('data');
  const items = rows(raw, 'items').map(
    (o): BackupItemRow => ({
      id: id(o, 'id'),
      name: str(o, 'name', ''),
      brand: str(o, 'brand', ''),
      category: id(o, 'category'),
      price: numOrNull(o, 'price'),
      occasions: str(o, 'occasions', '[]'),
      seasons: str(o, 'seasons', '[]'),
      image_uri: photo(o, 'image_uri'),
      original_uri: photo(o, 'original_uri'),
      created_at: time(o, 'created_at'),
      updated_at: time(o, 'updated_at'),
      // 最近使用存的是穿搭日期（YYYY-MM-DD）
      last_used_at: strOrNull(o, 'last_used_at'),
      deleted_at: timeOrNull(o, 'deleted_at'),
      archived_at: timeOrNull(o, 'archived_at'),
    }),
  );
  const outfits = rows(raw, 'outfits').map((o): BackupOutfitRow => {
    const date = strOrNull(o, 'date');
    if (date !== null && !DATE.test(date)) throw new Corrupt('date');
    return { id: id(o, 'id'), name: str(o, 'name', ''), date, created_at: time(o, 'created_at'), updated_at: time(o, 'updated_at') };
  });
  const outfit_items = rows(raw, 'outfit_items').map((o): BackupPlacementRow => {
    const scale = num(o, 'scale');
    if (scale <= 0) throw new Corrupt('scale');
    return {
      outfit_id: id(o, 'outfit_id'),
      item_id: id(o, 'item_id'),
      x: num(o, 'x'),
      y: num(o, 'y'),
      scale,
      rotation: num(o, 'rotation'),
      z: num(o, 'z'),
    };
  });
  const weather_days = rows(raw, 'weather_days').map((o): BackupWeatherRow => {
    const date = id(o, 'date');
    if (!DATE.test(date)) throw new Corrupt('date');
    return {
      county: id(o, 'county'),
      town: str(o, 'town', ''),
      date,
      max_t: numOrNull(o, 'max_t'),
      min_t: numOrNull(o, 'min_t'),
      max_at: numOrNull(o, 'max_at'),
      min_at: numOrNull(o, 'min_at'),
      pop: numOrNull(o, 'pop'),
      wx_code: strOrNull(o, 'wx_code'),
      wx_text: strOrNull(o, 'wx_text'),
      fetched_at: time(o, 'fetched_at'),
    };
  });

  unique(items, i => i.id);
  unique(outfits, o => o.id);
  unique(outfit_items, p => `${p.outfit_id}|${p.item_id}`);
  unique(weather_days, weatherKey);
  const itemIds = new Set(items.map(i => i.id));
  const outfitIds = new Set(outfits.map(o => o.id));
  if (outfit_items.some(p => !itemIds.has(p.item_id) || !outfitIds.has(p.outfit_id))) throw new Corrupt('reference');
  return { items, outfits, outfit_items, weather_days };
}

/** 讀 manifest.json；schemaVersion = App 目前的 DB 版本 */
export function parseManifest(text: string, app: { schemaVersion: number }): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'notBackup' };
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, reason: 'notBackup' };
  const { formatVersion, schemaVersion } = raw;
  const positiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1;
  if (!positiveInt(formatVersion) || !positiveInt(schemaVersion)) return { ok: false, reason: 'corrupt' };
  if (formatVersion > BACKUP_FORMAT_VERSION || schemaVersion > app.schemaVersion) return { ok: false, reason: 'newerVersion' };
  try {
    const { language, county, currency, themeColor } = sanitizeSettings(
      (isObj(raw.settings) ? raw.settings : {}) as Partial<Settings>,
    );
    return {
      ok: true,
      manifest: {
        format: BACKUP_FORMAT,
        formatVersion,
        schemaVersion,
        appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '',
        exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
        settings: { language, county, currency, themeColor },
        data: parseData(raw.data),
      },
    };
  } catch (e) {
    if (e instanceof Corrupt) return { ok: false, reason: 'corrupt' };
    throw e;
  }
}

export const weatherKey = (w: Pick<BackupWeatherRow, 'county' | 'town' | 'date'>) => `${w.county}|${w.town}|${w.date}`;

/** 資料裡用到的照片（不重複） */
export function photoPathsOf(data: BackupData): string[] {
  const paths = new Set<string>();
  for (const i of data.items) {
    if (i.image_uri) paths.add(i.image_uri);
    if (i.original_uri) paths.add(i.original_uri);
  }
  return [...paths];
}

/** 照片換成新路徑；對照表沒有的（照片檔不在備份裡）改成 null。不改動傳入的資料 */
export function remapPhotoPaths(data: BackupData, map: ReadonlyMap<string, string>): BackupData {
  const to = (p: string | null) => (p ? (map.get(p) ?? null) : null);
  return { ...data, items: data.items.map(i => ({ ...i, image_uri: to(i.image_uri), original_uri: to(i.original_uri) })) };
}

export interface ExistingKeys {
  itemIds: ReadonlySet<string>;
  outfitIds: ReadonlySet<string>;
  /** weatherKey() */
  weatherKeys: ReadonlySet<string>;
}

/** 「保留原本資料」：只留手機上沒有的單品、穿搭（連同它的位置）、天氣日期 */
export function filterNewRows(data: BackupData, existing: ExistingKeys): BackupData {
  const outfits = data.outfits.filter(o => !existing.outfitIds.has(o.id));
  const added = new Set(outfits.map(o => o.id));
  return {
    items: data.items.filter(i => !existing.itemIds.has(i.id)),
    outfits,
    outfit_items: data.outfit_items.filter(p => added.has(p.outfit_id)),
    weather_days: data.weather_days.filter(w => !existing.weatherKeys.has(weatherKey(w))),
  };
}

/** 匯入前給使用者看的摘要：單品（不含暫存區、封存）、暫存區、穿搭 */
export function summarizeBackup(data: BackupData): { items: number; trash: number; outfits: number } {
  const live = data.items.filter(i => i.archived_at === null);
  return {
    items: live.filter(i => i.deleted_at === null).length,
    trash: live.filter(i => i.deleted_at !== null).length,
    outfits: data.outfits.length,
  };
}
