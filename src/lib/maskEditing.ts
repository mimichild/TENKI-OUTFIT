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

/** 筆刷粗細範圍（畫面像素，滑桿拖拉選擇），換算成圖片像素後存進 Stroke */
export const BRUSH_MIN = 4;
export const BRUSH_MAX = 80;
export const BRUSH_DEFAULT = 28;

/** 滑桿位置（0 ~ trackWidth，可超出）→ 整數筆刷粗細 */
export function brushFromSlider(x: number, trackWidth: number): number {
  const ratio = trackWidth > 0 ? Math.min(1, Math.max(0, x / trackWidth)) : 0;
  return Math.round(BRUSH_MIN + ratio * (BRUSH_MAX - BRUSH_MIN));
}

/** 筆刷粗細 → 滑桿圓鈕位置 */
export function sliderFromBrush(size: number, trackWidth: number): number {
  return ((size - BRUSH_MIN) / (BRUSH_MAX - BRUSH_MIN)) * trackWidth;
}

/** 等比縮放、置中放進框內；框或圖還沒有尺寸時回傳 null（觸控先不處理） */
export function containRect(image: Size, box: Size): FitRect | null {
  if (image.width <= 0 || image.height <= 0 || box.width <= 0 || box.height <= 0) return null;
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

/** brushSize：畫面像素 */
export function startStroke(mode: BrushMode, brushSize: number, p: Point, rect: FitRect): Stroke {
  return { mode, width: brushSize / rect.scale, points: [toImagePoint(p, rect)] };
}

export function addPoint(stroke: Stroke, p: Point, rect: FitRect): Stroke {
  return { ...stroke, points: [...stroke.points, toImagePoint(p, rect)] };
}

export function undoStroke<T>(strokes: T[]): T[] {
  return strokes.slice(0, -1);
}

/** 雙指縮放的畫面狀態：zoom 倍數，x/y 為放大後的平移（畫面像素） */
export interface ZoomView {
  zoom: number;
  x: number;
  y: number;
}

export const NO_ZOOM: ZoomView = { zoom: 1, x: 0, y: 0 };
/** 最多放大 5 倍，方便細修衣服邊緣 */
export const ZOOM_MAX = 5;

/** 套用縮放後，圖片在畫面上的位置；筆刷座標換算一律用這個 */
export function zoomRect(fit: FitRect, view: ZoomView): FitRect {
  return {
    x: view.x + view.zoom * fit.x,
    y: view.y + view.zoom * fit.y,
    width: fit.width * view.zoom,
    height: fit.height * view.zoom,
    scale: fit.scale * view.zoom,
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * 雙指手勢：以手勢開始時的狀態 start、雙指中心 focal0 為基準，
 * 依目前的雙指中心 focal 與縮放比例 scale 算出新的畫面狀態（中心點下的內容跟著手指走）。
 * 倍數限制在 1 ~ ZOOM_MAX；平移不會讓圖露出畫面外；縮回 1 倍時回到原位。
 */
export function pinchView(start: ZoomView, focal0: Point, focal: Point, scale: number, box: Size): ZoomView {
  const zoom = clamp(start.zoom * scale, 1, ZOOM_MAX);
  if (zoom <= 1) return NO_ZOOM;
  const k = zoom / start.zoom;
  const x = focal.x - k * (focal0.x - start.x);
  const y = focal.y - k * (focal0.y - start.y);
  return {
    zoom,
    x: clamp(x, box.width * (1 - zoom), 0),
    y: clamp(y, box.height * (1 - zoom), 0),
  };
}
