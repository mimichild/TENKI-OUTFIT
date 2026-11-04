import { migrate, MIGRATIONS } from '@/db/migrations';

function fakeDb(startVersion: number) {
  const executed: string[] = [];
  let version = startVersion;
  return {
    executed,
    get version() { return version; },
    execAsync: jest.fn(async (sql: string) => {
      executed.push(sql);
      const m = sql.match(/PRAGMA user_version = (\d+)/);
      if (m) version = Number(m[1]);
    }),
    getFirstAsync: jest.fn(async () => ({ user_version: version })),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn()),
  };
}

describe('migrate', () => {
  it('creates all tables on a fresh database', async () => {
    const db = fakeDb(0);
    await migrate(db as never);
    const sql = db.executed.join('\n');
    for (const table of ['items', 'outfits', 'outfit_items', 'weather_days']) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(db.version).toBe(MIGRATIONS.length);
  });

  it('does nothing when already up to date', async () => {
    const db = fakeDb(MIGRATIONS.length);
    await migrate(db as never);
    expect(db.executed.filter(s => !s.startsWith('PRAGMA journal_mode'))).toEqual([]);
  });
});

describe('migrate on a real SQLite database', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { openTestDb } = require('./helpers/nodeSqlite') as typeof import('./helpers/nodeSqlite');

  it('upgrades v1 to v2 by adding items.archived_at and keeps existing rows', async () => {
    const db = openTestDb();
    db.raw.exec(MIGRATIONS[0]);
    db.raw.exec("PRAGMA user_version = 1; INSERT INTO items (id, category, created_at, updated_at) VALUES ('a', 'top', 't', 't');");
    await migrate(db as never);
    expect(db.raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length });
    expect(db.raw.prepare('SELECT id, archived_at FROM items').all()).toEqual([{ id: 'a', archived_at: null }]);
  });

  it('v2 → v3：穿搭新增 canvas_ratio，舊穿搭維持 3:4', async () => {
    const db = openTestDb();
    db.raw.exec(MIGRATIONS[0]);
    db.raw.exec(MIGRATIONS[1]);
    db.raw.exec("PRAGMA user_version = 2; INSERT INTO outfits (id, name, date, created_at, updated_at) VALUES ('o', '', '2026-11-01', 't', 't');");
    await migrate(db as never);
    expect(db.raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length });
    const row = db.raw.prepare('SELECT canvas_ratio FROM outfits').get() as { canvas_ratio: number };
    expect(row.canvas_ratio).toBeCloseTo(4 / 3);
  });

  it('v3 → v4：單品新增顏色、風格欄位，舊單品都是 NULL（改用自動判斷）', async () => {
    const db = openTestDb();
    for (const m of MIGRATIONS.slice(0, 3)) db.raw.exec(m);
    db.raw.exec("PRAGMA user_version = 3; INSERT INTO items (id, category, created_at, updated_at) VALUES ('a', 'top', 't', 't');");
    await migrate(db as never);
    expect(db.raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: 4 });
    expect(db.raw.prepare('SELECT color, style FROM items').get()).toEqual({ color: null, style: null });
  });
});
