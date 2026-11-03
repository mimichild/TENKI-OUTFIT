import type { SQLiteDatabase } from 'expo-sqlite';
import {
  filterNewRows,
  summarizeBackup,
  weatherKey,
  type BackupData,
  type BackupItemRow,
  type BackupOutfitRow,
  type BackupPlacementRow,
  type BackupWeatherRow,
  type ExistingKeys,
} from '@/lib/backupFormat';
import { refreshLastUsed, type Tx } from './sqliteOutfitRules';

type Db = Pick<SQLiteDatabase, 'getAllAsync' | 'withExclusiveTransactionAsync'>;

/** 寫入的筆數；單品與暫存區的算法同匯入前的摘要（summarizeBackup，不含已封存） */
export interface ImportCounts {
  items: number;
  trash: number;
  outfits: number;
}

/** 備份用的整批讀寫（只有手機版；Web 預覽不支援備份） */
export interface BackupStore {
  /** 全部資料，含暫存區、已封存單品、天氣快取 */
  dump(): Promise<BackupData>;
  existingKeys(): Promise<ExistingKeys>;
  /** 單品用到的照片（相對路徑，不重複） */
  photoPaths(): Promise<string[]>;
  /** 覆蓋：清空後換成 data；失敗時整批放棄 */
  replaceAll(data: BackupData): Promise<ImportCounts>;
  /** 保留原本資料：只加入手機上沒有的；失敗時整批放棄。回傳實際加入的筆數 */
  merge(data: BackupData): Promise<ImportCounts>;
}

const ITEM_COLS = [
  'id', 'name', 'brand', 'category', 'price', 'occasions', 'seasons', 'image_uri', 'original_uri',
  'created_at', 'updated_at', 'last_used_at', 'deleted_at', 'archived_at',
] as const satisfies readonly (keyof BackupItemRow)[];
const OUTFIT_COLS = ['id', 'name', 'date', 'created_at', 'updated_at'] as const satisfies readonly (keyof BackupOutfitRow)[];
const PLACEMENT_COLS = ['outfit_id', 'item_id', 'x', 'y', 'scale', 'rotation', 'z'] as const satisfies readonly (keyof BackupPlacementRow)[];
const WEATHER_COLS = [
  'county', 'town', 'date', 'max_t', 'min_t', 'max_at', 'min_at', 'pop', 'wx_code', 'wx_text', 'fetched_at',
] as const satisfies readonly (keyof BackupWeatherRow)[];

async function insertAll<T>(tx: Tx, table: string, cols: readonly (keyof T & string)[], list: T[]): Promise<void> {
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  for (const row of list) {
    await tx.runAsync(sql, ...cols.map(c => row[c] as string | number | null));
  }
}

async function readAll(db: Pick<SQLiteDatabase, 'getAllAsync'>): Promise<BackupData> {
  return {
    items: await db.getAllAsync<BackupItemRow>(`SELECT ${ITEM_COLS.join(', ')} FROM items ORDER BY created_at, id`),
    outfits: await db.getAllAsync<BackupOutfitRow>(`SELECT ${OUTFIT_COLS.join(', ')} FROM outfits ORDER BY created_at, id`),
    outfit_items: await db.getAllAsync<BackupPlacementRow>(
      `SELECT ${PLACEMENT_COLS.join(', ')} FROM outfit_items ORDER BY outfit_id, z, item_id`,
    ),
    weather_days: await db.getAllAsync<BackupWeatherRow>(
      `SELECT ${WEATHER_COLS.join(', ')} FROM weather_days ORDER BY county, town, date`,
    ),
  };
}

async function keysOf(db: Pick<SQLiteDatabase, 'getAllAsync'>): Promise<ExistingKeys> {
  const items = await db.getAllAsync<{ id: string }>('SELECT id FROM items');
  const outfits = await db.getAllAsync<{ id: string }>('SELECT id FROM outfits');
  const weather = await db.getAllAsync<BackupWeatherRow>('SELECT county, town, date FROM weather_days');
  return {
    itemIds: new Set(items.map(r => r.id)),
    outfitIds: new Set(outfits.map(r => r.id)),
    weatherKeys: new Set(weather.map(weatherKey)),
  };
}

async function insertData(tx: Tx, data: BackupData): Promise<void> {
  // 順序：單品、穿搭先寫，位置參照兩者（外鍵）
  await insertAll(tx, 'items', ITEM_COLS, data.items);
  await insertAll(tx, 'outfits', OUTFIT_COLS, data.outfits);
  await insertAll(tx, 'outfit_items', PLACEMENT_COLS, data.outfit_items);
  await insertAll(tx, 'weather_days', WEATHER_COLS, data.weather_days);
  // withExclusiveTransactionAsync 另開的連線沒有 PRAGMA foreign_keys = ON（每條連線各自設定，
  // 交易開始後才設也無效），外鍵不會自動擋。foreign_key_check 不受開關影響，寫完明確檢查一次
  const broken = await tx.getAllAsync('PRAGMA foreign_key_check');
  if (broken.length > 0) throw new Error(`backup import: ${broken.length} broken reference(s)`);
}

/**
 * 交易另開連線，沒有等待鎖的時間：主連線剛好在寫（開 App 清暫存區、天氣更新）時會立刻 SQLITE_BUSY。
 * 先設等待時間，再用一個不影響資料的寫入語句拿到寫入鎖，之後讀到的資料在交易結束前都不會被別人改
 * （避免先讀後寫時遇到 SQLITE_BUSY_SNAPSHOT）
 */
async function beginWrite(tx: Tx): Promise<void> {
  await tx.getFirstAsync('PRAGMA busy_timeout = 5000');
  await tx.runAsync('DELETE FROM weather_days WHERE 0');
}

async function photoPathsIn(db: Pick<SQLiteDatabase, 'getAllAsync'>): Promise<string[]> {
  const rows = await db.getAllAsync<{ image_uri: string | null; original_uri: string | null }>(
    'SELECT image_uri, original_uri FROM items',
  );
  return [...new Set(rows.flatMap(r => [r.image_uri, r.original_uri]).filter((p): p is string => !!p))];
}

const countsOf = (data: BackupData): ImportCounts => {
  const { items, trash, outfits } = summarizeBackup(data);
  return { items, trash, outfits };
};

export function createSqliteBackupStore(db: Db): BackupStore {
  return {
    async dump() {
      // 四個資料表在同一個讀取快照裡讀，避免中途有寫入時位置參照到還沒讀到的單品
      let data: BackupData | null = null;
      await db.withExclusiveTransactionAsync(async tx => {
        await tx.getFirstAsync('PRAGMA busy_timeout = 5000');
        data = await readAll(tx);
      });
      return data!;
    },
    existingKeys: () => keysOf(db),
    photoPaths: () => photoPathsIn(db),

    async replaceAll(data) {
      await db.withExclusiveTransactionAsync(async tx => {
        await beginWrite(tx);
        await tx.runAsync('DELETE FROM outfit_items');
        await tx.runAsync('DELETE FROM outfits');
        await tx.runAsync('DELETE FROM items');
        await tx.runAsync('DELETE FROM weather_days');
        await insertData(tx, data);
      });
      return countsOf(data);
    },

    async merge(data) {
      let counts: ImportCounts = { items: 0, trash: 0, outfits: 0 };
      await db.withExclusiveTransactionAsync(async tx => {
        await beginWrite(tx);
        // 拿到寫入鎖後重新讀一次手機上的資料，以交易內的狀態為準
        const fresh = filterNewRows(data, await keysOf(tx));
        await insertData(tx, fresh);
        // 新穿搭可能用到手機上原有的單品，「最近使用」要重算
        await refreshLastUsed(tx, [...new Set(fresh.outfit_items.map(p => p.item_id))]);
        counts = countsOf(fresh);
      });
      return counts;
    },
  };
}
