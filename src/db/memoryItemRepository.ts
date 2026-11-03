import { taipeiDate } from '@/lib/cwaWeather';
import type { Item, Outfit, OutfitItemPlacement } from '@/types/models';
import { trashCutoff, type ItemRepository, type RepositoryDeps } from './itemRepository';
import { OutfitValidationError, validateOutfitInput, type OutfitInput, type OutfitRepository } from './outfitRepository';

const clone = (item: Item): Item => ({ ...item, occasions: [...item.occasions], seasons: [...item.seasons] });

interface StoredItem {
  item: Item;
  /** 已封存：永久刪除但過去穿搭仍參照 */
  archivedAt: string | null;
}

interface StoredOutfit {
  id: string;
  name: string;
  date: string | null;
  createdAt: string;
  updatedAt: string;
  items: OutfitItemPlacement[];
}

/** Web 預覽與測試用：單品與穿搭共用同一份記憶體資料，規則與 SQLite 版一致 */
export function createMemoryDatabase(
  deps: RepositoryDeps,
  seed: Item[] = [],
): { items: ItemRepository; outfits: OutfitRepository } {
  const items = new Map<string, StoredItem>(seed.map(i => [i.id, { item: clone(i), archivedAt: null }]));
  const outfits = new Map<string, StoredOutfit>();

  const visible = (id: string) => {
    const s = items.get(id);
    return s && s.archivedAt === null ? s.item : null;
  };

  const setDeleted = (id: string, deletedAt: string | null) => {
    const item = visible(id);
    if (item) items.get(id)!.item = { ...item, deletedAt, updatedAt: deps.now() };
  };

  const usesOf = (itemId: string) => [...outfits.values()].filter(o => o.items.some(p => p.itemId === itemId));

  const refreshLastUsed = (itemIds: string[]) => {
    for (const id of itemIds) {
      const s = items.get(id);
      if (!s) continue;
      const dates = usesOf(id).map(o => o.date).filter((d): d is string => d !== null).sort();
      s.item = { ...s.item, lastUsedAt: dates.at(-1) ?? null };
    }
  };

  const removeOrphanedArchived = (itemIds: string[]): Item[] => {
    const removed: Item[] = [];
    for (const id of new Set(itemIds)) {
      const s = items.get(id);
      if (s && s.archivedAt !== null && usesOf(id).length === 0) {
        items.delete(id);
        removed.push(clone(s.item));
      }
    }
    return removed;
  };

  const purgeOne = (id: string): Item | null => {
    const s = items.get(id);
    if (!s || s.archivedAt !== null) return null;
    const now = deps.now();
    const today = taipeiDate(now);
    for (const o of usesOf(id)) {
      if (o.date !== null && o.date < today) continue;
      o.items = o.items.filter(p => p.itemId !== id);
      if (o.items.length === 0) outfits.delete(o.id);
    }
    if (usesOf(id).length > 0) {
      s.archivedAt = now;
      s.item = { ...s.item, updatedAt: now };
      refreshLastUsed([id]);
      return null;
    }
    items.delete(id);
    return clone(s.item);
  };

  const toOutfit = (o: StoredOutfit): Outfit => ({
    id: o.id, name: o.name, date: o.date, createdAt: o.createdAt, updatedAt: o.updatedAt,
    pieces: [...o.items]
      .sort((a, b) => a.z - b.z || a.itemId.localeCompare(b.itemId))
      .flatMap(p => {
        const s = items.get(p.itemId);
        return s ? [{ ...p, item: clone(s.item) }] : [];
      }),
  });

  /** 與 SQLite 版一致：單品必須存在；今天以後的穿搭不放已封存的單品 */
  const copyPlacements = (input: OutfitInput) => {
    if (input.items.some(p => !items.has(p.itemId))) throw new Error('outfit references a missing item');
    const future = input.date >= taipeiDate(deps.now());
    const usable = input.items.filter(p => !(future && items.get(p.itemId)!.archivedAt !== null));
    if (usable.length === 0) throw new OutfitValidationError('empty');
    return usable.map(({ itemId, x, y, scale, rotation, z }) => ({ itemId, x, y, scale, rotation, z }));
  };

  const itemRepo: ItemRepository = {
    async list() {
      return [...items.values()].filter(s => s.archivedAt === null && s.item.deletedAt === null).map(s => clone(s.item));
    },
    async listTrash() {
      return [...items.values()]
        .filter(s => s.archivedAt === null && s.item.deletedAt !== null)
        .map(s => s.item)
        .sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!))
        .map(clone);
    },
    async get(id) {
      const item = visible(id);
      return item ? clone(item) : null;
    },
    async create(input) {
      const now = deps.now();
      const { name, brand, category, price, occasions, seasons, imageUri, originalUri } = input;
      const item: Item = clone({ name, brand, category, price, occasions, seasons, imageUri, originalUri, id: deps.newId(), createdAt: now, updatedAt: now, lastUsedAt: null, deletedAt: null });
      items.set(item.id, { item, archivedAt: null });
      return clone(item);
    },
    async update(id, input) {
      const existing = visible(id);
      if (!existing) return null;
      // 只合併可編輯欄位，避免呼叫端帶進來的舊 id/deletedAt/lastUsedAt 覆蓋現值（與 SQLite 版一致）
      const { name, brand, category, price, occasions, seasons, imageUri, originalUri } = input;
      const item = clone({ ...existing, name, brand, category, price, occasions, seasons, imageUri, originalUri, updatedAt: deps.now() });
      items.get(id)!.item = item;
      return clone(item);
    },
    async moveToTrash(id) {
      setDeleted(id, deps.now());
    },
    async restore(id) {
      setDeleted(id, null);
    },
    async purge(id) {
      const removed = purgeOne(id);
      return removed ? [removed] : [];
    },
    async purgeExpired(days) {
      const cutoff = trashCutoff(deps.now(), days);
      const expired = [...items.values()]
        .filter(s => s.archivedAt === null && s.item.deletedAt !== null && s.item.deletedAt < cutoff)
        .map(s => s.item.id);
      return expired.flatMap(id => purgeOne(id) ?? []);
    },
    async photoPaths() {
      const paths = [...items.values()].flatMap(s => [s.item.imageUri, s.item.originalUri]);
      return [...new Set(paths.filter((p): p is string => !!p))];
    },
  };

  const outfitRepo: OutfitRepository = {
    async listInRange(from, to) {
      return [...outfits.values()]
        .filter(o => o.date !== null && o.date >= from && o.date <= to)
        .sort((a, b) => a.date!.localeCompare(b.date!) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map(toOutfit);
    },
    async get(id) {
      const o = outfits.get(id);
      return o ? toOutfit(o) : null;
    },
    async create(input) {
      validateOutfitInput(input);
      const placements = copyPlacements(input);
      const now = deps.now();
      const o: StoredOutfit = { id: deps.newId(), name: input.name, date: input.date, createdAt: now, updatedAt: now, items: placements };
      outfits.set(o.id, o);
      refreshLastUsed(o.items.map(p => p.itemId));
      return toOutfit(o);
    },
    async update(id, input) {
      validateOutfitInput(input);
      const o = outfits.get(id);
      if (!o) return null;
      const before = o.items.map(p => p.itemId);
      const placements = copyPlacements(input);
      Object.assign(o, { name: input.name, date: input.date, updatedAt: deps.now(), items: placements });
      refreshLastUsed([...before, ...o.items.map(p => p.itemId)]);
      const purged = removeOrphanedArchived(before);
      return { outfit: toOutfit(o), purged };
    },
    async delete(id) {
      const o = outfits.get(id);
      if (!o) return [];
      outfits.delete(id);
      const before = o.items.map(p => p.itemId);
      refreshLastUsed(before);
      return removeOrphanedArchived(before);
    },
  };

  return { items: itemRepo, outfits: outfitRepo };
}

export function createMemoryItemRepository(deps: RepositoryDeps, seed: Item[] = []): ItemRepository {
  return createMemoryDatabase(deps, seed).items;
}
