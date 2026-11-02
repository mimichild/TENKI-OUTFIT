import type { SQLiteDatabase } from 'expo-sqlite';
import { CATEGORIES, OCCASIONS, SEASONS } from '@/constants/options';
import type { Category, Item, Occasion, Season } from '@/types/models';
import { taipeiDate } from '@/lib/cwaWeather';
import { trashCutoff, type ItemRepository, type RepositoryDeps } from './itemRepository';
import { purgeItemInTx } from './sqliteOutfitRules';

type Db = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync' | 'getAllAsync' | 'withExclusiveTransactionAsync'>;

export interface ItemRow {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number | null;
  occasions: string;
  seasons: string;
  image_uri: string | null;
  original_uri: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  deleted_at: string | null;
  archived_at?: string | null;
}

function parseList<T extends string>(json: string, allowed: readonly T[]): T[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is T => allowed.includes(v as T)) : [];
  } catch {
    return [];
  }
}

export function rowToItem(row: ItemRow): Item {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: (CATEGORIES as string[]).includes(row.category) ? (row.category as Category) : 'other',
    price: row.price,
    occasions: parseList<Occasion>(row.occasions, OCCASIONS),
    seasons: parseList<Season>(row.seasons, SEASONS),
    imageUri: row.image_uri,
    originalUri: row.original_uri,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
    deletedAt: row.deleted_at,
  };
}

export function createSqliteItemRepository(db: Db, deps: RepositoryDeps): ItemRepository {
  // 已封存的單品在介面上完全消失：list / listTrash / get 都排除
  const get = async (id: string) => {
    const row = await db.getFirstAsync<ItemRow>('SELECT * FROM items WHERE id = ? AND archived_at IS NULL', id);
    return row ? rowToItem(row) : null;
  };

  /** 全部包在同一個排他交易，一起成功或一起失敗 */
  const purgeAll = async (ids: string[]) => {
    const removed: Item[] = [];
    if (ids.length === 0) return removed;
    const now = deps.now();
    const today = taipeiDate(now);
    await db.withExclusiveTransactionAsync(async tx => {
      for (const id of ids) {
        const item = await purgeItemInTx(tx, id, today, now);
        if (item) removed.push(item);
      }
    });
    return removed;
  };

  return {
    async list() {
      const rows = await db.getAllAsync<ItemRow>('SELECT * FROM items WHERE deleted_at IS NULL AND archived_at IS NULL');
      return rows.map(rowToItem);
    },
    async listTrash() {
      const rows = await db.getAllAsync<ItemRow>(
        'SELECT * FROM items WHERE deleted_at IS NOT NULL AND archived_at IS NULL ORDER BY deleted_at DESC',
      );
      return rows.map(rowToItem);
    },
    get,
    async create(input) {
      const now = deps.now();
      const id = deps.newId();
      await db.runAsync(
        `INSERT INTO items (id, name, brand, category, price, occasions, seasons, image_uri, original_uri, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, input.name, input.brand, input.category, input.price,
        JSON.stringify(input.occasions), JSON.stringify(input.seasons),
        input.imageUri, input.originalUri, now, now,
      );
      return { ...input, occasions: [...input.occasions], seasons: [...input.seasons], id, createdAt: now, updatedAt: now, lastUsedAt: null, deletedAt: null };
    },
    async update(id, input) {
      const result = await db.runAsync(
        `UPDATE items SET name = ?, brand = ?, category = ?, price = ?, occasions = ?, seasons = ?,
         image_uri = ?, original_uri = ?, updated_at = ? WHERE id = ?`,
        input.name, input.brand, input.category, input.price,
        JSON.stringify(input.occasions), JSON.stringify(input.seasons),
        input.imageUri, input.originalUri, deps.now(), id,
      );
      return result.changes > 0 ? get(id) : null;
    },
    async moveToTrash(id) {
      const now = deps.now();
      await db.runAsync('UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
    },
    async restore(id) {
      await db.runAsync('UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id = ?', deps.now(), id);
    },
    purge: id => purgeAll([id]),
    async purgeExpired(days) {
      const rows = await db.getAllAsync<{ id: string }>(
        'SELECT id FROM items WHERE deleted_at IS NOT NULL AND archived_at IS NULL AND deleted_at < ?',
        trashCutoff(deps.now(), days),
      );
      return purgeAll(rows.map(r => r.id));
    },
  };
}
