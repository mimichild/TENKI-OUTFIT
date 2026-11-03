import { migrate } from '@/db/migrations';
import { createSqliteBackupStore } from '@/db/sqliteBackupStore';
import type { BackupData } from '@/lib/backupFormat';
import { openTestDb } from './helpers/nodeSqlite';

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, brand: '', category: 'top', price: 100,
  occasions: '[]', seasons: '[]', image_uri: `photos/${id}.png`, original_uri: null,
  created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z',
  last_used_at: null, deleted_at: null, archived_at: null,
  ...extra,
});
const outfit = (id: string, date: string) => ({
  id, name: '', date, created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z',
});
const at = (outfit_id: string, item_id: string, z = 0) => ({ outfit_id, item_id, x: 0.5, y: 0.5, scale: 1, rotation: 0, z });
const weather = (date: string, max_t: number) => ({
  county: '臺北市', town: '', date, max_t, min_t: 18, max_at: null, min_at: null,
  pop: null, wx_code: null, wx_text: null, fetched_at: '2026-11-01T00:00:00.000Z',
});

const empty = (): BackupData => ({ items: [], outfits: [], outfit_items: [], weather_days: [] });

async function setup(initial: BackupData = empty()) {
  const db = openTestDb();
  await migrate(db as never);
  const store = createSqliteBackupStore(db as never);
  await store.replaceAll(initial);
  return { db, store };
}

const local = (): BackupData => ({
  items: [item('a', { name: '手機上的 a' }), item('b', { deleted_at: '2026-11-02T00:00:00.000Z' })],
  outfits: [outfit('o1', '2026-11-05')],
  outfit_items: [at('o1', 'a')],
  weather_days: [weather('2026-11-01', 20)],
});

const backup = (): BackupData => ({
  items: [
    item('a', { name: '備份的 a' }),
    item('x', { archived_at: '2026-11-02T00:00:00.000Z' }),
    item('y'),
  ],
  outfits: [outfit('o1', '2026-01-01'), outfit('o2', '2026-10-01'), outfit('o3', '2026-12-01')],
  outfit_items: [at('o1', 'y'), at('o2', 'x'), at('o2', 'a', 1), at('o3', 'y')],
  weather_days: [weather('2026-11-01', 99), weather('2026-10-01', 22)],
});

describe('sqlite backup store', () => {
  it('dump 讀出全部資料（含暫存區、封存、天氣）', async () => {
    const { store } = await setup(backup());
    const d = await store.dump();
    expect(d.items.map(i => i.id).sort()).toEqual(['a', 'x', 'y']);
    expect(d.items.find(i => i.id === 'x')!.archived_at).toBe('2026-11-02T00:00:00.000Z');
    expect(d.outfits).toHaveLength(3);
    expect(d.outfit_items).toHaveLength(4);
    expect(d.weather_days).toHaveLength(2);
  });

  it('dump → replaceAll 到另一個資料庫，內容完全一樣', async () => {
    const { store } = await setup(backup());
    const other = await setup();
    const dumped = await store.dump();
    await other.store.replaceAll(dumped);
    expect(await other.store.dump()).toEqual(dumped);
  });

  it('replaceAll（覆蓋）清掉手機上原本的資料', async () => {
    const { store } = await setup(local());
    await store.replaceAll(backup());
    const d = await store.dump();
    expect(d.items.find(i => i.id === 'a')!.name).toBe('備份的 a');
    expect(d.items.some(i => i.id === 'b')).toBe(false);
    expect(d.outfits.find(o => o.id === 'o1')!.date).toBe('2026-01-01');
    expect(d.weather_days.find(w => w.date === '2026-11-01')!.max_t).toBe(99);
  });

  it('replaceAll 中途失敗時整批放棄，原本資料不動', async () => {
    const { store } = await setup(local());
    const bad = backup();
    bad.outfit_items.push(at('o2', 'missing'));
    await expect(store.replaceAll(bad)).rejects.toThrow();
    expect(await store.dump()).toEqual(await (await setup(local())).store.dump());
  });

  it('existingKeys 回傳手機上的單品、穿搭、天氣 key', async () => {
    const { store } = await setup(local());
    const k = await store.existingKeys();
    expect([...k.itemIds].sort()).toEqual(['a', 'b']);
    expect([...k.outfitIds]).toEqual(['o1']);
    expect([...k.weatherKeys]).toEqual(['臺北市||2026-11-01']);
  });

  it('merge（保留原本）：同 id 用手機上的，沒有的加入；新穿搭可參照手機上的單品', async () => {
    const { store } = await setup(local());
    const r = await store.merge(backup());
    expect(r).toEqual({ items: 2, outfits: 2, weatherDays: 1 });
    const d = await store.dump();
    expect(d.items.find(i => i.id === 'a')!.name).toBe('手機上的 a');
    expect(d.items.map(i => i.id).sort()).toEqual(['a', 'b', 'x', 'y']);
    expect(d.outfits.find(o => o.id === 'o1')!.date).toBe('2026-11-05');
    // o1 已存在 → 它的位置（o1,y）不寫入
    expect(d.outfit_items.filter(p => p.outfit_id === 'o1').map(p => p.item_id)).toEqual(['a']);
    expect(d.outfit_items.filter(p => p.outfit_id === 'o2').map(p => p.item_id).sort()).toEqual(['a', 'x']);
    expect(d.weather_days.find(w => w.date === '2026-11-01')!.max_t).toBe(20);
    expect(d.weather_days).toHaveLength(2);
  });

  it('merge 後重算「最近使用」（手機上的單品被新穿搭用到）', async () => {
    const { store } = await setup(local());
    await store.merge(backup());
    const d = await store.dump();
    expect(d.items.find(i => i.id === 'a')!.last_used_at).toBe('2026-11-05');
    expect(d.items.find(i => i.id === 'y')!.last_used_at).toBe('2026-12-01');
  });

  it('merge 中途失敗時整批放棄', async () => {
    const { store } = await setup(local());
    const before = await store.dump();
    const bad = backup();
    bad.outfit_items.push(at('o2', 'missing'));
    await expect(store.merge(bad)).rejects.toThrow();
    expect(await store.dump()).toEqual(before);
  });
});
