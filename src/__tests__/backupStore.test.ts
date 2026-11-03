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

  type Db = ReturnType<typeof openTestDb>;
  type Statement = Awaited<ReturnType<Db['prepareAsync']>>;

  /** 記錄 prepareAsync 開出來的 statement（SQL、執行次數、是否 finalize） */
  function trackStatements(db: Db) {
    const real = db.prepareAsync.bind(db);
    const opened: { sql: string; runs: number; finalized: boolean }[] = [];
    db.prepareAsync = async (sql: string) => {
      const stmt = await real(sql);
      const rec = { sql, runs: 0, finalized: false };
      opened.push(rec);
      const wrapped: Statement = {
        executeAsync: async (...params) => { rec.runs++; return stmt.executeAsync(...params); },
        finalizeAsync: async () => { rec.finalized = true; return stmt.finalizeAsync(); },
      };
      return wrapped;
    };
    return opened;
  }

  /** 第 n 次 statement executeAsync 丟例外（模擬寫到一半失敗，不依賴外鍵） */
  function failOnExecute(db: Db, n: number) {
    const real = db.prepareAsync.bind(db);
    let calls = 0;
    db.prepareAsync = async (sql: string) => {
      const stmt = await real(sql);
      const wrapped: Statement = {
        executeAsync: async (...params) => {
          if (++calls === n) throw new Error('disk I/O error');
          return stmt.executeAsync(...params);
        },
        finalizeAsync: () => stmt.finalizeAsync(),
      };
      return wrapped;
    };
  }

  it('匯入 1000 件時每個資料表只準備一次語句，用完都 finalize', async () => {
    const { db, store } = await setup();
    const opened = trackStatements(db);
    const big = empty();
    for (let i = 0; i < 1000; i++) big.items.push(item(`i${i}`));
    big.outfits.push(outfit('o1', '2026-11-05'));
    big.outfit_items.push(at('o1', 'i0'), at('o1', 'i1', 1));
    big.weather_days.push(weather('2026-11-01', 20));
    await store.replaceAll(big);
    const inserts = opened.filter(o => o.sql.startsWith('INSERT INTO'));
    const tableOf = (sql: string) => sql.split(' ')[2];
    expect(inserts.map(o => tableOf(o.sql))).toEqual(['items', 'outfits', 'outfit_items', 'weather_days']);
    expect(inserts.map(o => o.runs)).toEqual([1000, 1, 2, 1]);
    expect(opened.every(o => o.finalized)).toBe(true);
    expect((await store.dump()).items).toHaveLength(1000);
  });

  it('finalize 也失敗時仍回報原本的錯誤', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { db, store } = await setup(local());
    const real = db.prepareAsync.bind(db);
    db.prepareAsync = async (sql: string) => {
      const stmt = await real(sql);
      return {
        executeAsync: async () => { throw new Error('disk I/O error'); },
        finalizeAsync: async () => { await stmt.finalizeAsync(); throw new Error('finalize failed'); },
      };
    };
    await expect(store.replaceAll(backup())).rejects.toThrow('disk I/O error');
  });

  it('寫到一半失敗時 statement 也有 finalize', async () => {
    const { db, store } = await setup(local());
    const opened = trackStatements(db);
    failOnExecute(db, 2);
    await expect(store.replaceAll(backup())).rejects.toThrow('disk I/O error');
    expect(opened.length).toBeGreaterThan(0);
    expect(opened.every(o => o.finalized)).toBe(true);
  });

  it('replaceAll 中途失敗時整批放棄，原本資料不動', async () => {
    const { db, store } = await setup(local());
    const before = await store.dump();
    failOnExecute(db, 3);
    await expect(store.replaceAll(backup())).rejects.toThrow('disk I/O error');
    expect(await store.dump()).toEqual(before);
  });

  it('外鍵檢查關閉的連線（實機交易另開的連線）也擋得住參照不存在的單品', async () => {
    const { db, store } = await setup(local());
    db.raw.exec('PRAGMA foreign_keys = OFF');
    const before = await store.dump();
    const bad = backup();
    bad.outfit_items.push(at('o2', 'missing'));
    await expect(store.replaceAll(bad)).rejects.toThrow('broken reference');
    await expect(store.merge(bad)).rejects.toThrow('broken reference');
    expect(await store.dump()).toEqual(before);
  });

  it('replaceAll 回傳單品（不含暫存區、封存）、暫存區、穿搭數', async () => {
    const { store } = await setup();
    expect(await store.replaceAll(local())).toEqual({ items: 1, trash: 1, outfits: 1 });
  });

  it('photoPaths 回傳單品用到的照片', async () => {
    const { store } = await setup(backup());
    expect((await store.photoPaths()).sort()).toEqual(['photos/a.png', 'photos/x.png', 'photos/y.png']);
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
    // 加入 x（已封存，不算件數）、y；穿搭 o2、o3
    expect(r).toEqual({ items: 1, trash: 0, outfits: 2 });
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
    const { db, store } = await setup(local());
    const before = await store.dump();
    failOnExecute(db, 3);
    await expect(store.merge(backup())).rejects.toThrow('disk I/O error');
    expect(await store.dump()).toEqual(before);
  });
});
