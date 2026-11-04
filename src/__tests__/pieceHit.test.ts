import { alphaMask, isMask, MASK_GRID, pieceAt, pieceContains } from '@/lib/pieceHit';
import type { PieceShape } from '@/lib/outfitLayout';

// 畫布寬 400：scale 1 的單品是 180px 的正方形（PIECE_BASE_SIZE 0.45）
const W = 400;
const at = (x: number, y: number, extra = {}) => ({ x, y, scale: 1, rotation: 0, z: 0, ...extra });

/** 只有中間一條（u 0.4–0.6）有衣服的照片，例如細長的領帶 */
function stripeShape(): PieceShape {
  const cells = Array.from({ length: MASK_GRID * MASK_GRID }, (_, i) => {
    const u = ((i % MASK_GRID) + 0.5) / MASK_GRID;
    return u > 0.4 && u < 0.6 ? '1' : '0';
  }).join('');
  return { aspect: 1, bounds: { x0: 0.4, y0: 0, x1: 0.6, y1: 1 }, mask: cells };
}

describe('alphaMask', () => {
  it('marks cells that contain visible pixels, even when the photo is smaller than the grid', () => {
    const px = new Uint8Array(2 * 2 * 4);
    px[(0 * 2 + 1) * 4 + 3] = 255; // 右上那個像素
    const mask = alphaMask(px, 2, 2);
    expect(isMask(mask)).toBe(true);
    expect(mask[0 * MASK_GRID + MASK_GRID - 1]).toBe('1');
    expect(mask[(MASK_GRID - 1) * MASK_GRID]).toBe('0');
    expect([...mask].filter(c => c === '1')).toHaveLength((MASK_GRID / 2) ** 2);
  });
});

describe('pieceContains', () => {
  it('沒有量到照片範圍時，整張照片都算', () => {
    expect(pieceContains(at(0.5, 0.5), null, W, 200 + 80, 200)).toBe(true);
    expect(pieceContains(at(0.5, 0.5), null, W, 200 + 95, 200)).toBe(false);
  });

  it('只有碰到衣服的地方才算，透明的部分不算', () => {
    const shape = stripeShape();
    expect(pieceContains(at(0.5, 0.5), shape, W, 200, 150)).toBe(true);
    expect(pieceContains(at(0.5, 0.5), shape, W, 200 + 70, 200)).toBe(false);
  });

  it('容許旁邊一格的誤差', () => {
    // 衣服右緣約在中心右邊 15px（第 13 格）；一格 7.5px，右邊 20px 落在旁邊那格
    expect(pieceContains(at(0.5, 0.5), stripeShape(), W, 200 + 20, 200)).toBe(true);
    expect(pieceContains(at(0.5, 0.5), stripeShape(), W, 200 + 40, 200)).toBe(false);
  });

  it('跟著放大與旋轉', () => {
    const shape = stripeShape();
    // 放大 2 倍：衣服寬 72px，右邊 30px 也碰得到
    expect(pieceContains(at(0.5, 0.5, { scale: 2 }), shape, W, 200 + 30, 200)).toBe(true);
    // 轉 90 度：直條變橫條
    expect(pieceContains(at(0.5, 0.5, { rotation: Math.PI / 2 }), shape, W, 200 + 70, 200)).toBe(true);
    expect(pieceContains(at(0.5, 0.5, { rotation: Math.PI / 2 }), shape, W, 200, 150)).toBe(false);
  });

  it('沒有遮罩的舊快取改用衣服的範圍', () => {
    const { mask: _mask, ...old } = stripeShape();
    expect(pieceContains(at(0.5, 0.5), old, W, 200, 150)).toBe(true);
    expect(pieceContains(at(0.5, 0.5), old, W, 200 + 70, 200)).toBe(false);
  });

  it('橫的照片上下的留白不算', () => {
    const wide: PieceShape = { aspect: 2, bounds: { x0: 0, y0: 0, x1: 1, y1: 1 } };
    // 180 寬、90 高，置中
    expect(pieceContains(at(0.5, 0.5), wide, W, 200, 200 + 40)).toBe(true);
    expect(pieceContains(at(0.5, 0.5), wide, W, 200, 200 + 60)).toBe(false);
  });
});

describe('pieceAt', () => {
  it('picks the top piece whose clothing is under the finger, skipping transparent areas', () => {
    const pieces = [
      { itemId: 'under', ...at(0.5, 0.5, { z: 0 }) },
      { itemId: 'over', ...at(0.5, 0.5, { z: 1 }) },
    ];
    const shapes = new Map<string, PieceShape | null>([['under', null], ['over', stripeShape()]]);
    // 中間：上面那件的衣服
    expect(pieceAt(pieces, shapes, W, 200, 200)).toBe('over');
    // 旁邊：上面那件是透明的，穿過去拿到下面那件
    expect(pieceAt(pieces, shapes, W, 200 + 70, 200)).toBe('under');
    // 外面：都沒碰到
    expect(pieceAt(pieces, shapes, W, 10, 10)).toBeNull();
  });
});
