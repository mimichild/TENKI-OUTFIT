import {
  BRUSH_SIZES,
  addPoint,
  containRect,
  outputSize,
  startStroke,
  toImagePoint,
  undoStroke,
  type Stroke,
} from '@/lib/maskEditing';

describe('containRect', () => {
  it('fits a tall image into a wide box, centred horizontally', () => {
    expect(containRect({ width: 1000, height: 2000 }, { width: 400, height: 400 })).toEqual({
      x: 100, y: 0, width: 200, height: 400, scale: 0.2,
    });
  });

  it('fits a wide image into a tall box, centred vertically', () => {
    expect(containRect({ width: 1600, height: 800 }, { width: 400, height: 600 })).toEqual({
      x: 0, y: 200, width: 400, height: 200, scale: 0.25,
    });
  });
});

describe('toImagePoint', () => {
  it('maps a touch in the canvas to image pixels', () => {
    const rect = { x: 100, y: 0, width: 200, height: 400, scale: 0.2 };
    expect(toImagePoint({ x: 150, y: 40 }, rect)).toEqual({ x: 250, y: 200 });
  });
});

describe('outputSize', () => {
  it('keeps images that already fit', () => {
    expect(outputSize({ width: 1200, height: 1600 })).toEqual({ width: 1200, height: 1600 });
  });

  it('downscales a full-size photo to 1600 on the long side', () => {
    expect(outputSize({ width: 4032, height: 3024 })).toEqual({ width: 1600, height: 1200 });
  });
});

describe('strokes', () => {
  const rect = { x: 0, y: 0, width: 200, height: 400, scale: 0.5 };

  it('starts a stroke with the brush width converted to image pixels', () => {
    const s = startStroke('erase', 'medium', { x: 10, y: 20 }, rect);
    expect(s).toEqual({ mode: 'erase', width: BRUSH_SIZES.medium / 0.5, points: [{ x: 20, y: 40 }] });
  });

  it('appends points without mutating the previous stroke', () => {
    const s = startStroke('restore', 'small', { x: 0, y: 0 }, rect);
    const next = addPoint(s, { x: 5, y: 5 }, rect);
    expect(next.points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    expect(s.points).toHaveLength(1);
  });

  it('undo removes the most recent stroke only', () => {
    const a: Stroke = { mode: 'erase', width: 1, points: [] };
    const b: Stroke = { mode: 'restore', width: 2, points: [] };
    expect(undoStroke([a, b])).toEqual([a]);
    expect(undoStroke([])).toEqual([]);
  });
});
