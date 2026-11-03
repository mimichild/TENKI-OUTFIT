import { CANVAS_HEIGHT_RATIO } from '@/lib/outfitCanvas';
import { alphaBounds, layoutOutfit, visibleRect, type PieceShape } from '@/lib/outfitLayout';
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

describe('layoutOutfit — worn look', () => {
  const top = item('top');
  const bottom = item('bottom');
  const shoes = item('shoes');
  const bag = item('bag');
  const accessory = item('accessory');
  const outerwear = item('outerwear');

  it('stacks top, bottom and shoes in one column so they touch', () => {
    const r = rects([top, bottom, shoes], { [top.id]: wide, [bottom.id]: tall, [shoes.id]: padded });
    const cx = (k: string) => r[k].x + r[k].w / 2;
    expect(cx('top')).toBeCloseTo(0.5);
    expect(cx('bottom')).toBeCloseTo(0.5);
    expect(cx('shoes')).toBeCloseTo(0.5);
    const topEnd = r.top.y + r.top.h;
    // 下著上緣壓住上衣下襬一點
    expect(r.bottom.y).toBeLessThan(topEnd);
    expect(r.bottom.y).toBeGreaterThan(topEnd - r.top.h * 0.3);
    // 鞋子壓在下著下緣
    const bottomEnd = r.bottom.y + r.bottom.h;
    expect(r.shoes.y).toBeLessThan(bottomEnd);
    expect(r.shoes.y + r.shoes.h).toBeGreaterThan(bottomEnd);
    expect(r.top.z).toBeGreaterThan(r.bottom.z);
    expect(r.shoes.z).toBeGreaterThan(r.bottom.z);
  });

  it('gives the same visible result whatever the transparent margins are', () => {
    const tight: PieceShape = { aspect: 1, bounds: { x0: 0, y0: 0, x1: 1, y1: 1 } };
    // 同一件衣服（寬:高 = 0.6*0.75 : 0.45 = 1:1）多了透明邊
    const a = rects([top, bottom], { [top.id]: tight, [bottom.id]: tight });
    const b = rects([top, bottom], { [top.id]: padded, [bottom.id]: padded });
    for (const k of ['top', 'bottom']) {
      expect(b[k].x).toBeCloseTo(a[k].x);
      expect(b[k].y).toBeCloseTo(a[k].y);
      expect(b[k].w).toBeCloseTo(a[k].w);
      expect(b[k].h).toBeCloseTo(a[k].h);
    }
  });

  it('keeps everything inside the canvas, shrinking tall outfits', () => {
    const veryTall: PieceShape = { aspect: 0.3, bounds: { x0: 0, y0: 0, x1: 1, y1: 1 } };
    const all = [outerwear, top, bottom, shoes, bag, accessory];
    const r = rects(all, Object.fromEntries(all.map(i => [i.id, veryTall])));
    for (const k of Object.keys(r)) {
      expect(r[k].x).toBeGreaterThanOrEqual(-1e-9);
      expect(r[k].y).toBeGreaterThanOrEqual(-1e-9);
      expect(r[k].x + r[k].w).toBeLessThanOrEqual(1 + 1e-9);
      expect(r[k].y + r[k].h).toBeLessThanOrEqual(CANVAS_HEIGHT_RATIO + 1e-9);
    }
  });

  it('puts outerwear half-visible behind the top, on the left', () => {
    const r = rects([outerwear, top, bottom], { [outerwear.id]: padded, [top.id]: padded, [bottom.id]: tall });
    const cx = (k: string) => r[k].x + r[k].w / 2;
    expect(cx('outerwear')).toBeLessThan(0.5);
    expect(cx('top')).toBeGreaterThan(0.5);
    expect(r.outerwear.x + r.outerwear.w).toBeGreaterThan(r.top.x); // 有重疊
    expect(r.outerwear.y).toBeCloseTo(r.top.y);
    expect(r.outerwear.z).toBeLessThan(r.top.z);
    expect(cx('bottom')).toBeCloseTo(0.5);
  });

  it('puts the bag right-middle and the accessory left-middle, at waist height, on top', () => {
    const r = rects([top, bottom, shoes, bag, accessory], {});
    const cx = (k: string) => r[k].x + r[k].w / 2;
    const cy = (k: string) => r[k].y + r[k].h / 2;
    expect(cx('bag')).toBeGreaterThan(0.6);
    expect(cx('accessory')).toBeLessThan(0.4);
    const waist = r.bottom.y;
    expect(Math.abs(cy('bag') - waist)).toBeLessThan(0.1);
    expect(Math.abs(cy('accessory') - waist)).toBeLessThan(0.1);
    expect(r.accessory.w).toBeGreaterThan(r.shoes.w * 0.9);
    for (const k of ['top', 'bottom', 'shoes']) {
      expect(r.bag.z).toBeGreaterThan(r[k].z);
      expect(r.accessory.z).toBeGreaterThan(r[k].z);
    }
  });

  it('uses a one-piece as the whole body', () => {
    const dress = item('onepiece');
    const r = rects([dress, shoes], { [dress.id]: tall });
    expect(r.onepiece.x + r.onepiece.w / 2).toBeCloseTo(0.5);
    expect(r.shoes.y).toBeLessThan(r.onepiece.y + r.onepiece.h);
  });

  it('keeps the input order and distinct z', () => {
    const all = [outerwear, top, bottom, shoes, bag, accessory];
    const layout = layoutOutfit(all, new Map());
    expect(layout.map(p => p.itemId)).toEqual(all.map(i => i.id));
    expect(new Set(layout.map(p => p.z)).size).toBe(all.length);
  });
});
