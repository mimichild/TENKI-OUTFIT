import {
  BRUSH_MAX,
  BRUSH_MIN,
  addPoint,
  brushFromSlider,
  sliderFromBrush,
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

describe('containRect before layout', () => {
  it('returns null for an empty box so touches are ignored instead of producing NaN', () => {
    expect(containRect({ width: 100, height: 100 }, { width: 0, height: 300 })).toBeNull();
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
    const s = startStroke('erase', 28, { x: 10, y: 20 }, rect);
    expect(s).toEqual({ mode: 'erase', width: 56, points: [{ x: 20, y: 40 }] });
  });

  it('appends points without mutating the previous stroke', () => {
    const s = startStroke('restore', 12, { x: 0, y: 0 }, rect);
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

describe('brush size slider', () => {
  it('maps the track position to a whole-pixel brush size', () => {
    expect(brushFromSlider(0, 200)).toBe(BRUSH_MIN);
    expect(brushFromSlider(200, 200)).toBe(BRUSH_MAX);
    expect(brushFromSlider(100, 200)).toBe(Math.round((BRUSH_MIN + BRUSH_MAX) / 2));
  });

  it('clamps drags past either end of the track', () => {
    expect(brushFromSlider(-30, 200)).toBe(BRUSH_MIN);
    expect(brushFromSlider(260, 200)).toBe(BRUSH_MAX);
  });

  it('places the thumb for a given size (inverse of brushFromSlider)', () => {
    expect(sliderFromBrush(BRUSH_MIN, 200)).toBe(0);
    expect(sliderFromBrush(BRUSH_MAX, 200)).toBe(200);
    expect(brushFromSlider(sliderFromBrush(30, 200), 200)).toBe(30);
  });
});
