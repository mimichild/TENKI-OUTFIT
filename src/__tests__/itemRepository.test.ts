import { createMemoryItemRepository } from '@/db/memoryItemRepository';
import { createSqliteItemRepository, rowToItem } from '@/db/sqliteItemRepository';
import type { ItemInput, ItemRepository } from '@/db/itemRepository';

const input: ItemInput = {
  name: '白襯衫', brand: 'UNIQLO', category: 'top', price: 790,
  occasions: ['work'], seasons: ['spring', 'autumn'],
  imageUri: 'file:///cut.png', originalUri: 'file:///orig.jpg',
};

function makeClock(start: string) {
  let now = new Date(start);
  return {
    now: () => now.toISOString(),
    advanceDays: (d: number) => { now = new Date(now.getTime() + d * 86400000); },
  };
}

describe('memory item repository', () => {
  let repo: ItemRepository;
  let clock: ReturnType<typeof makeClock>;
  let n = 0;

  beforeEach(() => {
    clock = makeClock('2026-11-02T00:00:00.000Z');
    n = 0;
    repo = createMemoryItemRepository({ now: clock.now, newId: () => `id${++n}` });
  });

  it('creates and lists items', async () => {
    const created = await repo.create(input);
    expect(created).toMatchObject({ ...input, id: 'id1', createdAt: '2026-11-02T00:00:00.000Z', deletedAt: null, lastUsedAt: null });
    expect(await repo.list()).toEqual([created]);
    expect(await repo.get('id1')).toEqual(created);
  });

  it('updates fields and bumps updatedAt', async () => {
    await repo.create(input);
    clock.advanceDays(1);
    const updated = await repo.update('id1', { ...input, name: '藍襯衫', price: null });
    expect(updated).toMatchObject({ name: '藍襯衫', price: null, updatedAt: '2026-11-03T00:00:00.000Z', createdAt: '2026-11-02T00:00:00.000Z' });
  });

  it('moves to trash and restores', async () => {
    await repo.create(input);
    await repo.moveToTrash('id1');
    expect(await repo.list()).toEqual([]);
    expect((await repo.listTrash()).map(i => i.id)).toEqual(['id1']);
    await repo.restore('id1');
    expect((await repo.list()).map(i => i.id)).toEqual(['id1']);
    expect(await repo.listTrash()).toEqual([]);
  });

  it('purges permanently and returns the removed item', async () => {
    await repo.create(input);
    await repo.moveToTrash('id1');
    const removed = await repo.purge('id1');
    expect(removed?.id).toBe('id1');
    expect(await repo.get('id1')).toBeNull();
  });

  it('purgeExpired only removes items trashed more than N days ago', async () => {
    await repo.create(input);
    await repo.create(input);
    await repo.moveToTrash('id1');
    clock.advanceDays(10);
    await repo.moveToTrash('id2');
    clock.advanceDays(21); // id1 已 31 天，id2 才 21 天
    const removed = await repo.purgeExpired(30);
    expect(removed.map(i => i.id)).toEqual(['id1']);
    expect((await repo.listTrash()).map(i => i.id)).toEqual(['id2']);
  });

  it('returns copies so callers cannot mutate stored data', async () => {
    const created = await repo.create(input);
    created.occasions.push('formal');
    expect((await repo.get('id1'))?.occasions).toEqual(['work']);
  });
});

describe('sqlite item repository', () => {
  const row = {
    id: 'x', name: '白襯衫', brand: 'UNIQLO', category: 'top', price: 790,
    occasions: '["work"]', seasons: '["spring"]', image_uri: 'a', original_uri: 'b',
    created_at: 'c1', updated_at: 'u1', last_used_at: null, deleted_at: null,
  };

  it('maps a row to an item, tolerating broken JSON', () => {
    expect(rowToItem(row)).toEqual({
      id: 'x', name: '白襯衫', brand: 'UNIQLO', category: 'top', price: 790,
      occasions: ['work'], seasons: ['spring'], imageUri: 'a', originalUri: 'b',
      createdAt: 'c1', updatedAt: 'u1', lastUsedAt: null, deletedAt: null,
    });
    expect(rowToItem({ ...row, occasions: 'oops', category: 'weird' })).toMatchObject({ occasions: [], category: 'other' });
  });

  it('inserts with serialized arrays', async () => {
    const db = {
      runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
      getFirstAsync: jest.fn(),
      getAllAsync: jest.fn(),
    };
    const repo = createSqliteItemRepository(db as never, { now: () => 'T', newId: () => 'x' });
    const created = await repo.create(input);
    expect(created.id).toBe('x');
    const [sql, ...params] = db.runAsync.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO items/);
    expect(params).toEqual(['x', '白襯衫', 'UNIQLO', 'top', 790, '["work"]', '["spring","autumn"]', 'file:///cut.png', 'file:///orig.jpg', 'T', 'T']);
  });

  it('purgeExpired deletes rows older than the cutoff', async () => {
    const db = {
      runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
      getFirstAsync: jest.fn(),
      getAllAsync: jest.fn().mockResolvedValue([{ ...row, deleted_at: '2026-01-01T00:00:00.000Z' }]),
    };
    const repo = createSqliteItemRepository(db as never, { now: () => '2026-11-02T00:00:00.000Z', newId: () => 'x' });
    const removed = await repo.purgeExpired(30);
    expect(removed.map(i => i.id)).toEqual(['x']);
    expect(db.getAllAsync.mock.calls[0][1]).toBe('2026-10-03T00:00:00.000Z');
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM items WHERE id = ?', 'x');
  });
});
