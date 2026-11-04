import { File, Paths } from 'expo-file-system';
import type { PieceShape } from './outfitLayout';
import { COLORS } from '@/constants/options';
import { isMask } from './pieceHit';

/**
 * 照片範圍（PieceShape）的檔案快取：documents/photo-bounds.json
 * `{ version: 3, entries: { "photos/x.png": PieceShape | null } }`
 * - key 是相對路徑；照片存檔後不會原地改寫（每次存都是新 uuid 檔名），所以不會過期
 * - 讀一次進記憶體；寫入延遲合併。壞掉或讀不到就當作空的（重新量即可）
 * - 不進備份：換手機後重量
 */
// 2：加入衣服遮罩（mask）；3：加入主色（color）。舊版快取整個作廢，照片會重新量一次
const VERSION = 3;
const FILE_NAME = 'photo-bounds.json';
const WRITE_DELAY_MS = 500;

export interface BoundsCacheIo {
  /** 檔案內容；沒有檔案時為 null */
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

export interface BoundsCache {
  /** undefined = 沒有快取 */
  get(path: string): Promise<PieceShape | null | undefined>;
  set(path: string, shape: PieceShape | null): Promise<void>;
  remove(paths: string[]): Promise<void>;
  /** 只留下這些路徑（清掉已經沒有單品使用的照片的項目） */
  retainOnly(paths: string[]): Promise<void>;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isShape(v: unknown): v is PieceShape | null {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const s = v as { aspect?: unknown; bounds?: Record<string, unknown> };
  const b = s.bounds;
  const { mask: m, color: c } = v as { mask?: unknown; color?: unknown };
  return (
    isNum(s.aspect) && !!b && typeof b === 'object' && isNum(b.x0) && isNum(b.y0) && isNum(b.x1) && isNum(b.y1) &&
    (m === undefined || isMask(m)) && (c === undefined || (COLORS as unknown[]).includes(c))
  );
}

function parse(text: string | null): Map<string, PieceShape | null> {
  const entries = new Map<string, PieceShape | null>();
  if (!text) return entries;
  try {
    const data = JSON.parse(text) as { version?: unknown; entries?: unknown };
    if (!data || data.version !== VERSION || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) return entries;
    for (const [k, v] of Object.entries(data.entries)) if (isShape(v)) entries.set(k, v);
  } catch {
    // 壞掉的快取檔：當作空的，之後重新量並覆寫
  }
  return entries;
}

export function createBoundsCache(io: BoundsCacheIo): BoundsCache {
  let loaded: Promise<Map<string, PieceShape | null>> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const load = () =>
    (loaded ??= io.read().then(parse, e => {
      console.warn('讀取照片範圍快取失敗', e);
      return new Map<string, PieceShape | null>();
    }));

  const scheduleWrite = (entries: Map<string, PieceShape | null>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const text = JSON.stringify({ version: VERSION, entries: Object.fromEntries(entries) });
      io.write(text).catch(e => console.warn('寫入照片範圍快取失敗', e));
    }, WRITE_DELAY_MS);
  };

  return {
    async get(path) {
      const entries = await load();
      return entries.has(path) ? entries.get(path) : undefined;
    },
    async set(path, shape) {
      const entries = await load();
      entries.set(path, shape);
      scheduleWrite(entries);
    },
    async remove(paths) {
      const entries = await load();
      let changed = false;
      for (const p of paths) changed = entries.delete(p) || changed;
      if (changed) scheduleWrite(entries);
    },
    async retainOnly(paths) {
      const entries = await load();
      const keep = new Set(paths);
      let changed = false;
      for (const k of [...entries.keys()]) if (!keep.has(k)) changed = entries.delete(k) || changed;
      if (changed) scheduleWrite(entries);
    },
  };
}

const file = () => new File(Paths.document, FILE_NAME);

export const boundsCache: BoundsCache = createBoundsCache({
  async read() {
    const f = file();
    return f.exists ? f.text() : null;
  },
  async write(text) {
    file().write(text);
  },
});
