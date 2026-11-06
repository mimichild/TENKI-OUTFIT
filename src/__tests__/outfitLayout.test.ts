import { CANVAS_HEIGHT_RATIO } from '@/lib/outfitCanvas';
import { alphaBounds, layoutOutfit, visibleRect, type PieceShape, type Rect } from '@/lib/outfitLayout';
import type { Category, Item } from '@/types/models';

let seq = 0;
function item(category: Category): Item {
  seq += 1;
  return {
    id: `i${seq}`, name: '', brand: '', category, price: null, occasions: [], seasons: [], imageUri: `p${seq}.png`, originalUri: null,
    createdAt: '', updatedAt: '', lastUsedAt: null, deletedAt: null,
  };
}

/** 直式照片、衣服只佔中間 */
const padded: PieceShape = { aspect: 0.75, bounds: { x0: 0.2, y0: 0.25, x1: 0.8, y1: 0.7 } };
const tall: PieceShape = { aspect: 0.6, bounds: { x0: 0.15, y0: 0.05, x1: 0.85, y1: 0.95 } };
const wide: PieceShape = { aspect: 1.5, bounds: { x0: 0.1, y0: 0.2, x1: 0.9, y1: 0.8 } };

function rects(items: Item[], shapes: Record<string, PieceShape | null>) {
  const map = new Map(Object.entries(shapes));
  const layout = layoutOutfit(items, map);
  return Object.fromEntries(items.map((it, i) => [it.category, { ...visibleRect(layout[i], map.get(it.id) ?? null), z: layout[i].z }]));
}

describe('alphaBounds', () => {
  it('finds the non-transparent area as fractions of the image', () => {
    const w = 4;
    const h = 2;
    const px = new Uint8Array(w * h * 4);
    px[(1 * w + 2) * 4 + 3] = 255; // (2,1)
    px[(0 * w + 1) * 4 + 3] = 200; // (1,0)
    expect(alphaBounds(px, w, h)).toEqual({ x0: 0.25, y0: 0, x1: 0.75, y1: 1 });
  });
  it('ignores nearly transparent pixels and returns null when nothing is visible', () => {
    const px = new Uint8Array(2 * 2 * 4);
    px[3] = 5;
    expect(alphaBounds(px, 2, 2)).toBeNull();
  });
});

describe('visibleRect', () => {
  it('is the whole box without a measured shape', () => {
    const r = visibleRect({ itemId: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0 }, null);
    expect(r.x).toBeCloseTo(0.275);
    expect(r.w).toBeCloseTo(0.45);
    expect(r.h).toBeCloseTo(0.45);
  });
  it('accounts for contain-fit letterboxing and transparent margins', () => {
    // 直式 0.75：方框裡圖片寬 0.75、左右各留 0.125
    const r = visibleRect({ itemId: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0 }, padded);
    const size = 0.45;
    expect(r.x).toBeCloseTo(0.275 + (0.125 + 0.2 * 0.75) * size);
    expect(r.w).toBeCloseTo(0.6 * 0.75 * size);
    expect(r.y).toBeCloseTo(0.275 + 0.25 * size);
    expect(r.h).toBeCloseTo(0.45 * size);
  });
});

describe('layoutOutfit — fixed spots', () => {
  const top = item('top');
  const bottom = item('bottom');
  const shoes = item('shoes');
  const bag = item('bag');
  const accessory = item('accessory');
  const outerwear = item('outerwear');
  const all = [outerwear, top, bottom, shoes, bag, accessory];
  const mid = CANVAS_HEIGHT_RATIO / 2;
  const cx = (r: Rect) => r.x + r.w / 2;
  const cy = (r: Rect) => r.y + r.h / 2;

  it('top left-upper, bottom left-lower, outerwear right-upper, bag right above the shoes, shoes right-lower, accessory in the center', () => {
    const r = rects(all, {});
    expect(cx(r.top)).toBeLessThan(0.5);
    expect(cy(r.top)).toBeLessThan(mid);
    expect(cx(r.bottom)).toBeLessThan(0.5);
    expect(cy(r.bottom)).toBeGreaterThan(mid);
    expect(cx(r.outerwear)).toBeGreaterThan(0.5);
    expect(cy(r.outerwear)).toBeLessThan(mid);
    expect(cx(r.shoes)).toBeGreaterThan(0.5);
    // 包包在鞋子正上方、比以前大
    expect(cx(r.bag)).toBeCloseTo(cx(r.shoes));
    expect(r.bag.y + r.bag.h).toBeLessThanOrEqual(r.shoes.y + 1e-9);
    expect(r.bag.y).toBeGreaterThanOrEqual(r.outerwear.y + r.outerwear.h - 1e-9);
    expect(Math.max(r.bag.w, r.bag.h)).toBeGreaterThan(0.36);
    // 配件在畫布正中央、疊在最上面
    expect(cx(r.accessory)).toBeCloseTo(0.5);
    expect(cy(r.accessory)).toBeCloseTo(mid);
    const z = Object.fromEntries(layoutOutfit(all, new Map()).map((p, i) => [all[i].category, p.z]));
    expect(z.accessory).toBe(all.length - 1);
  });

  it('gives the bottom a longer, bigger spot than the top', () => {
    const r = rects([top, bottom], { [top.id]: tall, [bottom.id]: tall });
    expect(r.bottom.h).toBeGreaterThan(r.top.h * 1.4);
    expect(r.bottom.w * r.bottom.h).toBeGreaterThan(r.top.w * r.top.h);
  });

  it('fills the spot with the visible clothing whatever the transparent margins are', () => {
    const tight: PieceShape = { aspect: 1, bounds: { x0: 0, y0: 0, x1: 1, y1: 1 } };
    const a = rects([top, bag], { [top.id]: tight, [bag.id]: tight });
    const b = rects([top, bag], { [top.id]: padded, [bag.id]: padded });
    for (const k of ['top', 'bag']) {
      expect(b[k].x).toBeCloseTo(a[k].x);
      expect(b[k].y).toBeCloseTo(a[k].y);
      expect(b[k].w).toBeCloseTo(a[k].w);
      expect(b[k].h).toBeCloseTo(a[k].h);
    }
  });

  it('puts an overlay (vest) in the outerwear spot; with both, outerwear above overlay above bag, nothing overlapping', () => {
    const overlay = item('overlay');
    const alone = rects([top, overlay, bottom], { [top.id]: wide, [overlay.id]: wide });
    expect(cx(alone.overlay)).toBeGreaterThan(0.5);
    expect(cy(alone.overlay)).toBeLessThan(mid);
    const list = [outerwear, top, overlay, bottom, shoes, bag];
    const r = rects(list, { [top.id]: wide, [overlay.id]: tall, [outerwear.id]: tall, [bottom.id]: tall, [shoes.id]: wide, [bag.id]: padded });
    expect(r.outerwear.y + r.outerwear.h).toBeLessThanOrEqual(r.overlay.y + 1e-9);
    expect(r.overlay.y + r.overlay.h).toBeLessThanOrEqual(r.bag.y + 1e-9);
    expect(r.bag.y + r.bag.h).toBeLessThanOrEqual(r.shoes.y + 1e-9);
    const keys = Object.keys(r);
    const overlap = (a: Rect, b: Rect) =>
      Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) expect([keys[i], keys[j], overlap(r[keys[i]], r[keys[j]]) < 0.01]).toEqual([keys[i], keys[j], true]);
  });

  it('keeps everything inside the canvas without overlapping between spots (except the accessory in the center)', () => {
    const shapes = { [top.id]: wide, [bottom.id]: tall, [outerwear.id]: tall, [shoes.id]: wide, [bag.id]: padded, [accessory.id]: tall };
    const r = rects(all, shapes);
    const keys = Object.keys(r).filter(k => k !== 'accessory');
    for (const k of Object.keys(r)) {
      expect(r[k].x).toBeGreaterThanOrEqual(-1e-9);
      expect(r[k].y).toBeGreaterThanOrEqual(-1e-9);
      expect(r[k].x + r[k].w).toBeLessThanOrEqual(1 + 1e-9);
      expect(r[k].y + r[k].h).toBeLessThanOrEqual(CANVAS_HEIGHT_RATIO + 1e-9);
    }
    const overlap = (a: Rect, b: Rect) =>
      Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        expect([keys[i], keys[j], overlap(r[keys[i]], r[keys[j]]) < 0.01]).toEqual([keys[i], keys[j], true]);
      }
    }
  });

  it('keeps a very thin piece (e.g. a necklace) inside its spot even when the zoom limit kicks in', () => {
    const thin: PieceShape = { aspect: 1, bounds: { x0: 0.49, y0: 0.45, x1: 0.51, y1: 0.55 } };
    const r = rects([accessory, bag], { [accessory.id]: thin });
    expect(r.accessory.x).toBeGreaterThanOrEqual(0.38 - 1e-9);
    expect(r.accessory.x + r.accessory.w).toBeLessThanOrEqual(0.62 + 1e-9);
    expect(r.accessory.y + r.accessory.h).toBeLessThanOrEqual(CANVAS_HEIGHT_RATIO);
  });

  it('gives a one-piece the whole left side', () => {
    const dress = item('onepiece');
    const r = rects([dress, shoes], { [dress.id]: tall });
    expect(cx(r.onepiece)).toBeLessThan(0.5);
    expect(r.onepiece.h).toBeGreaterThan(CANVAS_HEIGHT_RATIO * 0.7);
  });

  it('畫布比較高時（給 ratio）格子跟著往下拉長，鞋子貼近畫布底部', () => {
    const shoes = item('shoes');
    const top = item('top');
    const map = new Map<string, PieceShape | null>([[shoes.id, wide], [top.id, padded]]);
    const tallRatio = 2;
    const layout = layoutOutfit([top, shoes], map, tallRatio);
    const r = visibleRect(layout[1], wide);
    expect(r.y + r.h).toBeGreaterThan(CANVAS_HEIGHT_RATIO);
    expect(r.y + r.h).toBeLessThanOrEqual(tallRatio);
    // 沒給 ratio 時和原本一樣
    expect(layoutOutfit([top, shoes], map)).toEqual(layoutOutfit([top, shoes], map, CANVAS_HEIGHT_RATIO));
  });

  it('keeps the input order and distinct z, outerwear at the back', () => {
    const layout = layoutOutfit(all, new Map());
    expect(layout.map(p => p.itemId)).toEqual(all.map(i => i.id));
    expect(new Set(layout.map(p => p.z)).size).toBe(all.length);
    expect(layout[0].z).toBe(0);
  });
});
