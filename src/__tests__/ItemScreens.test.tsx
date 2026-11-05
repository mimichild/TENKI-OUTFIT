import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import ItemScreen from '../../app/item/[id]';
import NewItemScreen from '../../app/item/new';
import { ItemRepositoryProvider } from '@/db/ItemRepositoryContext';
import type { ItemRepository } from '@/db/itemRepository';
import { createMemoryItemRepository } from '@/db/memoryItemRepository';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';
import { withFailures } from './helpers/failingRepo';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
let mockScreenOptions: { headerRight?: () => React.ReactElement; animation?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: ({ options }: { options: typeof mockScreenOptions }) => { mockScreenOptions = options; return null; } },
}));
jest.mock('@/lib/photoStorage', () => ({ listPhotoFiles: () => [], clearCutoutCache: jest.fn(), clearBackupTemp: jest.fn(), savePhoto: jest.fn((u: string) => u), deletePhotos: jest.fn(), resolvePhotoUri: (u: string | null) => u }));
jest.mock('@/lib/pickPhoto', () => ({ pickPhoto: jest.fn() }));


let repo: ItemRepository;

beforeEach(async () => {
  jest.clearAllMocks();
  mockScreenOptions = {};
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
  repo = createMemoryItemRepository({ now: () => '2026-11-02T00:00:00.000Z', newId: () => 'id1' });
  await repo.create({
    name: '白襯衫', brand: 'UNIQLO', category: 'top', price: 1290, occasions: ['work'], seasons: [],
    imageUri: null, originalUri: null,
  });
});

const wrap = (ui: React.ReactElement) => render(<ItemRepositoryProvider repository={repo}>{ui}</ItemRepositoryProvider>);

describe('item detail screen', () => {
  it('shows item info with formatted price', async () => {
    mockParams = { id: 'id1' };
    wrap(<ItemScreen />);
    expect(await screen.findByText('白襯衫')).toBeTruthy();
    expect(screen.getByText('NT$1,290')).toBeTruthy();
    expect(screen.getByText('上班')).toBeTruthy();
    expect(screen.getByText('不選＝四季皆可')).toBeTruthy();
  });

  it('edits via the header button and saves', async () => {
    mockParams = { id: 'id1' };
    wrap(<ItemScreen />);
    await screen.findByText('白襯衫');
    await act(async () => mockScreenOptions.headerRight!().props.onPress());
    fireEvent.changeText(screen.getByLabelText('名稱'), '藍襯衫');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '儲存' })));
    expect(await screen.findByText('藍襯衫')).toBeTruthy();
    expect((await repo.get('id1'))?.name).toBe('藍襯衫');
  });

  it('顏色與風格：沒選時顯示自動判斷，手動選了會存下來，再點一次改回自動', async () => {
    mockParams = { id: 'id1' };
    wrap(<ItemScreen />);
    await screen.findByText('白襯衫');
    // 白襯衫的場合是上班，看不出風格 → 可休閒可淑女；沒照片，量不到顏色
    expect(screen.getByText('可休閒可淑女')).toBeTruthy();
    expect(screen.queryByText('不限')).toBeNull();
    await act(async () => mockScreenOptions.headerRight!().props.onPress());
    expect(screen.queryByText(/不限風格/)).toBeNull();
    fireEvent.changeText(screen.getByLabelText('名稱'), '蕾絲白襯衫');
    expect(screen.getByText('依名稱與場合自動判斷為「淑女風」，點選可以更改')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '淑女風' }).props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByRole('radio', { name: '深藍' }));
    fireEvent.press(screen.getByRole('radio', { name: '休閒風' }));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '儲存' })));
    expect(await repo.get('id1')).toMatchObject({ color: 'navy', style: 'casual' });
    expect(screen.getByText('深藍')).toBeTruthy();
    expect(screen.getByText('休閒風')).toBeTruthy();

    // 再點一次選中的風格 → 改回自動（存 null）
    await act(async () => mockScreenOptions.headerRight!().props.onPress());
    fireEvent.press(screen.getByRole('radio', { name: '休閒風' }));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '儲存' })));
    expect(await repo.get('id1')).toMatchObject({ color: 'navy', style: null });
    expect(screen.getByText('淑女風')).toBeTruthy();
    expect(screen.queryByText(/（自動）/)).toBeNull();

    // 可休閒可淑女
    await act(async () => mockScreenOptions.headerRight!().props.onPress());
    fireEvent.press(screen.getByRole('radio', { name: '可休閒可淑女' }));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '儲存' })));
    expect(await repo.get('id1')).toMatchObject({ style: 'both' });
    expect(screen.getByText('可休閒可淑女')).toBeTruthy();
  });

  it('delete moves the item to trash and goes back', async () => {
    mockParams = { id: 'id1' };
    wrap(<ItemScreen />);
    await screen.findByText('白襯衫');
    await act(async () => mockScreenOptions.headerRight!().props.onPress());
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '刪除' })));
    expect((await repo.listTrash()).map(i => i.id)).toEqual(['id1']);
    expect(mockBack).toHaveBeenCalled();
  });

  it('treats an item in the trash as not found', async () => {
    await repo.moveToTrash('id1');
    mockParams = { id: 'id1' };
    wrap(<ItemScreen />);
    expect(await screen.findByText('找不到這件單品')).toBeTruthy();
  });

  it('shows not-found for unknown ids', async () => {
    mockParams = { id: 'nope' };
    wrap(<ItemScreen />);
    expect(await screen.findByText('找不到這件單品')).toBeTruthy();
  });
});

describe('item detail swipe', () => {
  // 三件單品依序新增：a（最舊）→ b → c（最新）；b 是下著
  beforeEach(async () => {
    let n = 0;
    const ids = ['a', 'b', 'c'];
    repo = createMemoryItemRepository({ now: () => `2026-11-0${n + 1}T00:00:00.000Z`, newId: () => ids[n++] });
    for (const [name, category] of [['舊上衣', 'top'], ['褲子', 'bottom'], ['新上衣', 'top']] as const) {
      await repo.create({ name, brand: '', category, price: null, occasions: [], seasons: [], imageUri: null, originalUri: null });
    }
  });
  const swipe = (dx: number) =>
    act(() => fireGestureHandler(getByGestureTestId('item-swipe'), [
      { state: State.BEGAN, translationX: 0 },
      { state: State.ACTIVE, translationX: 0 },
      { state: State.ACTIVE, translationX: dx },
      { state: State.END, translationX: dx },
    ]));

  it('預設（最新排序）由左往右滑到較新的單品，由右往左滑到較舊的單品', async () => {
    mockParams = { id: 'b' };
    wrap(<ItemScreen />);
    await screen.findByText('褲子');
    swipe(120);
    expect(mockReplace).toHaveBeenLastCalledWith({ pathname: '/item/[id]', params: { id: 'c', dir: 'prev' } });
    swipe(-120);
    expect(mockReplace).toHaveBeenLastCalledWith({ pathname: '/item/[id]', params: { id: 'a', dir: 'next' } });
  });

  it('滑太短不換；已經是最新的一件就不動', async () => {
    mockParams = { id: 'c' };
    wrap(<ItemScreen />);
    await screen.findByText('新上衣');
    swipe(-30);
    swipe(120);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('沿用服裝頁的分類：在「上衣」裡滑會跳過下著', async () => {
    mockParams = { id: 'c', category: 'top' };
    wrap(<ItemScreen />);
    await screen.findByText('新上衣');
    swipe(-120);
    expect(mockReplace).toHaveBeenLastCalledWith({ pathname: '/item/[id]', params: { id: 'a', category: 'top', dir: 'next' } });
  });

  it('沿用服裝頁的季節與場合篩選：不符合的單品會跳過', async () => {
    // 把中間的褲子改成只適合冬天、上班
    const pants = (await repo.get('b'))!;
    await repo.update('b', { ...pants, seasons: ['winter'], occasions: ['work'] });
    for (const params of [{ seasons: 'summer' }, { occasions: 'date' }]) {
      mockReplace.mockClear();
      mockParams = { id: 'c', ...params };
      const { unmount } = wrap(<ItemScreen />);
      await screen.findByText('新上衣');
      swipe(-120);
      expect(mockReplace).toHaveBeenLastCalledWith({ pathname: '/item/[id]', params: { id: 'a', ...params, dir: 'next' } });
      unmount();
    }
  });

  it('沿用服裝頁的排序：最舊排序時由左往右滑是較舊的單品', async () => {
    mockParams = { id: 'b', sort: 'oldest' };
    wrap(<ItemScreen />);
    await screen.findByText('褲子');
    swipe(120);
    expect(mockReplace).toHaveBeenLastCalledWith({ pathname: '/item/[id]', params: { id: 'a', sort: 'oldest', dir: 'prev' } });
  });

  it('前一格從左邊滑進來，後一格從右邊滑進來', async () => {
    mockParams = { id: 'a', dir: 'next' };
    wrap(<ItemScreen />);
    await screen.findByText('舊上衣');
    expect(mockScreenOptions.animation).toBe('slide_from_right');
  });
});

describe('new item screen', () => {
  it('preselects the category from params and saves', async () => {
    mockParams = { category: 'shoes' };
    repo = createMemoryItemRepository({ now: () => '2026-11-02T00:00:00.000Z', newId: () => 'new1' });
    wrap(<NewItemScreen />);
    fireEvent.changeText(screen.getByLabelText('名稱'), '球鞋');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '儲存' })));
    expect(await repo.get('new1')).toMatchObject({ name: '球鞋', category: 'shoes' });
    expect(mockBack).toHaveBeenCalled();
  });

  it('ignores an invalid category param', async () => {
    mockParams = { category: 'rocket' };
    wrap(<NewItemScreen />);
    expect(screen.getByRole('button', { name: '上衣' }).props.accessibilityState.selected).toBe(true);
  });
});

describe('item detail load error', () => {
  it('shows an error with retry when the item fails to load', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockParams = { id: 'id1' };
    const { repo: failing, control } = withFailures(repo, ['get']);
    render(<ItemRepositoryProvider repository={failing}><ItemScreen /></ItemRepositoryProvider>);
    expect(await screen.findByText('讀取失敗')).toBeTruthy();
    control.failing = false;
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '重試' })));
    expect(await screen.findByText('白襯衫')).toBeTruthy();
  });
});
