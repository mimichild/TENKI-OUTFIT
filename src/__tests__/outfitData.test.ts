import { createMemoryDatabase } from '@/db/memoryItemRepository';
import { createSqliteItemRepository } from '@/db/sqliteItemRepository';
import { createSqliteOutfitRepository } from '@/db/sqliteOutfitRepository';
import { migrate } from '@/db/migrations';
import type { ItemInput, ItemRepository } from '@/db/itemRepository';
import { OutfitValidationError, type OutfitInput, type OutfitRepository } from '@/db/outfitRepository';
import { openTestDb } from './helpers/nodeSqlite';

const shirt: ItemInput = {
  name: '白襯衫', brand: 'UNIQLO', category: 'top', price: 790,
  occasions: [], seasons: [], imageUri: 'photos/a.png', originalUri: 'photos/a.jpg',
};

interface Env {
  items: ItemRepository;
  outfits: OutfitRepository;
  advanceDays: (d: number) => void;
}

function clock() {
  // 台灣時間 2026-11-02 12:00
  let t = new Date('2026-11-02T04:00:00.000Z').getTime();
  return { now: () => new Date(t).toISOString(), advanceDays: (d: number) => { t += d * 86_400_000; } };
}

function ids() {
  let n = 0;
  return () => `id${++n}`;
}

async function memoryEnv(): Promise<Env> {
  const c = clock();
  const db = createMemoryDatabase({ now: c.now, newId: ids() });
  return { ...db, advanceDays: c.advanceDays };
}

async function sqliteEnv(): Promise<Env> {
  const c = clock();
  const db = openTestDb();
  await migrate(db as never);
  const deps = { now: c.now, newId: ids() };
  return {
    items: createSqliteItemRepository(db as never, deps),
    outfits: createSqliteOutfitRepository(db as never, deps),
    advanceDays: c.advanceDays,
  };
}

const at = (itemId: string, z = 0) => ({ itemId, x: 0.5, y: 0.5, scale: 1, rotation: 0, z });
const outfit = (date: string, ...itemIds: string[]): OutfitInput => ({
  name: '', date, items: itemIds.map((id, i) => at(id, i)),
});

describe.each([
  ['memory', memoryEnv],
  ['sqlite', sqliteEnv],
])('%s outfit data', (_name, makeEnv) => {
  let env: Env;
  beforeEach(async () => {
    env = await makeEnv();
  });

  const twoItems = async () => {
    const a = await env.items.create(shirt);
    const b = await env.items.create({ ...shirt, name: '牛仔褲', price: null });
    return [a.id, b.id];
  };

  it('creates an outfit and reads it back with item data ordered by z', async () => {
    const [a, b] = await twoItems();
    const created = await env.outfits.create({ name: '上班', date: '2026-11-05', items: [at(b, 2), at(a, 1)] });
    const got = await env.outfits.get(created.id);
    expect(got).toMatchObject({ name: '上班', date: '2026-11-05' });
    expect(got!.pieces.map(p => [p.itemId, p.item.name, p.z])).toEqual([[a, '白襯衫', 1], [b, '牛仔褲', 2]]);
    expect(await env.outfits.get('nope')).toBeNull();
  });

  it('lists outfits within an inclusive date range, by date then creation time', async () => {
    const [a] = await twoItems();
    await env.outfits.create(outfit('2026-11-03', a));
    const first = await env.outfits.create(outfit('2026-11-02', a));
    env.advanceDays(0.001);
    const second = await env.outfits.create(outfit('2026-11-02', a));
    await env.outfits.create(outfit('2026-11-09', a));
    const listed = await env.outfits.listInRange('2026-11-02', '2026-11-08');
    expect(listed.map(o => o.date)).toEqual(['2026-11-02', '2026-11-02', '2026-11-03']);
    expect(listed.slice(0, 2).map(o => o.id)).toEqual([first.id, second.id]);
  });

  it('rejects outfits without a valid date or without items', async () => {
    const [a] = await twoItems();
    for (const date of ['', '2026-11-5', 'tomorrow', null as unknown as string]) {
      await expect(env.outfits.create(outfit(date, a))).rejects.toMatchObject({ reason: 'date' });
    }
    await expect(env.outfits.create(outfit('2026-11-05'))).rejects.toBeInstanceOf(OutfitValidationError);
    await expect(env.outfits.create(outfit('2026-11-05'))).rejects.toMatchObject({ reason: 'empty' });
    await expect(env.outfits.create({ name: '', date: '2026-11-05', items: [at(a), at(a)] })).rejects.toMatchObject({ reason: 'duplicate' });
  });

  it('keeps lastUsedAt as the latest outfit date, including future dates', async () => {
    const [a, b] = await twoItems();
    const o1 = await env.outfits.create(outfit('2026-10-30', a));
    const o2 = await env.outfits.create(outfit('2026-11-20', a, b));
    expect((await env.items.get(a))!.lastUsedAt).toBe('2026-11-20');
    await env.outfits.update(o2.id, outfit('2026-11-21', b));
    expect((await env.items.get(a))!.lastUsedAt).toBe('2026-10-30');
    expect((await env.items.get(b))!.lastUsedAt).toBe('2026-11-21');
    await env.outfits.delete(o1.id);
    expect((await env.items.get(a))!.lastUsedAt).toBeNull();
  });

  it('update replaces placements and returns null for an unknown outfit', async () => {
    const [a, b] = await twoItems();
    const o = await env.outfits.create(outfit('2026-11-05', a));
    const result = await env.outfits.update(o.id, { name: '改', date: '2026-11-06', items: [{ ...at(b), x: 0.2, scale: 1.5 }] });
    expect(result!.purged).toEqual([]);
    expect(result!.outfit).toMatchObject({ id: o.id, name: '改', date: '2026-11-06' });
    expect(result!.outfit.pieces.map(p => [p.itemId, p.x, p.scale])).toEqual([[b, 0.2, 1.5]]);
    expect(await env.outfits.update('nope', outfit('2026-11-05', a))).toBeNull();
    await expect(env.outfits.update(o.id, outfit('', a))).rejects.toMatchObject({ reason: 'date' });
  });

  it('purging an item used only today or later deletes it and empties/deletes outfits', async () => {
    const [a, b] = await twoItems();
    const today = await env.outfits.create(outfit('2026-11-02', a));
    const later = await env.outfits.create(outfit('2026-11-10', a, b));
    await env.items.moveToTrash(a);
    const removed = await env.items.purge(a);
    expect(removed.map(i => i.id)).toEqual([a]);
    expect(await env.outfits.get(today.id)).toBeNull();
    expect((await env.outfits.get(later.id))!.pieces.map(p => p.itemId)).toEqual([b]);
    expect(await env.items.listTrash()).toEqual([]);
  });

  it('purging an item used in a past outfit archives it and keeps the past outfit', async () => {
    const [a, b] = await twoItems();
    const past = await env.outfits.create(outfit('2026-11-01', a, b));
    const future = await env.outfits.create(outfit('2026-11-03', a));
    await env.items.moveToTrash(a);
    expect(await env.items.purge(a)).toEqual([]);
    // 介面上完全消失
    expect((await env.items.list()).map(i => i.id)).toEqual([b]);
    expect(await env.items.listTrash()).toEqual([]);
    expect(await env.items.get(a)).toBeNull();
    // 過去穿搭仍顯示它（含照片與價格）
    const kept = await env.outfits.get(past.id);
    expect(kept!.pieces.map(p => [p.itemId, p.item.imageUri, p.item.price])).toEqual([[a, 'photos/a.png', 790], [b, 'photos/a.png', null]]);
    expect(await env.outfits.get(future.id)).toBeNull();
  });

  it('deleting the last past outfit that uses an archived item removes the item for real', async () => {
    const [a] = await twoItems();
    const p1 = await env.outfits.create(outfit('2026-10-01', a));
    const p2 = await env.outfits.create(outfit('2026-10-02', a));
    await env.items.moveToTrash(a);
    await env.items.purge(a);
    expect(await env.outfits.delete(p1.id)).toEqual([]);
    const purged = await env.outfits.delete(p2.id);
    expect(purged.map(i => [i.id, i.imageUri])).toEqual([[a, 'photos/a.png']]);
    // 已經沒有任何地方參照它；再刪一次不會出錯
    expect(await env.outfits.delete(p2.id)).toEqual([]);
  });

  it('removing an archived item from its last past outfit by editing removes it for real', async () => {
    const [a, b] = await twoItems();
    const p = await env.outfits.create(outfit('2026-10-01', a, b));
    await env.items.moveToTrash(a);
    await env.items.purge(a);
    const result = await env.outfits.update(p.id, outfit('2026-10-01', b));
    expect(result!.purged.map(i => i.id)).toEqual([a]);
  });

  it('purgeExpired follows the same past/future rule and never returns archived items again', async () => {
    const [a, b] = await twoItems();
    await env.outfits.create(outfit('2026-11-01', a));
    await env.items.moveToTrash(a);
    await env.items.moveToTrash(b);
    env.advanceDays(31);
    const removed = await env.items.purgeExpired(30);
    expect(removed.map(i => i.id)).toEqual([b]);
    expect(await env.items.listTrash()).toEqual([]);
    expect(await env.items.purgeExpired(30)).toEqual([]);
  });

  it('an outfit that was in the future becomes past as days go by', async () => {
    const [a] = await twoItems();
    const o = await env.outfits.create(outfit('2026-11-03', a));
    env.advanceDays(2);
    await env.items.moveToTrash(a);
    expect(await env.items.purge(a)).toEqual([]);
    expect((await env.outfits.get(o.id))!.pieces).toHaveLength(1);
  });
});

describe('sqlite legacy data', () => {
  it('treats an outfit with no date as future when purging', async () => {
    const db = openTestDb();
    await migrate(db as never);
    const deps = { now: () => '2026-11-02T04:00:00.000Z', newId: ids() };
    const items = createSqliteItemRepository(db as never, deps);
    const a = await items.create(shirt);
    db.raw.exec(`INSERT INTO outfits (id, name, date, created_at, updated_at) VALUES ('o', '', NULL, 't', 't');
      INSERT INTO outfit_items (outfit_id, item_id) VALUES ('o', '${a.id}');`);
    expect((await items.purge(a.id)).map(i => i.id)).toEqual([a.id]);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM outfits').get()).toEqual({ n: 0 });
  });
});
