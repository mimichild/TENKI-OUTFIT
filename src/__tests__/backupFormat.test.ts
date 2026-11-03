import {
  BACKUP_FORMAT,
  buildManifest,
  filterNewRows,
  parseManifest,
  photoPathsOf,
  remapPhotoPaths,
  summarizeBackup,
  type BackupData,
} from '@/lib/backupFormat';

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, brand: '', category: 'top', price: 100,
  occasions: '[]', seasons: '["summer"]',
  image_uri: `photos/${id}.png`, original_uri: `photos/${id}.jpg`,
  created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z',
  last_used_at: null, deleted_at: null, archived_at: null,
  ...extra,
});

const data = (): BackupData => ({
  items: [
    item('a'),
    item('b', { deleted_at: '2026-11-02T00:00:00.000Z' }),
    item('c', { archived_at: '2026-11-02T00:00:00.000Z', image_uri: null, original_uri: null }),
  ],
  outfits: [
    { id: 'o1', name: '', date: '2026-10-30', created_at: '2026-10-30T00:00:00.000Z', updated_at: '2026-10-30T00:00:00.000Z' },
  ],
  outfit_items: [
    { outfit_id: 'o1', item_id: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0 },
    { outfit_id: 'o1', item_id: 'c', x: 0.2, y: 0.3, scale: 1.2, rotation: 0.1, z: 1 },
  ],
  weather_days: [
    {
      county: '臺北市', town: '', date: '2026-10-30', max_t: 25, min_t: 19, max_at: 26, min_at: 18,
      pop: 20, wx_code: '01', wx_text: '晴', fetched_at: '2026-10-30T00:00:00.000Z',
    },
  ],
});

const settings = { language: 'en', county: '高雄市', currency: 'JPY', themeColor: 'sky' } as const;
const meta = { schemaVersion: 2, appVersion: '1.0.0', exportedAt: '2026-11-03T00:00:00.000Z' };

const text = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ ...buildManifest(data(), settings, meta), ...overrides });

describe('buildManifest', () => {
  it('包含格式、版本、設定與資料，不含授權碼', () => {
    const m = buildManifest(data(), { ...settings, cwaApiKey: 'SECRET' } as never, meta);
    expect(m.format).toBe(BACKUP_FORMAT);
    expect(m.formatVersion).toBe(1);
    expect(m.schemaVersion).toBe(2);
    expect(m.appVersion).toBe('1.0.0');
    expect(m.settings).toEqual(settings);
    expect(JSON.stringify(m)).not.toContain('SECRET');
    expect(m.data.items).toHaveLength(3);
  });
});

describe('parseManifest', () => {
  it('讀回匯出的內容', () => {
    const r = parseManifest(text(), { schemaVersion: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.data).toEqual(data());
    expect(r.manifest.settings).toEqual(settings);
  });

  it('不是 JSON 或不是本 App 的備份 → notBackup', () => {
    expect(parseManifest('not json', { schemaVersion: 2 })).toEqual({ ok: false, reason: 'notBackup' });
    expect(parseManifest('{"hello":1}', { schemaVersion: 2 })).toEqual({ ok: false, reason: 'notBackup' });
    expect(parseManifest('[]', { schemaVersion: 2 })).toEqual({ ok: false, reason: 'notBackup' });
  });

  it('備份的 DB 版本或格式版本比 App 新 → newerVersion', () => {
    expect(parseManifest(text({ schemaVersion: 3 }), { schemaVersion: 2 })).toEqual({ ok: false, reason: 'newerVersion' });
    expect(parseManifest(text({ formatVersion: 2 }), { schemaVersion: 2 })).toEqual({ ok: false, reason: 'newerVersion' });
  });

  it('舊版 DB（v1，沒有 archived_at）可以匯入，缺的欄位補 null', () => {
    const m = JSON.parse(text({ schemaVersion: 1 }));
    for (const i of m.data.items) delete i.archived_at;
    const r = parseManifest(JSON.stringify(m), { schemaVersion: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.data.items.every(i => i.archived_at === null)).toBe(true);
  });

  it.each([
    ['單品缺 id', (m: any) => { m.data.items[0].id = ''; }],
    ['價格不是數字', (m: any) => { m.data.items[0].price = '100'; }],
    ['單品 id 重複', (m: any) => { m.data.items[1].id = 'a'; }],
    ['穿搭 id 重複', (m: any) => { m.data.outfits.push({ ...m.data.outfits[0] }); }],
    ['穿搭日期格式錯', (m: any) => { m.data.outfits[0].date = '2026/10/30'; }],
    ['位置參照不存在的單品', (m: any) => { m.data.outfit_items[0].item_id = 'zzz'; }],
    ['位置參照不存在的穿搭', (m: any) => { m.data.outfit_items[0].outfit_id = 'zzz'; }],
    ['同一套穿搭同一件重複', (m: any) => { m.data.outfit_items[1].item_id = 'a'; }],
    ['data 不是物件', (m: any) => { m.data = null; }],
    ['天氣溫度不是數字', (m: any) => { m.data.weather_days[0].max_t = 'hot'; }],
  ])('%s → corrupt', (_label, mutate) => {
    const m = JSON.parse(text());
    mutate(m);
    expect(parseManifest(JSON.stringify(m), { schemaVersion: 2 })).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('照片路徑不是 photos/<檔名> 的一律清成 null（避免寫到 App 資料夾外）', () => {
    const m = JSON.parse(text());
    m.data.items[0].image_uri = '../../databases/x.db';
    m.data.items[0].original_uri = 'file:///etc/passwd';
    const r = parseManifest(JSON.stringify(m), { schemaVersion: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.data.items[0].image_uri).toBeNull();
    expect(r.manifest.data.items[0].original_uri).toBeNull();
  });

  it('設定不合法時退回預設', () => {
    const r = parseManifest(text({ settings: { language: 'xx', county: '火星', currency: 'ABC', themeColor: 'nope' } }), { schemaVersion: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.settings).toEqual({ language: 'zh-TW', county: '臺北市', currency: 'TWD', themeColor: 'sky' });
  });
});

describe('photoPathsOf / remapPhotoPaths', () => {
  it('列出不重複的照片路徑', () => {
    const d = data();
    d.items[1].image_uri = 'photos/a.png';
    expect(photoPathsOf(d).sort()).toEqual(['photos/a.jpg', 'photos/a.png', 'photos/b.jpg']);
  });

  it('換成新路徑；對照表沒有的（照片檔不在備份裡）改成 null', () => {
    const d = remapPhotoPaths(data(), new Map([['photos/a.png', 'photos/new-a.png']]));
    expect(d.items[0].image_uri).toBe('photos/new-a.png');
    expect(d.items[0].original_uri).toBeNull();
    expect(d.items[1].image_uri).toBeNull();
    expect(data().items[0].image_uri).toBe('photos/a.png');
  });
});

describe('filterNewRows', () => {
  it('只留手機上沒有的單品、穿搭（及其位置）、天氣日期', () => {
    const d = filterNewRows(data(), {
      itemIds: new Set(['a']),
      outfitIds: new Set(),
      weatherKeys: new Set(['臺北市||2026-10-30']),
    });
    expect(d.items.map(i => i.id)).toEqual(['b', 'c']);
    expect(d.outfits.map(o => o.id)).toEqual(['o1']);
    expect(d.outfit_items).toHaveLength(2);
    expect(d.weather_days).toHaveLength(0);
  });

  it('穿搭已存在時連同位置一起略過', () => {
    const d = filterNewRows(data(), { itemIds: new Set(), outfitIds: new Set(['o1']), weatherKeys: new Set() });
    expect(d.outfits).toHaveLength(0);
    expect(d.outfit_items).toHaveLength(0);
  });
});

describe('summarizeBackup', () => {
  it('單品（不含暫存區、封存）、暫存區、穿搭數', () => {
    expect(summarizeBackup(data())).toEqual({ items: 1, trash: 1, outfits: 1 });
  });
});
