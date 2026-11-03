import type { SQLiteDatabase } from 'expo-sqlite';
import { taipeiDate } from '@/lib/cwaWeather';
import type { Outfit, OutfitPiece } from '@/types/models';
import type { RepositoryDeps } from './itemRepository';
import { DEFAULT_CANVAS_RATIO, OutfitValidationError, canvasRatioOf, validateOutfitInput, type OutfitInput, type OutfitRepository } from './outfitRepository';
import { rowToItem, type ItemRow } from './sqliteItemRepository';
import { refreshLastUsed, removeOrphanedArchived, type Tx } from './sqliteOutfitRules';

type Db = Pick<SQLiteDatabase, 'getFirstAsync' | 'getAllAsync' | 'withExclusiveTransactionAsync'>;

interface OutfitRow {
  id: string;
  name: string;
  date: string | null;
  canvas_ratio: number;
  created_at: string;
  updated_at: string;
}

type PieceRow = ItemRow & {
  outfit_id: string;
  item_id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  z: number;
};

const marks = (n: number) => Array(n).fill('?').join(', ');

export function createSqliteOutfitRepository(db: Db, deps: RepositoryDeps): OutfitRepository {
  /** 讀出穿搭與單品（含已封存、在暫存區的單品） */
  const withPieces = async (rows: OutfitRow[]): Promise<Outfit[]> => {
    if (rows.length === 0) return [];
    const pieceRows = await db.getAllAsync<PieceRow>(
      `SELECT i.*, oi.outfit_id, oi.item_id, oi.x, oi.y, oi.scale, oi.rotation, oi.z
       FROM outfit_items oi JOIN items i ON i.id = oi.item_id
       WHERE oi.outfit_id IN (${marks(rows.length)}) ORDER BY oi.z, oi.item_id`,
      ...rows.map(r => r.id),
    );
    const byOutfit = new Map<string, OutfitPiece[]>();
    for (const p of pieceRows) {
      const list = byOutfit.get(p.outfit_id) ?? [];
      list.push({ itemId: p.item_id, x: p.x, y: p.y, scale: p.scale, rotation: p.rotation, z: p.z, item: rowToItem(p) });
      byOutfit.set(p.outfit_id, list);
    }
    return rows.map(r => ({
      id: r.id, name: r.name, date: r.date, createdAt: r.created_at, updatedAt: r.updated_at,
      canvasRatio: r.canvas_ratio,
      pieces: byOutfit.get(r.id) ?? [],
    }));
  };

  const get = async (id: string) => {
    const row = await db.getFirstAsync<OutfitRow>('SELECT * FROM outfits WHERE id = ?', id);
    return row ? (await withPieces([row]))[0] : null;
  };

  const writePieces = async (tx: Tx, outfitId: string, input: OutfitInput) => {
    for (const p of input.items) {
      await tx.runAsync(
        'INSERT INTO outfit_items (outfit_id, item_id, x, y, scale, rotation, z) VALUES (?, ?, ?, ?, ?, ?, ?)',
        outfitId, p.itemId, p.x, p.y, p.scale, p.rotation, p.z,
      );
    }
  };

  /**
   * 單品必須存在；今天以後的穿搭不放已封存的單品（例如從舊畫面帶過來的），
   * 和永久刪除的規則一致。拿掉後沒有單品就丟 empty
   */
  const usableInput = async (tx: Tx, input: OutfitInput): Promise<OutfitInput> => {
    const ids = input.items.map(p => p.itemId);
    const rows = await tx.getAllAsync<{ id: string; archived_at: string | null }>(
      `SELECT id, archived_at FROM items WHERE id IN (${marks(ids.length)})`,
      ...ids,
    );
    const archived = new Map(rows.map(r => [r.id, r.archived_at !== null]));
    if (ids.some(id => !archived.has(id))) throw new Error('outfit references a missing item');
    if (input.date < taipeiDate(deps.now())) return input;
    const items = input.items.filter(p => !archived.get(p.itemId));
    if (items.length === 0) throw new OutfitValidationError('empty');
    return { ...input, items };
  };

  const itemIdsOf = async (tx: Tx, outfitId: string) =>
    (await tx.getAllAsync<{ item_id: string }>('SELECT item_id FROM outfit_items WHERE outfit_id = ?', outfitId)).map(r => r.item_id);

  return {
    async listInRange(from, to) {
      const rows = await db.getAllAsync<OutfitRow>(
        'SELECT * FROM outfits WHERE date >= ? AND date <= ? ORDER BY date, created_at, id',
        from, to,
      );
      return withPieces(rows);
    },
    get,
    async create(input) {
      validateOutfitInput(input);
      const id = deps.newId();
      const now = deps.now();
      await db.withExclusiveTransactionAsync(async tx => {
        const usable = await usableInput(tx, input);
        await tx.runAsync(
          'INSERT INTO outfits (id, name, date, canvas_ratio, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          id, usable.name, usable.date, canvasRatioOf(input, DEFAULT_CANVAS_RATIO), now, now,
        );
        await writePieces(tx, id, usable);
        await refreshLastUsed(tx, usable.items.map(p => p.itemId));
      });
      return (await get(id))!;
    },
    async update(id, input) {
      validateOutfitInput(input);
      let found = false;
      let purged: Awaited<ReturnType<typeof removeOrphanedArchived>> = [];
      await db.withExclusiveTransactionAsync(async tx => {
        const exists = await tx.getFirstAsync<{ id: string; canvas_ratio: number }>('SELECT id, canvas_ratio FROM outfits WHERE id = ?', id);
        if (!exists) return;
        found = true;
        const usable = await usableInput(tx, input);
        await tx.runAsync(
          'UPDATE outfits SET name = ?, date = ?, canvas_ratio = ?, updated_at = ? WHERE id = ?',
          usable.name, usable.date, canvasRatioOf(input, exists.canvas_ratio), deps.now(), id,
        );
        const before = await itemIdsOf(tx, id);
        await tx.runAsync('DELETE FROM outfit_items WHERE outfit_id = ?', id);
        await writePieces(tx, id, usable);
        await refreshLastUsed(tx, [...new Set([...before, ...usable.items.map(p => p.itemId)])]);
        purged = await removeOrphanedArchived(tx, before);
      });
      if (!found) return null;
      return { outfit: (await get(id))!, purged };
    },
    async delete(id) {
      let purged: Awaited<ReturnType<typeof removeOrphanedArchived>> = [];
      await db.withExclusiveTransactionAsync(async tx => {
        const before = await itemIdsOf(tx, id);
        await tx.runAsync('DELETE FROM outfit_items WHERE outfit_id = ?', id);
        await tx.runAsync('DELETE FROM outfits WHERE id = ?', id);
        await refreshLastUsed(tx, before);
        purged = await removeOrphanedArchived(tx, before);
      });
      return purged;
    },
  };
}
