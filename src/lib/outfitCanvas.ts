import type { OutfitItemPlacement } from '@/types/models';

/**
 * 穿搭畫布：寬度固定為 1，高度 = 每套穿搭自己的 canvasRatio（舊穿搭與穿搭建議 3:4）。
 * 位置與大小都以「畫布寬度」為單位，換手機相對位置不變。
 * x, y = 單品中心點；scale = 相對基本大小；rotation = 弧度
 */
export const CANVAS_HEIGHT_RATIO = 4 / 3;
/** scale = 1 時單品方框的邊長（畫布寬度的比例） */
export const PIECE_BASE_SIZE = 0.45;
export const MIN_SCALE = 0.2;
export const MAX_SCALE = 4;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function normalizeRotation(r: number): number {
  const twoPi = Math.PI * 2;
  let v = r % twoPi;
  if (v <= -Math.PI) v += twoPi;
  if (v > Math.PI) v -= twoPi;
  return v;
}

/** 畫面上的方框（像素）；width = 畫布寬度 */
export function pieceBox(p: Pick<OutfitItemPlacement, 'x' | 'y' | 'scale'>, width: number) {
  const size = PIECE_BASE_SIZE * width * p.scale;
  return { left: p.x * width - size / 2, top: p.y * width - size / 2, size };
}

export interface GestureDelta {
  /** 拖拉位移（像素） */
  dx: number;
  dy: number;
  /** 雙指縮放倍率（手勢開始時 = 1） */
  scale: number;
  /** 雙指旋轉角度（弧度，手勢開始時 = 0） */
  rotation: number;
}

/** 以手勢開始時的位置為基準套用變化 */
export function applyGesture(start: OutfitItemPlacement, g: GestureDelta, width: number, ratio = CANVAS_HEIGHT_RATIO): OutfitItemPlacement {
  return {
    ...start,
    x: clamp(start.x + g.dx / width, 0, 1),
    y: clamp(start.y + g.dy / width, 0, ratio),
    scale: clamp(start.scale * g.scale, MIN_SCALE, MAX_SCALE),
    rotation: normalizeRotation(start.rotation + g.rotation),
  };
}

/** 新單品放在最上層、中間稍微錯開；已經在畫布上就不重複加 */
export function addPiece(list: OutfitItemPlacement[], itemId: string, ratio = CANVAS_HEIGHT_RATIO): OutfitItemPlacement[] {
  if (list.some(p => p.itemId === itemId)) return list;
  const offset = (list.length % 6) * 0.05;
  const z = list.reduce((max, p) => Math.max(max, p.z + 1), 0);
  return [...list, { itemId, x: 0.5 + offset, y: ratio / 2 + offset, scale: 1, rotation: 0, z }];
}

/** 移到最上層，並把 z 重新編成 0..n-1（保持原本陣列順序） */
export function bringToFront<T extends OutfitItemPlacement>(list: T[], itemId: string): T[] {
  if (!list.some(p => p.itemId === itemId)) return list;
  const order = [...list].sort((a, b) => a.z - b.z).filter(p => p.itemId !== itemId).map(p => p.itemId);
  order.push(itemId);
  return list.map(p => ({ ...p, z: order.indexOf(p.itemId) }));
}

export function removePiece<T extends OutfitItemPlacement>(list: T[], itemId: string): T[] {
  return list.filter(p => p.itemId !== itemId);
}

/**
 * 編輯器畫布比例：不管原本比例，寬度貼齊手機左右邊緣、高度延伸到底部（使用者指定）。
 * 還沒量到版面時沿用原本的比例。
 */
export function editorCanvasRatio(area: { width: number; height: number }, current: number): number {
  return area.width > 0 && area.height > 0 ? area.height / area.width : current;
}

/** 畫布底部中央的垃圾桶（px）：直徑、離底部距離、判定半徑 */
export const TRASH_SIZE = 56;
export const TRASH_BOTTOM = 16;
const TRASH_HIT_RADIUS = 64;
/** 手指要真的拖動超過這個距離（px）才算拖進垃圾桶，避免只是縮放時誤刪 */
const TRASH_MIN_DRAG = 12;

/** 單品中心是否在垃圾桶上（位置以畫布寬度為單位，ratio = 畫布高 / 寬） */
export function isOverTrash(p: Pick<OutfitItemPlacement, 'x' | 'y'>, width: number, ratio: number): boolean {
  const cx = width / 2;
  const cy = width * ratio - TRASH_BOTTOM - TRASH_SIZE / 2;
  return Math.hypot(p.x * width - cx, p.y * width - cy) <= TRASH_HIT_RADIUS;
}

/** 拖拉放開時要不要丟進垃圾桶：有實際拖動，且最後停在垃圾桶上 */
export function droppedInTrash(end: Pick<OutfitItemPlacement, 'x' | 'y'>, g: Pick<GestureDelta, 'dx' | 'dy'>, width: number, ratio: number): boolean {
  return Math.hypot(g.dx, g.dy) >= TRASH_MIN_DRAG && isOverTrash(end, width, ratio);
}
