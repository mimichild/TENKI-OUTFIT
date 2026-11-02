import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ItemForm, EMPTY_ITEM_INPUT } from '@/components/ItemForm';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';

beforeEach(() => useSettingsStore.setState({ ...DEFAULT_SETTINGS }));

function setup(overrides: Partial<React.ComponentProps<typeof ItemForm>> = {}) {
  const props = {
    initial: EMPTY_ITEM_INPUT,
    onPickPhoto: jest.fn().mockResolvedValue('file:///cache/picked.jpg'),
    onRemoveBackground: jest.fn().mockResolvedValue({ status: 'ok', uri: 'file:///cache/bg-removal/cut.png', width: 1, height: 1 }),
    onSubmit: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
  render(<ItemForm {...props} />);
  return props;
}

describe('ItemForm', () => {
  it('submits trimmed fields, chosen chips and parsed price', () => {
    const { onSubmit } = setup();
    fireEvent.changeText(screen.getByLabelText('品牌'), ' UNIQLO ');
    fireEvent.changeText(screen.getByLabelText('名稱'), ' 白襯衫 ');
    fireEvent.press(screen.getByRole('button', { name: '外套' }));
    fireEvent.changeText(screen.getByLabelText('價格'), '1,290');
    fireEvent.press(screen.getByRole('button', { name: '上班' }));
    fireEvent.press(screen.getByRole('button', { name: '冬' }));
    fireEvent.press(screen.getByRole('button', { name: '儲存' }));
    expect(onSubmit).toHaveBeenCalledWith(
      { ...EMPTY_ITEM_INPUT, brand: 'UNIQLO', name: '白襯衫', category: 'outerwear', price: 1290, occasions: ['work'], seasons: ['winter'] },
      { kind: 'keep' },
    );
  });

  it('toggling a chip twice removes it, empty price is null', () => {
    const { onSubmit } = setup();
    fireEvent.press(screen.getByRole('button', { name: '夏' }));
    fireEvent.press(screen.getByRole('button', { name: '夏' }));
    fireEvent.press(screen.getByRole('button', { name: '儲存' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ seasons: [], price: null });
  });

  it('blocks saving with an invalid price', () => {
    const { onSubmit } = setup();
    fireEvent.changeText(screen.getByLabelText('價格'), 'abc');
    fireEvent.press(screen.getByRole('button', { name: '儲存' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('請輸入有效的金額')).toBeTruthy();
  });

  it('picks a photo, removes the background and submits original + cutout', async () => {
    const { onSubmit, onPickPhoto, onRemoveBackground } = setup();
    fireEvent.press(screen.getByRole('button', { name: '從相簿選擇' }));
    await waitFor(() => expect(screen.getByText('已自動去背')).toBeTruthy());
    expect(onPickPhoto).toHaveBeenCalledWith('library');
    expect(onRemoveBackground).toHaveBeenCalledWith('file:///cache/picked.jpg');
    fireEvent.press(screen.getByRole('button', { name: '儲存' }));
    expect(onSubmit.mock.calls[0][1]).toEqual({
      kind: 'replace', originalUri: 'file:///cache/picked.jpg', imageUri: 'file:///cache/bg-removal/cut.png',
    });
  });

  it.each([
    ['unavailable', '這台裝置不支援自動去背，先使用原圖'],
    ['noSubject', '照片中找不到衣物主體，先使用原圖'],
    ['failed', '自動去背失敗，先使用原圖'],
  ])('falls back to the original when background removal is %s', async (status, message) => {
    const { onSubmit } = setup({ onRemoveBackground: jest.fn().mockResolvedValue({ status, error: new Error('x') }) });
    fireEvent.press(screen.getByRole('button', { name: '從相簿選擇' }));
    await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: '儲存' }));
    expect(onSubmit.mock.calls[0][1]).toEqual({
      kind: 'replace', originalUri: 'file:///cache/picked.jpg', imageUri: 'file:///cache/picked.jpg',
    });
  });

  it('cannot save while the background is being removed', async () => {
    let finish!: (r: unknown) => void;
    const { onSubmit } = setup({ onRemoveBackground: jest.fn(() => new Promise(r => { finish = r; })) });
    fireEvent.press(screen.getByRole('button', { name: '從相簿選擇' }));
    await waitFor(() => expect(screen.getByText('正在自動去背…')).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: '儲存' }));
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => finish({ status: 'ok', uri: 'file:///cache/bg-removal/cut.png', width: 1, height: 1 }));
    fireEvent.press(screen.getByRole('button', { name: '儲存' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('ignores a slow cutout result after a newer photo was picked', async () => {
    const finishers: ((r: unknown) => void)[] = [];
    const onPickPhoto = jest.fn()
      .mockResolvedValueOnce('file:///cache/first.jpg')
      .mockResolvedValueOnce('file:///cache/second.jpg');
    const { onSubmit } = setup({ onPickPhoto, onRemoveBackground: jest.fn(() => new Promise(r => { finishers.push(r); })) });
    fireEvent.press(screen.getByRole('button', { name: '從相簿選擇' }));
    await waitFor(() => expect(finishers).toHaveLength(1));
    fireEvent.press(screen.getByRole('button', { name: '拍照' }));
    await waitFor(() => expect(finishers).toHaveLength(2));
    await act(async () => finishers[1]({ status: 'ok', uri: 'file:///cache/bg-removal/second.png', width: 1, height: 1 }));
    await act(async () => finishers[0]({ status: 'ok', uri: 'file:///cache/bg-removal/first.png', width: 1, height: 1 }));
    fireEvent.press(screen.getByRole('button', { name: '儲存' }));
    expect(onSubmit.mock.calls[0][1]).toEqual({
      kind: 'replace', originalUri: 'file:///cache/second.jpg', imageUri: 'file:///cache/bg-removal/second.png',
    });
  });

  it('removing an existing photo reports removal', () => {
    const { onSubmit } = setup({ initial: { ...EMPTY_ITEM_INPUT, imageUri: 'file:///doc/photos/a.jpg' } });
    fireEvent.press(screen.getByRole('button', { name: '刪除照片' }));
    expect(screen.getByRole('button', { name: '從相簿選擇' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '儲存' }));
    expect(onSubmit.mock.calls[0][1]).toEqual({ kind: 'remove' });
  });

  it('shows delete only when onDelete is provided', () => {
    const onDelete = jest.fn();
    setup({ onDelete });
    fireEvent.press(screen.getByRole('button', { name: '刪除' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('has no delete button for a new item; cancel calls onCancel', () => {
    const { onCancel } = setup();
    expect(screen.queryByRole('button', { name: '刪除' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('locks the delete button while deleting and shows an error on failure', async () => {
    let reject!: (e: Error) => void;
    const onDelete = jest.fn(() => new Promise((_, r) => { reject = r; }));
    setup({ onDelete });
    fireEvent.press(screen.getByRole('button', { name: '刪除' }));
    fireEvent.press(screen.getByRole('button', { name: '刪除' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error('db')));
    expect(screen.getByText('儲存失敗，請再試一次')).toBeTruthy();
  });
});
