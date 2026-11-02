/**
 * 手動修改去背範圍的純邏輯（不依賴 Skia，方便單元測試）。
 * 筆刷軌跡一律存「圖片像素座標」，畫面縮放或旋轉都不影響存檔結果。
 */
import { BG_REMOVAL_MAX_SIZE } from './backgroundRemoval';

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
/** 圖片在畫布上的位置；scale = 畫面像素 / 圖片像素 */
export type FitRect = { x: number; y: number; width: number; height: number; scale: number };

/** erase：擦掉（變透明）；restore：從原圖補回 */
export type BrushMode = 'erase' | 'restore';
export type Stroke = { mode: BrushMode; width: number; points: Point[] };

/** 筆刷粗細（畫面像素），換算成圖片像素後存進 Stroke */
export const BRUSH_SIZES = { small: 12, medium: 28, large: 56 } as const;
export type BrushSize = keyof typeof BRUSH_SIZES;

/** 等比縮放、置中放進框內 */
export function containRect(image: Size, box: Size): FitRect {
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height, scale };
}

export function toImagePoint(p: Point, rect: FitRect): Point {
  return { x: (p.x - rect.x) / rect.scale, y: (p.y - rect.y) / rect.scale };
}

/** 存檔尺寸：長邊最多 BG_REMOVAL_MAX_SIZE（沒去背過的原尺寸照片會在這裡縮小） */
export function outputSize(image: Size, max = BG_REMOVAL_MAX_SIZE): Size {
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  return { width: Math.round(image.width * scale), height: Math.round(image.height * scale) };
}

export function startStroke(mode: BrushMode, size: BrushSize, p: Point, rect: FitRect): Stroke {
  return { mode, width: BRUSH_SIZES[size] / rect.scale, points: [toImagePoint(p, rect)] };
}

export function addPoint(stroke: Stroke, p: Point, rect: FitRect): Stroke {
  return { ...stroke, points: [...stroke.points, toImagePoint(p, rect)] };
}

export function undoStroke<T>(strokes: T[]): T[] {
  return strokes.slice(0, -1);
}
