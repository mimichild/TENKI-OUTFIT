import { migrate } from '@/db/migrations';
import { createSqliteBackupStore, type BackupStore } from '@/db/sqliteBackupStore';
import type { BackupData, BackupSettings } from '@/lib/backupFormat';
import {
  applyImport,
  backupFileName,
  exportBackup,
  prepareImport,
  type BackupDeps,
  type BackupFiles,
} from '@/lib/backupService';
import { openTestDb } from './helpers/nodeSqlite';

/** 假的檔案系統：uri → 內容；zip 是 uri → (entry → 內容) */
function fakeEnv(store: BackupStore, settings: BackupSettings) {
  const files = new Map<string, string>();
  const zips = new Map<string, Map<string, string>>();
  let n = 0;
  const under = (dir: string) => [...files.keys()].filter(k => k.startsWith(`${dir}/`));
  const fs: BackupFiles = {
    workDir: () => `cache/work${++n}`,
    remove: uri => {
      files.delete(uri);
      for (const k of under(uri)) files.delete(k);
    },
    exists: uri => files.has(uri),
    writeText: (uri, text) => void files.set(uri, text),
    readText: async uri => {
      if (!files.has(uri)) throw new Error(`no file ${uri}`);
      return files.get(uri)!;
    },
    copy: async (from, to) => {
      if (!files.has(from)) throw new Error(`no file ${from}`);
      files.set(to, files.get(from)!);
    },
    zip: async (dir, target) => {
      zips.set(target, new Map(under(dir).map(k => [k.slice(dir.length + 1), files.get(k)!])));
    },
    listZip: async zip => {
      const z = zips.get(zip);
      if (!z) throw new Error('not a zip');
      return [...z.keys()];
    },
    unzip: async (zip, dir, entries) => {
      const z = zips.get(zip)!;
      for (const e of entries) files.set(`${dir}/${e}`, z.get(e)!);
    },
    exportTarget: name => `cache/exports/${name}`,
  };
  let saved = 0;
  const applied: BackupSettings[] = [];
  const notified = { count: 0 };
  const failSave = { on: false };
  const deps: BackupDeps = {
    store,
    files: fs,
    photos: {
      uri: rel => `doc/${rel}`,
      save: async src => {
        if (failSave.on) throw new Error('disk full');
        const ext = src.split('.').pop();
        const rel = `photos/new${++saved}.${ext}`;
        files.set(`doc/${rel}`, files.get(src)!);
        return rel;
      },
      remove: rels => rels.forEach(r => files.delete(`doc/${r}`)),
      list: () => [...files.keys()].filter(k => k.startsWith('doc/photos/')).map(k => k.slice(4)),
    },
    settings: { get: () => settings, apply: s => void applied.push(s) },
    notify: () => void notified.count++,
    now: () => '2026-11-03T07:30:00.000Z',
    appVersion: '1.0.0',
    schemaVersion: 2,
  };
  return { files, zips, deps, applied, notified, failSave };
}

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, brand: '', category: 'top', price: 100, occasions: '[]', seasons: '[]',
  image_uri: `photos/${id}.png`, original_uri: null,
  created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z',
  last_used_at: null, deleted_at: null, archived_at: null, ...extra,
});
const outfit = (id: string, date: string) => ({
  id, name: '', date, created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z',
});
const at = (outfit_id: string, item_id: string) => ({ outfit_id, item_id, x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0 });

const phoneA: BackupSettings = { language: 'zh-TW', county: '臺北市', currency: 'TWD', themeColor: 'sky' };
const phoneB: BackupSettings = { language: 'en', county: '高雄市', currency: 'JPY', themeColor: 'sky' };

async function phone(data: BackupData, settings: BackupSettings) {
  const db = openTestDb();
  await migrate(db as never);
  const store = createSqliteBackupStore(db as never);
  await store.replaceAll(data);
  const env = fakeEnv(store, settings);
  for (const p of data.items.flatMap(i => [i.image_uri, i.original_uri])) {
    if (p) env.files.set(`doc/${p}`, `pixels of ${p}`);
  }
  return { store, ...env };
}

const sourceData = (): BackupData => ({
  items: [item('a'), item('b', { deleted_at: '2026-11-02T00:00:00.000Z' }), item('c', { image_uri: null })],
  outfits: [outfit('o1', '2026-11-05')],
  outfit_items: [at('o1', 'a'), at('o1', 'c')],
  weather_days: [],
});

/** 從 A 手機匯出，複製到 B 手機的檔案系統（模擬「選檔」） */
async function exportFromA() {
  const a = await phone(sourceData(), phoneA);
  const { uri } = await exportBackup(a.deps);
  return { a, uri, zip: a.zips.get(uri)! };
}
async function receive(b: Awaited<ReturnType<typeof phone>>, zip: Map<string, string>) {
  b.zips.set('picked.zip', zip);
  return 'picked.zip';
}

describe('backupFileName', () => {
  it('用台灣時間的日期時間命名', () => {
    expect(backupFileName('2026-11-03T07:30:00.000Z')).toBe('tenki-outfit-backup-20261103-1530.zip');
  });
});

describe('exportBackup', () => {
  it('zip 含 manifest.json 與用到的照片，工作資料夾清掉', async () => {
    const { a, uri, zip } = await exportFromA();
    expect(uri).toBe('cache/exports/tenki-outfit-backup-20261103-1530.zip');
    expect([...zip.keys()].sort()).toEqual(['manifest.json', 'photos/a.png', 'photos/b.png']);
    expect(zip.get('photos/a.png')).toBe('pixels of photos/a.png');
    expect(JSON.parse(zip.get('manifest.json')!).settings).toEqual(phoneA);
    expect([...a.files.keys()].some(k => k.startsWith('cache/work'))).toBe(false);
  });

  it('照片檔已經不在手機上時略過該檔，不中斷匯出', async () => {
    const a = await phone(sourceData(), phoneA);
    a.files.delete('doc/photos/b.png');
    const { uri } = await exportBackup(a.deps);
    expect([...a.zips.get(uri)!.keys()].sort()).toEqual(['manifest.json', 'photos/a.png']);
  });
});

describe('prepareImport', () => {
  it('讀出摘要', async () => {
    const { zip } = await exportFromA();
    const b = await phone({ items: [], outfits: [], outfit_items: [], weather_days: [] }, phoneB);
    const r = await prepareImport(b.deps, await receive(b, zip));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary).toEqual({ items: 2, trash: 1, outfits: 1 });
  });

  it('不是 zip、沒有 manifest.json、manifest 不是備份 → notBackup', async () => {
    const b = await phone({ items: [], outfits: [], outfit_items: [], weather_days: [] }, phoneB);
    expect(await prepareImport(b.deps, 'nothing.zip')).toEqual({ ok: false, reason: 'notBackup' });
    b.zips.set('x.zip', new Map([['photos/a.png', '']]));
    expect(await prepareImport(b.deps, 'x.zip')).toEqual({ ok: false, reason: 'notBackup' });
    b.zips.set('y.zip', new Map([['manifest.json', '{"hello":1}']]));
    expect(await prepareImport(b.deps, 'y.zip')).toEqual({ ok: false, reason: 'notBackup' });
  });

  it('備份版本比 App 新 → newerVersion', async () => {
    const { zip } = await exportFromA();
    const m = JSON.parse(zip.get('manifest.json')!);
    zip.set('manifest.json', JSON.stringify({ ...m, schemaVersion: 9 }));
    const b = await phone({ items: [], outfits: [], outfit_items: [], weather_days: [] }, phoneB);
    expect(await prepareImport(b.deps, await receive(b, zip))).toEqual({ ok: false, reason: 'newerVersion' });
  });
});

describe('applyImport', () => {
  const bLocal = (): BackupData => ({
    items: [item('a', { name: 'B 的 a', image_uri: 'photos/b-a.png' }), item('z', { image_uri: 'photos/z.png' })],
    outfits: [],
    outfit_items: [],
    weather_days: [],
  });

  async function prepared(bData: BackupData) {
    const { zip } = await exportFromA();
    const b = await phone(bData, phoneB);
    const r = await prepareImport(b.deps, await receive(b, zip));
    if (!r.ok) throw new Error('prepare failed');
    return { b, r };
  }

  it('覆蓋：資料換成備份、照片換新檔名、舊照片刪除、套用設定', async () => {
    const { b, r } = await prepared(bLocal());
    const result = await applyImport(b.deps, r, 'replace');
    expect(result).toEqual({ items: 3, outfits: 1 });
    const d = await b.store.dump();
    expect(d.items.map(i => i.id).sort()).toEqual(['a', 'b', 'c']);
    const a = d.items.find(i => i.id === 'a')!;
    expect(a.name).toBe('a');
    expect(a.image_uri).toMatch(/^photos\/new\d+\.png$/);
    expect(b.files.get(`doc/${a.image_uri}`)).toBe('pixels of photos/a.png');
    expect(b.deps.photos.list().sort()).toEqual(
      d.items.map(i => i.image_uri).filter((p): p is string => p !== null).sort(),
    );
    expect(b.applied).toEqual([phoneA]);
    expect(b.notified.count).toBe(1);
    expect([...b.files.keys()].some(k => k.startsWith('cache/work'))).toBe(false);
  });

  it('保留原本資料：同 id 用手機上的（照片不動），只加入新的；不改設定', async () => {
    const { b, r } = await prepared(bLocal());
    const result = await applyImport(b.deps, r, 'merge');
    expect(result).toEqual({ items: 2, outfits: 1 });
    const d = await b.store.dump();
    expect(d.items.map(i => i.id).sort()).toEqual(['a', 'b', 'c', 'z']);
    expect(d.items.find(i => i.id === 'a')!.image_uri).toBe('photos/b-a.png');
    expect(b.files.has('doc/photos/b-a.png')).toBe(true);
    expect(b.files.has('doc/photos/z.png')).toBe(true);
    // 只複製新加入單品的照片（b），a 的照片沒有被多複製一份
    expect(b.deps.photos.list().sort()).toEqual(['photos/b-a.png', 'photos/new1.png', 'photos/z.png']);
    expect(b.applied).toEqual([]);
    expect(b.notified.count).toBe(1);
  });

  it('寫入資料庫失敗：新複製的照片刪掉，原本資料與照片不動', async () => {
    const { b, r } = await prepared(bLocal());
    const before = await b.store.dump();
    jest.spyOn(b.store, 'replaceAll').mockRejectedValueOnce(new Error('db busy'));
    await expect(applyImport(b.deps, r, 'replace')).rejects.toThrow('db busy');
    expect(await b.store.dump()).toEqual(before);
    expect(b.deps.photos.list().sort()).toEqual(['photos/b-a.png', 'photos/z.png']);
    expect(b.applied).toEqual([]);
    expect([...b.files.keys()].some(k => k.startsWith('cache/work'))).toBe(false);
  });

  it('複製照片失敗：已複製的照片刪掉，資料不動', async () => {
    const { b, r } = await prepared(bLocal());
    const before = await b.store.dump();
    b.failSave.on = true;
    await expect(applyImport(b.deps, r, 'replace')).rejects.toThrow('disk full');
    expect(await b.store.dump()).toEqual(before);
    expect(b.deps.photos.list().sort()).toEqual(['photos/b-a.png', 'photos/z.png']);
  });

  it('備份裡缺照片檔時該單品照片為 null，其他照常匯入', async () => {
    const { zip } = await exportFromA();
    zip.delete('photos/b.png');
    const b = await phone({ items: [], outfits: [], outfit_items: [], weather_days: [] }, phoneB);
    const r = await prepareImport(b.deps, await receive(b, zip));
    if (!r.ok) throw new Error('prepare failed');
    await applyImport(b.deps, r, 'replace');
    const d = await b.store.dump();
    expect(d.items.find(i => i.id === 'b')!.image_uri).toBeNull();
    expect(d.items.find(i => i.id === 'a')!.image_uri).not.toBeNull();
  });
});
