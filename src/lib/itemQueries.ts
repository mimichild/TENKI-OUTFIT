import type { Category, Item, Occasion, Season } from '@/types/models';

export type ItemSort = 'newest' | 'oldest' | 'recentlyUsed' | 'unused';
export const ITEM_SORTS: ItemSort[] = ['newest', 'oldest', 'recentlyUsed', 'unused'];

export interface ItemQuery {
  category: Category | 'all';
  sort: ItemSort;
  /** 空陣列 = 不篩選；單品沒填季節/場合視為全部適用 */
  seasons: Season[];
  occasions: Occasion[];
}

export const DEFAULT_ITEM_QUERY: ItemQuery = { category: 'all', sort: 'newest', seasons: [], occasions: [] };

function matchesAny<T>(itemValues: T[], wanted: T[]): boolean {
  return wanted.length === 0 || itemValues.length === 0 || itemValues.some(v => wanted.includes(v));
}

const byNewest = (a: Item, b: Item) => b.createdAt.localeCompare(a.createdAt);

const COMPARATORS: Record<ItemSort, (a: Item, b: Item) => number> = {
  newest: byNewest,
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  recentlyUsed: (a, b) => {
    if (a.lastUsedAt === b.lastUsedAt) return byNewest(a, b);
    if (a.lastUsedAt === null) return 1;
    if (b.lastUsedAt === null) return -1;
    return b.lastUsedAt.localeCompare(a.lastUsedAt);
  },
  unused: (a, b) => {
    const au = a.lastUsedAt === null ? 0 : 1;
    const bu = b.lastUsedAt === null ? 0 : 1;
    return au - bu || byNewest(a, b);
  },
};

export function applyItemQuery(items: readonly Item[], query: ItemQuery): Item[] {
  return items
    .filter(i => query.category === 'all' || i.category === query.category)
    .filter(i => matchesAny(i.seasons, query.seasons))
    .filter(i => matchesAny(i.occasions, query.occasions))
    .sort(COMPARATORS[query.sort]);
}

export function isQueryFiltered(query: ItemQuery): boolean {
  return query.seasons.length > 0 || query.occasions.length > 0;
}
