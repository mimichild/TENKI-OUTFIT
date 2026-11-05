import {
  NO_ZOOM,
  ZOOM_MAX,
  pinchView,
  nextTouch,
  TOUCH_IDLE,
  type TouchPoint,
  zoomRect,
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

describe('雙指縮放', () => {
  const fit = { x: 10, y: 20, width: 200, height: 300, scale: 0.5 };
  const box = { width: 220, height: 340 };

  it('沒有縮放時，畫面位置跟原本一樣', () => {
    expect(zoomRect(fit, NO_ZOOM)).toEqual(fit);
  });

  it('放大後筆刷落點換算到圖片像素仍然正確', () => {
    const rect = zoomRect(fit, { zoom: 2, x: -100, y: -50 });
    expect(rect.scale).toBe(1);
    // 原本畫面上 (110, 170) 對到圖片 (200, 300)；放大兩倍、平移後同一點在 (2*110-100, 2*170-50)
    expect(toImagePoint({ x: 120, y: 290 }, rect)).toEqual({ x: 200, y: 300 });
  });

  it('以雙指中心為基準放大：手指下的那一點不動', () => {
    const v = pinchView(NO_ZOOM, { x: 100, y: 150 }, { x: 100, y: 150 }, 2, box, fit);
    expect(v.zoom).toBe(2);
    // 手指下的點 (100,150) 放大後仍在 (100,150)
    expect(v.zoom * 100 + v.x).toBeCloseTo(100);
    expect(v.zoom * 150 + v.y).toBeCloseTo(150);
  });

  it('雙指一起移動可以拖曳畫面，1 倍時也可以', () => {
    const start = { zoom: 2, x: -100, y: -100 };
    expect(pinchView(start, { x: 100, y: 100 }, { x: 130, y: 90 }, 1, box, fit)).toEqual({ zoom: 2, x: -70, y: -110 });
    expect(pinchView(NO_ZOOM, { x: 100, y: 100 }, { x: 150, y: 60 }, 1, box, fit)).toEqual({ zoom: 1, x: 50, y: -40 });
  });

  it('往右上拉＋放大：手指下的衣服跟著手指走到右上角，不會跑到左邊', () => {
    // 衣服中心在畫面 (110, 170)（圖片像素 (200, 300)），兩指從那裡拉到右上角 (200, 40) 並放大 2 倍
    const v = pinchView(NO_ZOOM, { x: 110, y: 170 }, { x: 200, y: 40 }, 2, box, fit);
    const rect = zoomRect(fit, v);
    expect(rect.x + 200 * rect.scale).toBeCloseTo(200);
    expect(rect.y + 300 * rect.scale).toBeCloseTo(40);
  });

  it('縮放範圍限制在 1 到最大倍數之間；往內捏很多時回到原位', () => {
    expect(pinchView(NO_ZOOM, { x: 50, y: 50 }, { x: 50, y: 50 }, 100, box, fit).zoom).toBe(ZOOM_MAX);
    expect(pinchView({ zoom: 2, x: -50, y: -50 }, { x: 50, y: 50 }, { x: 80, y: 80 }, 0.2, box, fit)).toEqual(NO_ZOOM);
    // 1 倍附近的小抖動不會把拖曳歸零
    expect(pinchView(NO_ZOOM, { x: 50, y: 50 }, { x: 80, y: 80 }, 0.97, box, fit)).toEqual({ zoom: 1, x: 30, y: 30 });
  });

  it('圖片任何一點都能拉到畫面中央，但整張圖不會被拉出畫面', () => {
    const v = pinchView({ zoom: 2, x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5000, y: 5000 }, 1, box, fit);
    // 圖片左上角最多到畫面中央
    expect(zoomRect(fit, v).x).toBeCloseTo(box.width / 2);
    expect(zoomRect(fit, v).y).toBeCloseTo(box.height / 2);
    const w = pinchView({ zoom: 2, x: 0, y: 0 }, { x: 0, y: 0 }, { x: -5000, y: -5000 }, 1, box, fit);
    const r = zoomRect(fit, w);
    expect(r.x + r.width).toBeCloseTo(box.width / 2);
    expect(r.y + r.height).toBeCloseTo(box.height / 2);
  });
});

describe('手指追蹤（一指塗抹、兩指拖曳縮放）', () => {
  const fit = { x: 10, y: 20, width: 200, height: 300, scale: 0.5 };
  const box = { width: 220, height: 340 };
  const run = (frames: TouchPoint[][]) => {
    let state = TOUCH_IDLE;
    let view = NO_ZOOM;
    const actions: string[] = [];
    for (const f of frames) {
      const r = nextTouch(state, f, view, box, fit);
      state = r.state;
      if (r.action.type === 'view') view = r.action.view;
      actions.push(r.action.type);
    }
    return { actions, view };
  };

  it('一指：開始、移動、放開後存下這一筆', () => {
    expect(run([[{ id: 1, x: 10, y: 10 }], [{ id: 1, x: 20, y: 10 }], []]).actions).toEqual(['strokeStart', 'strokeMove', 'strokeCommit']);
  });

  it('放下第二指：取消剛開始的那一筆，改成拖曳縮放；全部放開前都不畫線', () => {
    const { actions } = run([
      [{ id: 1, x: 100, y: 100 }],
      [{ id: 1, x: 100, y: 100 }, { id: 2, x: 140, y: 100 }],
      [{ id: 1, x: 110, y: 90 }, { id: 2, x: 150, y: 90 }],
      [{ id: 2, x: 150, y: 90 }],
      [{ id: 2, x: 160, y: 90 }],
      [],
    ]);
    expect(actions).toEqual(['strokeStart', 'strokeCancel', 'view', 'none', 'none', 'none']);
  });

  it('單純兩指拖曳（距離不變）也會移動畫面', () => {
    const { view } = run([
      [{ id: 1, x: 100, y: 100 }, { id: 2, x: 140, y: 100 }],
      [{ id: 1, x: 130, y: 80 }, { id: 2, x: 170, y: 80 }],
    ]);
    expect(view).toEqual({ zoom: 1, x: 30, y: -20 });
  });

  it('換手指（放開一指再放下另一指）時重新取基準，畫面不會跳', () => {
    const { view } = run([
      [{ id: 1, x: 100, y: 100 }, { id: 2, x: 140, y: 100 }],
      [{ id: 1, x: 100, y: 100 }, { id: 2, x: 180, y: 100 }],
      [{ id: 1, x: 100, y: 100 }],
      [{ id: 1, x: 100, y: 100 }, { id: 3, x: 20, y: 200 }],
    ]);
    // 第 2 格放大 2 倍後，換手指那一格只重取基準，不改畫面
    expect(view.zoom).toBeCloseTo(2);
    const again = run([
      [{ id: 1, x: 100, y: 100 }, { id: 2, x: 140, y: 100 }],
      [{ id: 1, x: 100, y: 100 }, { id: 2, x: 180, y: 100 }],
    ]).view;
    expect(view).toEqual(again);
  });
});
