import { applyItemQuery, DEFAULT_ITEM_QUERY } from '@/lib/itemQueries';
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

  it('sorts recently used first, never-used items last', () => {
    expect(ids(applyItemQuery(items, { ...DEFAULT_ITEM_QUERY, sort: 'recentlyUsed' }))).toEqual(['c', 'a', 'b']);
  });

  it('puts never-used items first for "unused", then newest', () => {
    expect(ids(applyItemQuery(items, { ...DEFAULT_ITEM_QUERY, sort: 'unused' }))).toEqual(['b', 'c', 'a']);
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
