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
/** 雙指往內捏到低於這個倍數就回到原位（1 倍附近的小抖動不會把平移歸零） */
const RESET_BELOW = 0.85;

/**
 * 雙指手勢：以基準狀態 start、基準雙指中心 focal0 為準，
 * 依目前的雙指中心 focal 與縮放比例 scale 算出新的畫面狀態（手指下的內容跟著手指走）。
 * - 倍數 1 ~ ZOOM_MAX；1 倍時也可以拖曳
 * - 圖片上任何一點都能拉到畫面正中央（衣服在邊邊也拉得過來），但整張圖不會被拉出畫面
 * - 往內捏到比原本小很多時回到原位
 * fit 是沒縮放時圖片在畫面上的位置
 */
export function pinchView(start: ZoomView, focal0: Point, focal: Point, scale: number, box: Size, fit: FitRect): ZoomView {
  const raw = start.zoom * scale;
  if (raw < RESET_BELOW) return NO_ZOOM;
  const zoom = clamp(raw, 1, ZOOM_MAX);
  const k = zoom / start.zoom;
  const x = focal.x - k * (focal0.x - start.x);
  const y = focal.y - k * (focal0.y - start.y);
  const cx = box.width / 2;
  const cy = box.height / 2;
  return {
    zoom,
    x: clamp(x, cx - zoom * (fit.x + fit.width), cx - zoom * fit.x),
    y: clamp(y, cy - zoom * (fit.y + fit.height), cy - zoom * fit.y),
  };
}

/** 畫面上的一根手指（相對於畫布） */
export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

/**
 * 自己追蹤手指（不用系統的 Pinch）：
 * - 一根手指：塗抹
 * - 兩根手指：拖曳＋縮放；放下第二指時取消剛開始的那一筆，手指全部放開前都不再畫線
 * - 手指數量改變（放開或再放下一指）時重新取基準，畫面不會跳
 */
export interface TouchState {
  mode: 'idle' | 'draw' | 'pinch';
  /** 雙指的基準：哪兩根手指、當時的畫面狀態、中心與距離 */
  base: { ids: [number, number]; view: ZoomView; focal: Point; dist: number } | null;
}

export const TOUCH_IDLE: TouchState = { mode: 'idle', base: null };

export type TouchAction =
  | { type: 'none' }
  | { type: 'strokeStart'; point: Point }
  | { type: 'strokeMove'; point: Point }
  | { type: 'strokeCommit' }
  | { type: 'strokeCancel' }
  | { type: 'view'; view: ZoomView };

/** 目前畫面上的手指 → 下一個狀態與要做的事 */
export function nextTouch(
  state: TouchState,
  touches: TouchPoint[],
  view: ZoomView,
  box: Size,
  fit: FitRect,
): { state: TouchState; action: TouchAction } {
  if (touches.length === 0) {
    return { state: TOUCH_IDLE, action: state.mode === 'draw' ? { type: 'strokeCommit' } : { type: 'none' } };
  }
  if (touches.length === 1) {
    const point = { x: touches[0].x, y: touches[0].y };
    if (state.mode === 'pinch') return { state: { mode: 'pinch', base: null }, action: { type: 'none' } };
    if (state.mode === 'idle') return { state: { mode: 'draw', base: null }, action: { type: 'strokeStart', point } };
    return { state, action: { type: 'strokeMove', point } };
  }
  const [a, b] = touches;
  const focal = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  const cancel: TouchAction = state.mode === 'draw' ? { type: 'strokeCancel' } : { type: 'none' };
  const base = state.base;
  if (!base || base.ids[0] !== a.id || base.ids[1] !== b.id) {
    return { state: { mode: 'pinch', base: { ids: [a.id, b.id], view, focal, dist } }, action: cancel };
  }
  return { state, action: { type: 'view', view: pinchView(base.view, base.focal, focal, dist / base.dist, box, fit) } };
}
