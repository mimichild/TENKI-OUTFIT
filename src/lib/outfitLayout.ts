import type { Category, Item, OutfitItemPlacement } from '@/types/models';
import { MAX_SCALE, MIN_SCALE, PIECE_BASE_SIZE } from './outfitCanvas';

/**
 * 穿搭建議的自動排版（使用者指定 2026-11-03）：每個分類一個固定格子——
 * 上衣左上、下著左下（比上衣長、格子比較大）、外套右上、包包右中、配件在包包左邊、鞋子右下；連身佔整個左半邊。
 *
 * 去背照片四周常有透明留白，每張都不一樣，所以以「照片裡真正有衣服的範圍」（PieceShape）
 * 等比放大塞滿格子並置中；量不到時退回整張照片。所有長度以畫布寬度為單位，畫布高 = CANVAS_HEIGHT_RATIO。
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

/** 每個分類的格子（畫布寬度為單位；畫布 1 × 4/3） */
const SPOTS: Record<Category, Rect> = {
  top: { x: 0.04, y: 0.04, w: 0.44, h: 0.44 },
  bottom: { x: 0.04, y: 0.5, w: 0.44, h: 0.79 },
  onepiece: { x: 0.04, y: 0.04, w: 0.44, h: 1.25 },
  outerwear: { x: 0.52, y: 0.04, w: 0.44, h: 0.46 },
  accessory: { x: 0.5, y: 0.6, w: 0.2, h: 0.22 },
  bag: { x: 0.7, y: 0.54, w: 0.26, h: 0.34 },
  shoes: { x: 0.56, y: 0.92, w: 0.4, h: 0.37 },
  other: { x: 0.3, y: 0.47, w: 0.4, h: 0.4 },
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

/** 衣服等比放大塞進格子、置中 */
function fitInSpot(spot: Rect, shape: PieceShape | null): Rect {
  const c = contentInBox(shape);
  const k = Math.min(spot.w / c.w, spot.h / c.h);
  const w = c.w * k;
  const h = c.h * k;
  return { x: spot.x + (spot.w - w) / 2, y: spot.y + (spot.h - h) / 2, w, h };
}

export function layoutOutfit(items: Item[], shapes: ReadonlyMap<string, PieceShape | null>): OutfitItemPlacement[] {
  const shapeOf = (i: Item) => shapes.get(i.id) ?? null;
  const order = items
    .map((i, idx) => ({ id: i.id, rank: Z_RANK[i.category], idx }))
    .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
    .map(o => o.id);
  return items.map(i => ({
    itemId: i.id,
    ...placementFor(fitInSpot(SPOTS[i.category], shapeOf(i)), shapeOf(i)),
    rotation: 0,
    z: order.indexOf(i.id),
  }));
}
