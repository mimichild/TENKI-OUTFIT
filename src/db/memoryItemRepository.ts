import type { Item } from '@/types/models';
import { trashCutoff, type ItemRepository, type RepositoryDeps } from './itemRepository';

const clone = (item: Item): Item => ({ ...item, occasions: [...item.occasions], seasons: [...item.seasons] });

export function createMemoryItemRepository(deps: RepositoryDeps, seed: Item[] = []): ItemRepository {
  const store = new Map<string, Item>(seed.map(i => [i.id, clone(i)]));

  const setDeleted = (id: string, deletedAt: string | null) => {
    const item = store.get(id);
    if (item) store.set(id, { ...item, deletedAt, updatedAt: deps.now() });
  };

  return {
    async list() {
      return [...store.values()].filter(i => i.deletedAt === null).map(clone);
    },
    async listTrash() {
      return [...store.values()]
        .filter(i => i.deletedAt !== null)
        .sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!))
        .map(clone);
    },
    async get(id) {
      const item = store.get(id);
      return item ? clone(item) : null;
    },
    async create(input) {
      const now = deps.now();
      const { name, brand, category, price, occasions, seasons, imageUri, originalUri } = input;
      const item: Item = clone({ name, brand, category, price, occasions, seasons, imageUri, originalUri, id: deps.newId(), createdAt: now, updatedAt: now, lastUsedAt: null, deletedAt: null });
      store.set(item.id, item);
      return clone(item);
    },
    async update(id, input) {
      const existing = store.get(id);
      if (!existing) return null;
      // 只合併可編輯欄位，避免呼叫端帶進來的舊 id/deletedAt/lastUsedAt 覆蓋現值（與 SQLite 版一致）
      const { name, brand, category, price, occasions, seasons, imageUri, originalUri } = input;
      const item = clone({ ...existing, name, brand, category, price, occasions, seasons, imageUri, originalUri, updatedAt: deps.now() });
      store.set(id, item);
      return clone(item);
    },
    async moveToTrash(id) {
      setDeleted(id, deps.now());
    },
    async restore(id) {
      setDeleted(id, null);
    },
    async purge(id) {
      const item = store.get(id) ?? null;
      store.delete(id);
      return item ? clone(item) : null;
    },
    async purgeExpired(days) {
      const cutoff = trashCutoff(deps.now(), days);
      const expired = [...store.values()].filter(i => i.deletedAt !== null && i.deletedAt < cutoff);
      expired.forEach(i => store.delete(i.id));
      return expired.map(clone);
    },
  };
}
