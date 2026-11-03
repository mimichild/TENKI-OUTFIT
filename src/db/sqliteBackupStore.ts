import type { SQLiteDatabase } from 'expo-sqlite';
import {
  filterNewRows,
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

export interface MergeCounts {
  items: number;
  outfits: number;
  weatherDays: number;
}

/** 備份用的整批讀寫（只有手機版；Web 預覽不支援備份） */
export interface BackupStore {
  /** 全部資料，含暫存區、已封存單品、天氣快取 */
  dump(): Promise<BackupData>;
  existingKeys(): Promise<ExistingKeys>;
  /** 覆蓋：清空後換成 data；失敗時整批放棄 */
  replaceAll(data: BackupData): Promise<void>;
  /** 保留原本資料：只加入手機上沒有的；失敗時整批放棄。回傳實際加入的筆數 */
  merge(data: BackupData): Promise<MergeCounts>;
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
}

export function createSqliteBackupStore(db: Db): BackupStore {
  return {
    dump: () => readAll(db),
    existingKeys: () => keysOf(db),

    async replaceAll(data) {
      await db.withExclusiveTransactionAsync(async tx => {
        await tx.runAsync('DELETE FROM outfit_items');
        await tx.runAsync('DELETE FROM outfits');
        await tx.runAsync('DELETE FROM items');
        await tx.runAsync('DELETE FROM weather_days');
        await insertData(tx, data);
      });
    },

    async merge(data) {
      let counts: MergeCounts = { items: 0, outfits: 0, weatherDays: 0 };
      await db.withExclusiveTransactionAsync(async tx => {
        // 在交易裡重新讀一次手機上的資料，以交易內的狀態為準
        const fresh = filterNewRows(data, await keysOf(tx));
        await insertData(tx, fresh);
        // 新穿搭可能用到手機上原有的單品，「最近使用」要重算
        await refreshLastUsed(tx, [...new Set(fresh.outfit_items.map(p => p.item_id))]);
        counts = { items: fresh.items.length, outfits: fresh.outfits.length, weatherDays: fresh.weather_days.length };
      });
      return counts;
    },
  };
}
