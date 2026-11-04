import type { OutfitItemPlacement } from '@/types/models';
import { pieceBox } from './outfitCanvas';
import { ALPHA_THRESHOLD, type PieceShape } from './outfitLayout';

/**
 * 編輯穿搭時「手指碰到哪件衣服」：只算照片裡真的有衣服的地方，透明的部分不算。
 * 單品在畫布上是一個正方形（照片 contain 放進去，再旋轉），這裡把觸碰點反算回照片座標再查遮罩。
 */

/** 遮罩格數（每邊）；量測時照片最長邊縮到 160px，24 格約每格 7px */
export const MASK_GRID = 24;

/** 像素（RGBA）→ 遮罩字串，見 PieceShape.mask */
export function alphaMask(pixels: Uint8Array, width: number, height: number, grid = MASK_GRID, threshold = ALPHA_THRESHOLD): string {
  const cells = new Uint8Array(grid * grid);
  // 每個像素標記它涵蓋的所有格子（照片比格子小時一個像素會跨好幾格）
  const span = (i: number, n: number) => [Math.floor((i * grid) / n), Math.max(Math.floor((i * grid) / n), Math.ceil(((i + 1) * grid) / n) - 1)];
  for (let y = 0; y < height; y++) {
    const [gy0, gy1] = span(y, height);
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (pixels[row + x * 4 + 3] < threshold) continue;
      const [gx0, gx1] = span(x, width);
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) cells[gy * grid + gx] = 1;
    }
  }
  return Array.from(cells).join('');
}

export const isMask = (v: unknown): v is string => typeof v === 'string' && v.length === MASK_GRID * MASK_GRID && /^[01]+$/.test(v);

/** 觸碰點（畫布像素）在不在這件單品的衣服上；shape 沒量到時用整張照片 */
export function pieceContains(
  p: Pick<OutfitItemPlacement, 'x' | 'y' | 'scale' | 'rotation'>,
  shape: PieceShape | null | undefined,
  width: number,
  px: number,
  py: number,
): boolean {
  const { size } = pieceBox(p, width);
  // 反向旋轉回單品自己的座標（畫面上的旋轉是順時針為正）
  const dx = px - p.x * width;
  const dy = py - p.y * width;
  const cos = Math.cos(p.rotation);
  const sin = Math.sin(p.rotation);
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  // 照片以 contain 放進正方形
  const aspect = shape?.aspect ?? 1;
  const dispW = aspect >= 1 ? size : size * aspect;
  const dispH = aspect >= 1 ? size / aspect : size;
  const u = lx / dispW + 0.5;
  const v = ly / dispH + 0.5;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
  if (!shape) return true;
  if (shape.mask && isMask(shape.mask)) {
    // 容許旁邊一格的誤差，手指不用點得剛剛好
    const cx = Math.floor(u * MASK_GRID);
    const cy = Math.floor(v * MASK_GRID);
    for (let y = Math.max(0, cy - 1); y <= Math.min(MASK_GRID - 1, cy + 1); y++) {
      for (let x = Math.max(0, cx - 1); x <= Math.min(MASK_GRID - 1, cx + 1); x++) {
        if (shape.mask[y * MASK_GRID + x] === '1') return true;
      }
    }
    return false;
  }
  const b = shape.bounds;
  return u >= b.x0 && u < b.x1 && v >= b.y0 && v < b.y1;
}

/** 觸碰點上最上層的單品 id；都沒碰到衣服就是 null */
export function pieceAt(
  pieces: readonly (OutfitItemPlacement & { itemId: string })[],
  shapes: ReadonlyMap<string, PieceShape | null> | undefined,
  width: number,
  px: number,
  py: number,
): string | null {
  const top = [...pieces].sort((a, b) => b.z - a.z);
  return top.find(p => pieceContains(p, shapes?.get(p.itemId), width, px, py))?.itemId ?? null;
}
