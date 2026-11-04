import { sharedCanvasRatio, useCanvasStore } from '@/store/canvasStore';

describe('canvasStore', () => {
  beforeEach(() => useCanvasStore.setState({ day: null, editor: null }));

  it('uses the smaller of the two measured ratios, or the fallback when nothing is measured', () => {
    expect(sharedCanvasRatio(null, null, 1.33)).toBe(1.33);
    expect(sharedCanvasRatio(1.5, null, 1.33)).toBe(1.5);
    expect(sharedCanvasRatio(1.5, 1.2, 1.33)).toBe(1.2);
    expect(sharedCanvasRatio(1.1, 1.2, 1.33)).toBe(1.1);
  });

  it('ignores invalid and tiny changes', () => {
    const { report } = useCanvasStore.getState();
    report('day', 1.5);
    report('day', 1.501);
    report('day', 0);
    report('day', NaN);
    expect(useCanvasStore.getState().day).toBe(1.5);
    report('day', 1.4);
    expect(useCanvasStore.getState().day).toBe(1.4);
  });
});
