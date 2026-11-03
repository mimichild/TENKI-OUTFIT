import type { SQLiteDatabase } from 'expo-sqlite';
import type { Item } from '@/types/models';
import { rowToItem, type ItemRow } from './sqliteItemRepository';

/** 交易內可用的操作（expo-sqlite 的 Transaction 與 SQLiteDatabase 相同介面） */
export type Tx = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

const marks = (n: number) => Array(n).fill('?').join(', ');

/** 「最近使用」= 該單品所在穿搭的最晚日期（含未來；沒有日期的舊穿搭不算） */
export async function refreshLastUsed(tx: Tx, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  await tx.runAsync(
    `UPDATE items SET last_used_at = (
       SELECT MAX(o.date) FROM outfit_items oi JOIN outfits o ON o.id = oi.outfit_id
       WHERE oi.item_id = items.id AND o.date IS NOT NULL
     ) WHERE id IN (${marks(itemIds.length)})`,
    ...itemIds,
  );
}

/** 封存單品已經沒有任何穿搭參照時真正刪除，回傳被刪的單品 */
export async function removeOrphanedArchived(tx: Tx, itemIds: string[]): Promise<Item[]> {
  if (itemIds.length === 0) return [];
  const rows = await tx.getAllAsync<ItemRow>(
    `SELECT * FROM items WHERE id IN (${marks(itemIds.length)}) AND archived_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM outfit_items WHERE item_id = items.id)`,
    ...itemIds,
  );
  for (const row of rows) await tx.runAsync('DELETE FROM items WHERE id = ?', row.id);
  return rows.map(rowToItem);
}

/**
 * 永久刪除一件單品（見 ItemRepository.purge）。today = 台灣時間的 YYYY-MM-DD。
 * 回傳真正刪除的單品；改為封存或找不到時回傳 null
 */
export async function purgeItemInTx(tx: Tx, id: string, today: string, now: string): Promise<Item | null> {
  const row = await tx.getFirstAsync<ItemRow>('SELECT * FROM items WHERE id = ? AND archived_at IS NULL', id);
  if (!row) return null;

  const affected = await tx.getAllAsync<{ outfit_id: string }>(
    `SELECT oi.outfit_id FROM outfit_items oi JOIN outfits o ON o.id = oi.outfit_id
     WHERE oi.item_id = ? AND (o.date IS NULL OR o.date >= ?)`,
    id, today,
  );
  for (const { outfit_id } of affected) {
    await tx.runAsync('DELETE FROM outfit_items WHERE outfit_id = ? AND item_id = ?', outfit_id, id);
    await tx.runAsync(
      'DELETE FROM outfits WHERE id = ? AND NOT EXISTS (SELECT 1 FROM outfit_items WHERE outfit_id = ?)',
      outfit_id, outfit_id,
    );
  }

  const stillUsed = await tx.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outfit_items WHERE item_id = ?', id);
  if ((stillUsed?.n ?? 0) > 0) {
    await tx.runAsync('UPDATE items SET archived_at = ?, updated_at = ? WHERE id = ?', now, now, id);
    await refreshLastUsed(tx, [id]);
    return null;
  }
  await tx.runAsync('DELETE FROM items WHERE id = ?', id);
  return rowToItem(row);
}
