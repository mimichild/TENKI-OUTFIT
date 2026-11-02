import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ItemForm, EMPTY_ITEM_INPUT } from '@/components/ItemForm';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';

beforeEach(() => useSettingsStore.setState({ ...DEFAULT_SETTINGS }));

function setup(overrides: Partial<React.ComponentProps<typeof ItemForm>> = {}) {
  const props = {
    initial: EMPTY_ITEM_INPUT,
    onPickPhoto: jest.fn().mockResolvedValue('file:///cache/picked.jpg'),
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

  it('picks a photo and reports it as a replacement', async () => {
    const { onSubmit, onPickPhoto } = setup();
    fireEvent.press(screen.getByRole('button', { name: '從相簿選擇' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '刪除照片' })).toBeTruthy());
    expect(onPickPhoto).toHaveBeenCalledWith('library');
    fireEvent.press(screen.getByRole('button', { name: '儲存' }));
    expect(onSubmit.mock.calls[0][1]).toEqual({ kind: 'replace', uri: 'file:///cache/picked.jpg' });
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
});
