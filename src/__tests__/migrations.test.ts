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
