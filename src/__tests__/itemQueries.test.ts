import { adjacentItems, applyItemQuery, DEFAULT_ITEM_QUERY, itemQueryParams, parseItemQueryParams } from '@/lib/itemQueries';
import type { Item } from '@/types/models';

function item(partial: Partial<Item> & { id: string }): Item {
  return {
    name: '', brand: '', category: 'top', price: null, occasions: [], seasons: [],
    imageUri: null, originalUri: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null, deletedAt: null,
    ...partial,
  };
}

const items: Item[] = [
  item({ id: 'a', category: 'top', createdAt: '2026-01-01T00:00:00.000Z', lastUsedAt: '2026-03-01', seasons: ['summer'] }),
  item({ id: 'b', category: 'bottom', createdAt: '2026-02-01T00:00:00.000Z', occasions: ['work'] }),
  item({ id: 'c', category: 'top', createdAt: '2026-03-01T00:00:00.000Z', lastUsedAt: '2026-04-01', seasons: ['winter'], occasions: ['casual'] }),
];
const ids = (list: Item[]) => list.map(i => i.id);

describe('applyItemQuery', () => {
  it('sorts newest first by default', () => {
    expect(ids(applyItemQuery(items, DEFAULT_ITEM_QUERY))).toEqual(['c', 'b', 'a']);
  });

  it('sorts oldest first', () => {
    expect(ids(applyItemQuery(items, { ...DEFAULT_ITEM_QUERY, sort: 'oldest' }))).toEqual(['a', 'b', 'c']);
  });

  it('「最近使用」只列出用過的，最新使用到最舊使用', () => {
    expect(ids(applyItemQuery(items, { ...DEFAULT_ITEM_QUERY, sort: 'recentlyUsed' }))).toEqual(['c', 'a']);
  });

  it('「未使用」只列出沒用過的，最新加入到最舊加入', () => {
    const more = [...items, item({ id: 'd', createdAt: '2026-05-01T00:00:00.000Z' })];
    expect(ids(applyItemQuery(more, { ...DEFAULT_ITEM_QUERY, sort: 'unused' }))).toEqual(['d', 'b']);
  });

  it('filters by category tab', () => {
    expect(ids(applyItemQuery(items, { ...DEFAULT_ITEM_QUERY, category: 'top' }))).toEqual(['c', 'a']);
  });

  it('season filter keeps matching items and items with no season set', () => {
    expect(ids(applyItemQuery(items, { ...DEFAULT_ITEM_QUERY, seasons: ['summer'] }))).toEqual(['b', 'a']);
  });

  it('occasion filter keeps matching items and items with no occasion set', () => {
    expect(ids(applyItemQuery(items, { ...DEFAULT_ITEM_QUERY, occasions: ['work'] }))).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const copy = [...items];
    applyItemQuery(items, { ...DEFAULT_ITEM_QUERY, sort: 'oldest' });
    expect(items).toEqual(copy);
  });
});

describe('單品頁左右滑的隔壁單品', () => {
  const list: Item[] = [
    item({ id: 'old', category: 'top', createdAt: '2026-01-01T00:00:00.000Z' }),
    item({ id: 'mid', category: 'bottom', createdAt: '2026-02-01T00:00:00.000Z' }),
    item({ id: 'new', category: 'top', createdAt: '2026-03-01T00:00:00.000Z' }),
  ];

  it('照服裝頁格子的順序找前一格、後一格，頭尾沒有就是 null', () => {
    expect(adjacentItems(list, DEFAULT_ITEM_QUERY, 'mid')).toEqual({ prev: 'new', next: 'old' });
    expect(adjacentItems(list, DEFAULT_ITEM_QUERY, 'new')).toEqual({ prev: null, next: 'mid' });
    expect(adjacentItems(list, DEFAULT_ITEM_QUERY, 'old')).toEqual({ prev: 'mid', next: null });
    expect(adjacentItems(list, DEFAULT_ITEM_QUERY, 'gone')).toEqual({ prev: null, next: null });
  });

  it('沿用服裝頁的排序：最舊排序時前一格是較舊的', () => {
    expect(adjacentItems(list, { ...DEFAULT_ITEM_QUERY, sort: 'oldest' }, 'mid')).toEqual({ prev: 'old', next: 'new' });
  });

  it('沿用最近穿過排序', () => {
    const used = [
      item({ id: 'x', createdAt: '2026-01-01T00:00:00.000Z', lastUsedAt: '2026-05-01' }),
      item({ id: 'y', createdAt: '2026-02-01T00:00:00.000Z', lastUsedAt: '2026-04-01' }),
      item({ id: 'z', createdAt: '2026-03-01T00:00:00.000Z' }),
    ];
    // 順序 x（最近穿）→ y；z 沒穿過不列出
    expect(adjacentItems(used, { ...DEFAULT_ITEM_QUERY, sort: 'recentlyUsed' }, 'y')).toEqual({ prev: 'x', next: null });
  });

  it('沿用服裝頁的分類篩選', () => {
    const tops = { ...DEFAULT_ITEM_QUERY, category: 'top' as const };
    expect(adjacentItems(list, tops, 'new')).toEqual({ prev: null, next: 'old' });
  });

  it('篩選條件可以用網址參數來回轉換，不合法的值略過', () => {
    const q = { ...DEFAULT_ITEM_QUERY, category: 'top' as const, sort: 'unused' as const, seasons: ['summer' as const], occasions: ['work' as const, 'date' as const] };
    expect(parseItemQueryParams(itemQueryParams(q))).toEqual(q);
    expect(itemQueryParams(DEFAULT_ITEM_QUERY)).toEqual({});
    expect(parseItemQueryParams({ category: 'hat', sort: 'random', seasons: 'summer,monsoon' })).toEqual({ ...DEFAULT_ITEM_QUERY, seasons: ['summer'] });
  });
});
