import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OutfitEditor, type OutfitDraft } from '@/components/OutfitEditor';
import { CANVAS_HEIGHT_RATIO } from '@/lib/outfitCanvas';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';
import type { Item } from '@/types/models';

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
    act(() => {
      fireGestureHandler(getByGestureTestId('pan-a'), [
        { state: State.BEGAN, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, translationX: 1000, translationY: 0 },
        { state: State.END, translationX: 1000, translationY: 0 },
      ]);
    });
    act(() => {
      fireGestureHandler(getByGestureTestId('pinch-a'), [
        { state: State.BEGAN, scale: 1 },
        { state: State.ACTIVE, scale: 1 },
        { state: State.ACTIVE, scale: 2 },
        { state: State.END, scale: 2 },
      ]);
    });
    act(() => {
      fireGestureHandler(getByGestureTestId('rotate-a'), [
        { state: State.BEGAN, rotation: 0 },
        { state: State.ACTIVE, rotation: 0 },
        { state: State.ACTIVE, rotation: 0.5 },
        { state: State.END, rotation: 0.5 },
      ]);
    });
    await act(async () => fireEvent.press(saveButton()));
    const saved = onSave.mock.calls[0][0].items;
    // 拖太遠會停在畫布邊緣；被拖的單品移到最上層
    expect(saved).toEqual([
      { itemId: 'a', x: 1, y: 0.5, scale: 2, rotation: 0.5, z: 1 },
      { itemId: 'bb', x: 0.3, y: 0.3, scale: 1, rotation: 0, z: 0 },
    ]);
    // 不再有選取虛線框
    expect(StyleSheet.flatten(screen.getByTestId('piece-a').props.style).borderStyle).toBeUndefined();
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
    fireEvent(screen.getByTestId('canvas-area'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } } });
    expect(screen.queryByTestId('canvas-trash')).toBeNull();
    act(() => fireGestureHandler(getByGestureTestId('pan-a'), [
      { state: State.BEGAN, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, translationX: 0, translationY: 2000 },
      { state: State.END, translationX: 0, translationY: 2000 },
    ]));
    expect(screen.queryByLabelText('白襯衫，在畫布上')).toBeNull();
    expect(screen.queryByTestId('canvas-trash')).toBeNull();
    await act(async () => fireEvent.press(saveButton()));
    expect(onSave.mock.calls[0][0].items.map((i: { itemId: string }) => i.itemId)).toEqual(['bb']);
  });

  it('拖到垃圾桶以外的地方放開不會移除', () => {
    setup({ initial: { name: '', date: '2026-11-02', pieces: [{ itemId: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0, item: shirt }] } });
    fireEvent(screen.getByTestId('canvas-area'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } } });
    act(() => fireGestureHandler(getByGestureTestId('pan-a'), [
      { state: State.BEGAN, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, translationX: -2000, translationY: 2000 },
      { state: State.END, translationX: -2000, translationY: 2000 },
    ]));
    expect(screen.getByLabelText('白襯衫，在畫布上')).toBeTruthy();
    expect(screen.queryByTestId('canvas-trash')).toBeNull();
  });

  it('pinching past the limit does not leave a dead zone when pinching back', async () => {
    const { onSave } = setup({ initial: { name: '', date: '2026-11-02', pieces: [{ itemId: 'a', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0, item: shirt }] } });
    const pinch = (from: number, to: number) => act(() => {
      fireGestureHandler(getByGestureTestId('pinch-a'), [
        { state: State.BEGAN, scale: from }, { state: State.ACTIVE, scale: from }, { state: State.ACTIVE, scale: to }, { state: State.END, scale: to },
      ]);
    });
    pinch(1, 10); // 停在上限 4 倍
    pinch(1, 0.5); // 立刻縮到 2 倍，不用先「還掉」超出的部分
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
