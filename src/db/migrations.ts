import type { SQLiteDatabase } from 'expo-sqlite';

type MigrationDb = Pick<SQLiteDatabase, 'execAsync' | 'getFirstAsync' | 'withTransactionAsync'>;

/**
 * 每個元素是一個版本；只能往後加，不可修改已發佈的版本。
 * 注意：SQLite 在交易中會忽略 `PRAGMA foreign_keys`。日後若要「重建資料表」
 * （建新表→複製→刪舊表→改名），必須在 withTransactionAsync 之前先
 * `PRAGMA foreign_keys = OFF`，完成後跑 `PRAGMA foreign_key_check` 再打開，
 * 否則刪除 outfits 會連帶 CASCADE 刪掉 outfit_items。
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    brand TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    price REAL,
    occasions TEXT NOT NULL DEFAULT '[]',
    seasons TEXT NOT NULL DEFAULT '[]',
    image_uri TEXT,
    original_uri TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_used_at TEXT,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
  CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);

  CREATE TABLE IF NOT EXISTS outfits (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_outfits_date ON outfits(date);

  CREATE TABLE IF NOT EXISTS outfit_items (
    outfit_id TEXT NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id),
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    scale REAL NOT NULL DEFAULT 1,
    rotation REAL NOT NULL DEFAULT 0,
    z INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (outfit_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS weather_days (
    county TEXT NOT NULL,
    town TEXT NOT NULL,
    date TEXT NOT NULL,
    max_t REAL,
    min_t REAL,
    max_at REAL,
    min_at REAL,
    pop REAL,
    wx_code TEXT,
    wx_text TEXT,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (county, town, date)
  );
  `,
];

export async function migrate(db: MigrationDb): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= MIGRATIONS.length) return;

  await db.withTransactionAsync(async () => {
    for (let version = current; version < MIGRATIONS.length; version++) {
      await db.execAsync(MIGRATIONS[version]);
    }
    await db.execAsync(`PRAGMA user_version = ${MIGRATIONS.length}`);
  });
}
