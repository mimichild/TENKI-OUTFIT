import {
  CANVAS_HEIGHT_RATIO, MAX_SCALE, editorCanvasRatio, MIN_SCALE, addPiece, applyGesture, bringToFront, normalizeRotation, pieceBox, removePiece,
} from '@/lib/outfitCanvas';

const p = (itemId: string, z: number, extra = {}) => ({ itemId, x: 0.5, y: 0.5, scale: 1, rotation: 0, z, ...extra });

describe('outfit canvas', () => {
  it('converts a placement into an on-screen box of the right size', () => {
    const box = pieceBox(p('a', 0, { x: 0.25, y: 0.5, scale: 2 }), 400);
    // 基本大小 = 畫布寬 0.45；x/y 是中心點、以畫布寬度為單位
    expect(box).toEqual({ left: 100 - 180, top: 200 - 180, size: 360 });
  });

  it('applies drag (in pixels), pinch and rotation relative to where the gesture started', () => {
    const start = p('a', 0, { rotation: 0.5 });
    const next = applyGesture(start, { dx: 40, dy: -20, scale: 1.5, rotation: 0.25 }, 400);
    expect(next).toMatchObject({ x: 0.6, y: 0.45, scale: 1.5, z: 0 });
    expect(next.rotation).toBeCloseTo(0.75);
  });

  it('keeps the centre inside the canvas and the scale within limits', () => {
    const far = applyGesture(p('a', 0), { dx: 10_000, dy: 10_000, scale: 100, rotation: 0 }, 400);
    expect(far).toMatchObject({ x: 1, y: CANVAS_HEIGHT_RATIO, scale: MAX_SCALE });
    const tiny = applyGesture(p('a', 0), { dx: -10_000, dy: -10_000, scale: 0.0001, rotation: 0 }, 400);
    expect(tiny).toMatchObject({ x: 0, y: 0, scale: MIN_SCALE });
  });

  it('normalizes rotation to (-π, π]', () => {
    expect(normalizeRotation(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(normalizeRotation(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
    expect(normalizeRotation(0.3)).toBeCloseTo(0.3);
  });

  it('adds new pieces on top, slightly offset so they do not hide each other', () => {
    const one = addPiece([], 'a');
    expect(one).toEqual([{ itemId: 'a', x: 0.5, y: CANVAS_HEIGHT_RATIO / 2, scale: 1, rotation: 0, z: 0 }]);
    const two = addPiece(one, 'b');
    expect(two[1].z).toBe(1);
    expect([two[1].x, two[1].y]).not.toEqual([one[0].x, one[0].y]);
    expect(addPiece(two, 'a')).toBe(two);
  });

  it('brings a piece to the front and renumbers z from 0', () => {
    const list = [p('a', 0), p('b', 5), p('c', 9)];
    expect(bringToFront(list, 'a').map(x => [x.itemId, x.z])).toEqual([['a', 2], ['b', 0], ['c', 1]]);
    expect(bringToFront(list, 'missing')).toBe(list);
  });

  it('removes a piece', () => {
    expect(removePiece([p('a', 0), p('b', 1)], 'a').map(x => x.itemId)).toEqual(['b']);
  });
});

describe('畫布比例', () => {
  it('預設（舊穿搭、穿搭建議）是直式 3:4', () => {
    expect(CANVAS_HEIGHT_RATIO).toBe(4 / 3);
  });

  it('每套穿搭可以有自己的比例：拖拉限制在該比例的畫布內、新單品放在該畫布中央', () => {
    const far = applyGesture(p('a', 0), { dx: 0, dy: 10_000, scale: 1, rotation: 0 }, 400, 1.8);
    expect(far.y).toBe(1.8);
    expect(addPiece([], 'a', 1.8)[0].y).toBe(0.9);
  });

  it('編輯器畫布比例：不管原本比例，完全依可用空間（寬度填滿、高度到底）', () => {
    expect(editorCanvasRatio({ width: 300, height: 540 }, 4 / 3)).toBeCloseTo(1.8);
    expect(editorCanvasRatio({ width: 300, height: 360 }, 2)).toBeCloseTo(1.2);
    // 還沒量到版面時沿用原本的
    expect(editorCanvasRatio({ width: 0, height: 0 }, 2)).toBe(2);
  });
});
