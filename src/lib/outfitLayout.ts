import type { Category, Item, OutfitItemPlacement } from '@/types/models';
import { CANVAS_HEIGHT_RATIO, MAX_SCALE, MIN_SCALE, PIECE_BASE_SIZE } from './outfitCanvas';

/**
 * 「穿在身上」的自動排版（使用者指定 2026-11-03）：
 * 上衣在上、下著接在下面壓住下襬一點、鞋子壓在下著下緣，一條直線置中；
 * 外套在上衣左後方露出一半；包包右邊腰部、配件左邊腰部，疊在最上面。
 *
 * 去背照片四周常有透明留白，每張都不一樣，所以排版以「照片裡真正有衣服的範圍」（PieceShape）計算；
 * 量不到時退回整張照片。所有長度以畫布寬度為單位，畫布高 = CANVAS_HEIGHT_RATIO。
 */

/** 照片中不透明部分的範圍（照片寬高的比例，x1/y1 不含） */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PieceShape {
  /** 照片寬 / 高 */
  aspect: number;
  bounds: Bounds;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ALPHA_THRESHOLD = 24;

/** RGBA 像素 → 不透明範圍；完全透明回傳 null */
export function alphaBounds(pixels: Uint8Array, width: number, height: number, threshold = ALPHA_THRESHOLD): Bounds | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (pixels[row + x * 4 + 3] < threshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x0: x0 / width, y0: y0 / height, x1: (x1 + 1) / width, y1: (y1 + 1) / height };
}

const FULL: PieceShape = { aspect: 1, bounds: { x0: 0, y0: 0, x1: 1, y1: 1 } };

/** 照片以 contain 放進正方形方框後，衣服在方框裡的位置（方框邊長的比例） */
function contentInBox(shape: PieceShape | null) {
  const { aspect, bounds: b } = shape ?? FULL;
  const dispW = aspect >= 1 ? 1 : aspect;
  const dispH = aspect >= 1 ? 1 / aspect : 1;
  return {
    left: (1 - dispW) / 2 + b.x0 * dispW,
    top: (1 - dispH) / 2 + b.y0 * dispH,
    w: Math.max(1e-3, (b.x1 - b.x0) * dispW),
    h: Math.max(1e-3, (b.y1 - b.y0) * dispH),
  };
}

/** 畫布上看得到衣服的範圍（不含旋轉） */
export function visibleRect(p: OutfitItemPlacement, shape: PieceShape | null): Rect {
  const size = PIECE_BASE_SIZE * p.scale;
  const c = contentInBox(shape);
  const boxLeft = p.x - size / 2;
  const boxTop = p.y - size / 2;
  return { x: boxLeft + c.left * size, y: boxTop + c.top * size, w: c.w * size, h: c.h * size };
}

/** 讓衣服剛好落在 rect（以寬度為準）的方框位置 */
function placementFor(rect: Rect, shape: PieceShape | null): Pick<OutfitItemPlacement, 'x' | 'y' | 'scale'> {
  const c = contentInBox(shape);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, rect.w / c.w / PIECE_BASE_SIZE));
  const size = PIECE_BASE_SIZE * scale;
  return {
    x: rect.x - c.left * size + size / 2,
    y: rect.y - c.top * size + size / 2,
    scale,
  };
}

/** 每類衣服看得到的寬度（畫布寬度的比例，縮放前） */
const WIDTH: Record<Category, number> = {
  top: 0.52,
  outerwear: 0.5,
  onepiece: 0.5,
  bottom: 0.44,
  shoes: 0.24,
  bag: 0.36,
  accessory: 0.28,
  other: 0.36,
};

/** 疊放順序：外套最後面，包包、配件最前面 */
const Z_RANK: Record<Category, number> = {
  outerwear: 0,
  onepiece: 1,
  bottom: 1,
  top: 2,
  shoes: 3,
  other: 4,
  bag: 5,
  accessory: 6,
};

const MARGIN = 0.05;
/** 下著壓住上衣下襬的比例（上衣高度） */
const WAIST_OVERLAP = 0.1;
/** 鞋子壓在下著下緣的比例（鞋子高度） */
const SHOE_OVERLAP = 0.45;
/** 外套與上衣各往左右移開的距離（衣服寬度的比例） */
const OUTER_SHIFT = 0.28;
/** 包包、配件中心離中線的距離 */
const SIDE_OFFSET = 0.24;
/** 包包、配件中心比腰線再低一點（自身高度的比例），像拎在手上 */
const SIDE_DROP = 0.2;

export function layoutOutfit(items: Item[], shapes: ReadonlyMap<string, PieceShape | null>): OutfitItemPlacement[] {
  const shapeOf = (i: Item) => shapes.get(i.id) ?? null;
  const size = (i: Item) => {
    const c = contentInBox(shapeOf(i));
    const w = WIDTH[i.category];
    return { w, h: (w * c.h) / c.w };
  };
  const first = (c: Category) => items.find(i => i.category === c);

  const outer = first('outerwear');
  const upper = first('top') ?? first('onepiece') ?? outer;
  const lower = first('bottom');
  const shoes = first('shoes');
  const sideOuter = outer && upper !== outer ? outer : undefined;

  // 身體這一條（未縮放，y 從 0 開始）
  const column: { item: Item; y: number; w: number; h: number }[] = [];
  let end = 0;
  if (upper) {
    const s = size(upper);
    column.push({ item: upper, y: 0, ...s });
    end = s.h;
  }
  if (lower && lower !== upper) {
    const s = size(lower);
    const prev = column.at(-1);
    const y = prev ? end - prev.h * WAIST_OVERLAP : 0;
    column.push({ item: lower, y, ...s });
    end = y + s.h;
  }
  const waistY = lower && column.length > 1 ? column[1].y : upper ? end * 0.55 : 0;
  if (shoes) {
    const s = size(shoes);
    const y = column.length > 0 ? end - s.h * SHOE_OVERLAP : 0;
    column.push({ item: shoes, y, ...s });
    end = Math.max(end, y + s.h);
  }

  // 整套放進畫布：高度、寬度都要放得下
  const outerSize = sideOuter ? size(sideOuter) : null;
  const upperW = column[0]?.w ?? 0;
  const upperShift = outerSize ? upperW * OUTER_SHIFT : 0;
  const outerShift = outerSize ? outerSize.w * OUTER_SHIFT : 0;
  const groupHalf = Math.max(
    ...column.map(c => c.w / 2),
    upperShift + upperW / 2,
    outerSize ? outerShift + outerSize.w / 2 : 0,
    0.01,
  );
  const availH = CANVAS_HEIGHT_RATIO - MARGIN * 2;
  const availHalf = 0.5 - MARGIN;
  const totalH = Math.max(end, outerSize?.h ?? 0, 0.01);
  const f = Math.min(1, availH / totalH, availHalf / groupHalf);
  const top0 = (CANVAS_HEIGHT_RATIO - totalH * f) / 2;

  const rects = new Map<string, Rect>();
  column.forEach((c, i) => {
    const shift = i === 0 && c.item === upper ? upperShift : 0;
    const w = c.w * f;
    rects.set(c.item.id, { x: 0.5 + shift * f - w / 2, y: top0 + c.y * f, w, h: c.h * f });
  });
  if (sideOuter && outerSize) {
    const w = outerSize.w * f;
    rects.set(sideOuter.id, { x: 0.5 - outerShift * f - w / 2, y: top0, w, h: outerSize.h * f });
  }

  // 包包右邊、配件左邊，腰部高度；超出畫布就往內收
  const waist = top0 + waistY * f;
  const side = (i: Item | undefined, dir: 1 | -1) => {
    if (!i || rects.has(i.id)) return;
    const s = size(i);
    const k = Math.min(1, Math.max(f, 0.75));
    let w = s.w * k;
    let h = s.h * k;
    const fit = Math.min(1, (0.5 - MARGIN) / w, (CANVAS_HEIGHT_RATIO - MARGIN * 2) / h);
    w *= fit;
    h *= fit;
    const cx = Math.min(1 - MARGIN - w / 2, Math.max(MARGIN + w / 2, 0.5 + dir * SIDE_OFFSET));
    const cy = Math.min(CANVAS_HEIGHT_RATIO - MARGIN - h / 2, Math.max(MARGIN + h / 2, waist + h * SIDE_DROP));
    rects.set(i.id, { x: cx - w / 2, y: cy - h / 2, w, h });
  };
  side(first('bag'), 1);
  side(first('accessory'), -1);

  // 其他沒排到的（重複分類、「其他」）放中間
  for (const i of items) {
    if (rects.has(i.id)) continue;
    const s = size(i);
    const w = s.w * f;
    const h = Math.min(s.h * f, availH);
    rects.set(i.id, { x: 0.5 - w / 2, y: (CANVAS_HEIGHT_RATIO - h) / 2, w, h });
  }

  const order = items
    .map((i, idx) => ({ id: i.id, rank: Z_RANK[i.category], idx }))
    .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
    .map(o => o.id);
  return items.map(i => ({
    itemId: i.id,
    ...placementFor(rects.get(i.id)!, shapeOf(i)),
    rotation: 0,
    z: order.indexOf(i.id),
  }));
}
