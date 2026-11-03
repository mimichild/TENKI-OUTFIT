// 測試用：把 Node 內建 SQLite（同步）包成 expo-sqlite 的非同步介面子集，讓 SQL 真的被執行
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

type Param = string | number | null;

export function openTestDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  const api = {
    raw,
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, ...params: Param[]) {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getFirstAsync<T>(sql: string, ...params: Param[]) {
      return (raw.prepare(sql).get(...params) ?? null) as T | null;
    },
    async getAllAsync<T>(sql: string, ...params: Param[]) {
      return raw.prepare(sql).all(...params) as T[];
    },
    /** expo-sqlite 的 prepareAsync 子集：同一個 statement 重複 executeAsync，用完 finalizeAsync */
    async prepareAsync(sql: string) {
      const stmt = raw.prepare(sql);
      let finalized = false;
      return {
        async executeAsync(...params: Param[]) {
          if (finalized) throw new Error('statement already finalized');
          const r = stmt.run(...params);
          return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
        },
        async finalizeAsync() {
          finalized = true;
        },
      };
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    async withExclusiveTransactionAsync(fn: (tx: typeof api) => Promise<void>) {
      raw.exec('BEGIN EXCLUSIVE');
      try {
        await fn(api);
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return api;
}
