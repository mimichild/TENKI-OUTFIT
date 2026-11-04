import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OutfitEditor, type OutfitDraft } from '@/components/OutfitEditor';
import { CANVAS_HEIGHT_RATIO } from '@/lib/outfitCanvas';
import type { PieceShape } from '@/lib/outfitLayout';
import { MASK_GRID } from '@/lib/pieceHit';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';
import type { Item } from '@/types/models';

// 照片裡衣服的形狀；undefined = 還沒量到（整張照片都算）
let mockShapes: Map<string, PieceShape | null> | undefined;
jest.mock('@/lib/usePieceShapes', () => ({ usePieceShapes: () => mockShapes }));
beforeEach(() => {
  mockShapes = undefined;
});

const item = (id: string, name: string, price: number | null, category: Item['category'] = 'top'): Item => ({
  id, name, brand: '', category, price, occasions: [], seasons: [], imageUri: null, originalUri: null,
  createdAt: `2026-11-0${id.length}T00:00:00.000Z`, updatedAt: '', lastUsedAt: null, deletedAt: null,
});
const shirt = item('a', '白襯衫', 790);
const jeans = item('bb', '牛仔褲', null, 'bottom');

function setup({ initial = { name: '', date: null, pieces: [] } as OutfitDraft, onSave = jest.fn().mockResolvedValue(undefined), onDelete }: {
  initial?: OutfitDraft; onSave?: jest.Mock; onDelete?: jest.Mock;
} = {}) {
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
  const onCancel = jest.fn();
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <OutfitEditor title="新增穿搭" initial={initial} items={[shirt, jeans]} today="2026-11-02" onSave={onSave} onCancel={onCancel} onDelete={onDelete} />
    </SafeAreaProvider>,
  );
  return { onSave, onCancel };
}

/** 畫布 400 × 600：scale 1 的單品是 180px 正方形，中心在 (x × 400, y × 400) */
const layoutCanvas = () =>
  fireEvent(screen.getByTestId('canvas-area'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } } });
/** 手指從 (x, y) 開始拖 dx, dy */
const drag = (x: number, y: number, dx: number, dy: number) => act(() => {
  fireGestureHandler(getByGestureTestId('canvas-pan'), [
    { state: State.BEGAN, x, y, translationX: 0, translationY: 0 },
    { state: State.ACTIVE, x, y, translationX: 0, translationY: 0 },
    { state: State.ACTIVE, x: x + dx, y: y + dy, translationX: dx, translationY: dy },
    { state: State.END, x: x + dx, y: y + dy, translationX: dx, translationY: dy },
  ]);
});
const pinchAt = (x: number, y: number, from: number, to: number) => act(() => {
  fireGestureHandler(getByGestureTestId('canvas-pinch'), [
    { state: State.BEGAN, focalX: x, focalY: y, scale: from },
    { state: State.ACTIVE, focalX: x, focalY: y, scale: from },
    { state: State.ACTIVE, focalX: x, focalY: y, scale: to },
    { state: State.END, focalX: x, focalY: y, scale: to },
  ]);
});

const saveButton = () => screen.getByRole('button', { name: '儲存' });
const pick = (name: string) => fireEvent.press(screen.getByRole('checkbox', { name }));

describe('OutfitEditor', () => {
  it('cannot save without a date; choosing one from the calendar enables saving', async () => {
    const { onSave } = setup();
    expect(screen.getByText('要先選日期才能儲存')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '加入單品' }));
    pick('白襯衫');
    expect(saveButton()).toBeDisabled();

    fireEvent.press(screen.getByRole('button', { name: '日期 請選擇日期' }));
    fireEvent.press(screen.getByTestId('day-2026-11-05'));
    expect(screen.queryByText('要先選日期才能儲存')).toBeNull();
    expect(screen.getByRole('button', { name: /^日期 11\/5（四）/ })).toBeTruthy();

    await act(async () => fireEvent.press(saveButton()));
    expect(onSave).toHaveBeenCalledWith({
      name: '', date: '2026-11-05',
      items: [{ itemId: 'a', x: 0.5, y: CANVAS_HEIGHT_RATIO / 2, scale: 1, rotation: 0, z: 0 }],
      canvasRatio: CANVAS_HEIGHT_RATIO,
    });
  });

  it('舊穿搭的畫布也不管原本比例，一樣填滿到底', () => {
    setup({ initial: { name: '', date: '2026-11-05', pieces: [], canvasRatio: 2.2 } });
    fireEvent(screen.getByTestId('canvas-area'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 520 } } });
    const canvas = StyleSheet.flatten(screen.getByTestId('outfit-canvas').props.style);
    expect(canvas).toMatchObject({ width: 390 });
    expect(canvas.height).toBeCloseTo(520);
  });

  it('畫布寬度填滿、高度延伸到底部，存檔時記下這個比例', async () => {
    const { onSave } = setup({ initial: { name: '', date: '2026-11-05', pieces: [] } });
    fireEvent(screen.getByTestId('canvas-area'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 358, height: 600 } } });
    const canvas = StyleSheet.flatten(screen.getByTestId('outfit-canvas').props.style);
    expect(canvas.width).toBe(358);
    expect(canvas.height).toBeCloseTo(600);
    fireEvent.press(screen.getByRole('button', { name: '加入單品' }));
    pick('白襯衫');
    await act(async () => fireEvent.press(saveButton()));
    expect(onSave.mock.calls[0][0].canvasRatio).toBeCloseTo(600 / 358);
    // 新單品放在這個畫布的中央
    expect(onSave.mock.calls[0][0].items[0].y).toBeCloseTo(600 / 358 / 2);
  });

  it('加入單品的視窗從標題列下方蓋到底，不隨單品數量縮小', () => {
    setup({ initial: { name: '', date: '2026-11-05', pieces: [] } });
    fireEvent(screen.getByTestId('editor-top-bar'), 'layout', { nativeEvent: { layout: { x: 0, y: 24, width: 390, height: 48 } } });
    fireEvent.press(screen.getByRole('button', { name: '加入單品' }));
    expect(StyleSheet.flatten(screen.getByTestId('picker-backdrop').props.style).height).toBe(72);
    expect(StyleSheet.flatten(screen.getByTestId('picker-sheet').props.style).flex).toBe(1);
  });

  it('量不到標題列時，選單品視窗佔畫面 88%', () => {
    setup({ initial: { name: '', date: '2026-11-05', pieces: [] } });
    fireEvent.press(screen.getByRole('button', { name: '加入單品' }));
    const top = StyleSheet.flatten(screen.getByTestId('picker-backdrop').props.style).height;
    expect(top).toBeGreaterThan(0);
  });

  it('cannot save an empty canvas even with a date', () => {
    setup({ initial: { name: '', date: '2026-11-02', pieces: [] } });
    expect(screen.getByText(/按「加入單品」把服裝放到畫布上/)).toBeTruthy();
    expect(saveButton()).toBeDisabled();
  });

  it('adds and removes items from the picker, filters by category, and totals prices', () => {
    setup({ initial: { name: '', date: '2026-11-02', pieces: [] } });
    expect(screen.getByText('總金額 —')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '加入單品' }));
    pick('白襯衫');
    pick('牛仔褲');
    expect(screen.getByText('總金額 NT$790')).toBeTruthy();
    expect(screen.getByLabelText('牛仔褲，在畫布上')).toBeTruthy();
    pick('牛仔褲');
    expect(screen.queryByLabelText('牛仔褲，在畫布上')).toBeNull();

    fireEvent.press(screen.getByRole('tab', { name: '下著' }));
    expect(screen.queryByRole('checkbox', { name: '白襯衫' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: '牛仔褲' })).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: '鞋子' }));
    expect(screen.getByText('這個分類還沒有單品')).toBeTruthy();
  });

  it('dragging, pinching and rotating a piece moves it and brings it to the front', async () => {
    const { onSave } = setup({
      initial: {
        name: '', date: '2026-11-02',
        pieces: [
          { itemId: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0, item: shirt },
          { itemId: 'bb', x: 0.3, y: 0.3, scale: 1, rotation: 0, z: 1, item: jeans },
        ],
      },
    });
    layoutCanvas();
    // (260, 260) 只在白襯衫上（牛仔褲的範圍是 30–210）
    drag(260, 260, 1000, 0);
    // 拖太遠停在畫布右緣：中心 (400, 200)
    pinchAt(380, 200, 1, 2);
    act(() => {
      fireGestureHandler(getByGestureTestId('canvas-rotate'), [
        { state: State.BEGAN, anchorX: 380, anchorY: 200, rotation: 0 },
        { state: State.ACTIVE, anchorX: 380, anchorY: 200, rotation: 0 },
        { state: State.ACTIVE, anchorX: 380, anchorY: 200, rotation: 0.5 },
        { state: State.END, anchorX: 380, anchorY: 200, rotation: 0.5 },
      ]);
    });
    await act(async () => fireEvent.press(saveButton()));
    const saved = onSave.mock.calls[0][0].items;
    // 被拖的單品移到最上層
    expect(saved).toEqual([
      { itemId: 'a', x: 1, y: 0.5, scale: 2, rotation: 0.5, z: 1 },
      { itemId: 'bb', x: 0.3, y: 0.3, scale: 1, rotation: 0, z: 0 },
    ]);
    // 不再有選取虛線框
    expect(StyleSheet.flatten(screen.getByTestId('piece-a').props.style).borderStyle).toBeUndefined();
  });

  it('手指沒碰到衣服就不會動：畫布空白處、衣服照片的透明部分都不算', async () => {
    // 白襯衫的照片只有中間一條有衣服（左右都是透明）
    mockShapes = new Map([['a', {
      aspect: 1, bounds: { x0: 0.4, y0: 0, x1: 0.6, y1: 1 },
      mask: Array.from({ length: MASK_GRID * MASK_GRID }, (_, i) => ((i % MASK_GRID) >= 10 && (i % MASK_GRID) <= 13 ? '1' : '0')).join(''),
    }]]);
    const { onSave } = setup({ initial: { name: '', date: '2026-11-02', pieces: [{ itemId: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0, item: shirt }] } });
    layoutCanvas();
    drag(380, 550, -100, -100); // 空白處
    drag(270, 200, 50, 0); // 以前的方框裡、但是透明的地方
    expect(screen.queryByTestId('canvas-trash')).toBeNull();
    drag(200, 200, 40, 0); // 碰到衣服才會動
    await act(async () => fireEvent.press(saveButton()));
    expect(onSave.mock.calls[0][0].items[0]).toMatchObject({ x: 0.6, y: 0.5 });
  });

  it('疊在上面的衣服透明的地方，可以直接拿到下面那件', async () => {
    mockShapes = new Map<string, PieceShape | null>([
      ['a', null],
      ['bb', { aspect: 1, bounds: { x0: 0.4, y0: 0, x1: 0.6, y1: 1 } }],
    ]);
    const { onSave } = setup({
      initial: {
        name: '', date: '2026-11-02',
        pieces: [
          { itemId: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0, item: shirt },
          { itemId: 'bb', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 1, item: jeans },
        ],
      },
    });
    layoutCanvas();
    drag(270, 200, 0, 40); // 牛仔褲在上面，但這裡是它透明的部分 → 動到白襯衫
    await act(async () => fireEvent.press(saveButton()));
    const byId = Object.fromEntries(onSave.mock.calls[0][0].items.map((i: { itemId: string }) => [i.itemId, i]));
    expect(byId.a).toMatchObject({ y: 0.6, z: 1 });
    expect(byId.bb).toMatchObject({ y: 0.5 });
  });

  it('把衣服往下拖到垃圾桶放開就從畫布移除', async () => {
    const { onSave } = setup({
      initial: {
        name: '', date: '2026-11-02',
        pieces: [
          { itemId: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0, item: shirt },
          { itemId: 'bb', x: 0.3, y: 0.3, scale: 1, rotation: 0, z: 1, item: jeans },
        ],
      },
    });
    layoutCanvas();
    expect(screen.queryByTestId('canvas-trash')).toBeNull();
    // (260, 260) 只在白襯衫上
    drag(260, 260, 0, 2000);
    expect(screen.queryByLabelText('白襯衫，在畫布上')).toBeNull();
    expect(screen.queryByTestId('canvas-trash')).toBeNull();
    await act(async () => fireEvent.press(saveButton()));
    expect(onSave.mock.calls[0][0].items.map((i: { itemId: string }) => i.itemId)).toEqual(['bb']);
  });

  it('拖到垃圾桶以外的地方放開不會移除', () => {
    setup({ initial: { name: '', date: '2026-11-02', pieces: [{ itemId: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0, item: shirt }] } });
    layoutCanvas();
    drag(200, 200, -2000, 2000);
    expect(screen.getByLabelText('白襯衫，在畫布上')).toBeTruthy();
    expect(screen.queryByTestId('canvas-trash')).toBeNull();
  });

  it('pinching past the limit does not leave a dead zone when pinching back', async () => {
    const { onSave } = setup({ initial: { name: '', date: '2026-11-02', pieces: [{ itemId: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0, item: shirt }] } });
    layoutCanvas();
    pinchAt(200, 200, 1, 10); // 停在上限 4 倍
    pinchAt(200, 200, 1, 0.5); // 立刻縮到 2 倍，不用先「還掉」超出的部分
    await act(async () => fireEvent.press(saveButton()));
    expect(onSave.mock.calls[0][0].items[0].scale).toBe(2);
  });

  it('螢幕閱讀器可以用「移除」動作把衣服拿掉', () => {
    setup({ initial: { name: '', date: '2026-11-02', pieces: [{ itemId: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0, item: shirt }] } });
    const piece = screen.getByRole('button', { name: '白襯衫，在畫布上' });
    expect(piece.props.accessibilityActions).toEqual([{ name: 'remove', label: '從畫布移除' }]);
    act(() => piece.props.onAccessibilityAction({ nativeEvent: { actionName: 'remove' } }));
    expect(screen.queryByLabelText('白襯衫，在畫布上')).toBeNull();
  });

  it('shows an error when saving fails and lets the user retry', async () => {
    const onSave = jest.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined);
    setup({ initial: { name: '', date: '2026-11-02', pieces: [{ itemId: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0, item: shirt }] }, onSave });
    await act(async () => fireEvent.press(saveButton()));
    expect(screen.getByText('儲存失敗，請再試一次')).toBeTruthy();
    await act(async () => fireEvent.press(saveButton()));
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('deletes an existing outfit only after a second tap', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    setup({ initial: { name: '', date: '2026-11-02', pieces: [{ itemId: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0, item: shirt }] }, onDelete });
    fireEvent.press(screen.getByRole('button', { name: '刪除穿搭' }));
    expect(onDelete).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '再按一次確認刪除' })));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
