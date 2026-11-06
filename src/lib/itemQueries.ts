import { CATEGORIES, OCCASIONS, SEASONS } from '@/constants/options';
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
  recentlyUsed: (a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || byNewest(a, b),
  unused: byNewest,
};

/**
 * 「最近使用」只列出用過的（最新使用 → 最舊使用）；「未使用」只列出加入後還沒用過的（最新加入 → 最舊加入）
 * （使用者指定 2026-11-06）
 */
const SORT_FILTERS: Partial<Record<ItemSort, (i: Item) => boolean>> = {
  recentlyUsed: i => i.lastUsedAt !== null,
  unused: i => i.lastUsedAt === null,
};

export function applyItemQuery(items: readonly Item[], query: ItemQuery): Item[] {
  return items
    .filter(i => query.category === 'all' || i.category === query.category)
    .filter(i => matchesAny(i.seasons, query.seasons))
    .filter(i => matchesAny(i.occasions, query.occasions))
    .filter(SORT_FILTERS[query.sort] ?? (() => true))
    .sort(COMPARATORS[query.sort]);
}

export function isQueryFiltered(query: ItemQuery): boolean {
  return query.seasons.length > 0 || query.occasions.length > 0;
}

/** 暫存區單品還剩幾天會被自動刪除（無條件進位，最小 0） */
export function trashDaysLeft(deletedAt: string, nowIso: string, retentionDays: number): number {
  const expiresAt = new Date(deletedAt).getTime() + retentionDays * 86_400_000;
  return Math.max(0, Math.ceil((expiresAt - new Date(nowIso).getTime()) / 86_400_000));
}

/**
 * 單品頁左右滑：服裝頁目前的分類／排序／季節／場合，透過網址參數帶到單品頁，
 * 「隔壁」就是服裝頁格子裡的前一格、後一格
 */
export function itemQueryParams(query: ItemQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.category !== 'all') params.category = query.category;
  if (query.sort !== DEFAULT_ITEM_QUERY.sort) params.sort = query.sort;
  if (query.seasons.length) params.seasons = query.seasons.join(',');
  if (query.occasions.length) params.occasions = query.occasions.join(',');
  return params;
}

export function parseItemQueryParams(params: { category?: string; sort?: string; seasons?: string; occasions?: string }): ItemQuery {
  const list = <T extends string>(raw: string | undefined, allowed: readonly T[]) =>
    (raw ?? '').split(',').filter((v): v is T => (allowed as readonly string[]).includes(v));
  const category = (CATEGORIES as string[]).includes(params.category ?? '') ? (params.category as Category) : 'all';
  const sort = (ITEM_SORTS as string[]).includes(params.sort ?? '') ? (params.sort as ItemSort) : DEFAULT_ITEM_QUERY.sort;
  return { category, sort, seasons: list(params.seasons, SEASONS), occasions: list(params.occasions, OCCASIONS) };
}

/** 服裝頁同樣的篩選與排序下，前一格（prev）和後一格（next）的單品 id；沒有就是 null */
export function adjacentItems(items: readonly Item[], query: ItemQuery, id: string): { prev: string | null; next: string | null } {
  const list = applyItemQuery(items, query);
  const i = list.findIndex(item => item.id === id);
  if (i < 0) return { prev: null, next: null };
  return { prev: list[i - 1]?.id ?? null, next: list[i + 1]?.id ?? null };
}
