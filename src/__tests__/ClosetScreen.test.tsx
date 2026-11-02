import { act, fireEvent, render as renderRaw, screen } from '@testing-library/react-native';
import ClosetScreen from '../../app/(tabs)/closet';
import { ItemRepositoryProvider } from '@/db/ItemRepositoryContext';
import { createMemoryItemRepository } from '@/db/memoryItemRepository';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';
import type { Item } from '@/types/models';

const mockPush = jest.fn();
const mockSetOptions = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));
jest.mock('@/lib/photoStorage', () => ({ savePhoto: jest.fn(), deletePhotos: jest.fn(), resolvePhotoUri: (u: string | null) => u }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));


function item(p: Partial<Item> & { id: string; name: string }): Item {
  return {
    brand: '', category: 'top', price: null, occasions: [], seasons: [], imageUri: null, originalUri: null,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', lastUsedAt: null, deletedAt: null, ...p,
  };
}

const seed = [
  item({ id: '1', name: '白T', category: 'top', createdAt: '2026-01-01', seasons: ['summer'] }),
  item({ id: '2', name: '牛仔褲', category: 'bottom', createdAt: '2026-02-01' }),
  item({ id: '3', name: '毛衣', category: 'top', createdAt: '2026-03-01', seasons: ['winter'] }),
  item({ id: '4', name: '丟掉的', category: 'top', deletedAt: '2026-10-30' }),
];

async function setup() {
  const repo = createMemoryItemRepository({ now: () => '2026-11-02T00:00:00.000Z', newId: () => 'n' }, seed);
  renderRaw(
    <ItemRepositoryProvider repository={repo}>
      <ClosetScreen />
    </ItemRepositoryProvider>,
  );
  await screen.findByLabelText('毛衣');
  await act(async () => {});
}

const tileNames = () => screen.getAllByTestId('item-tile').map(t => t.props.accessibilityLabel);

beforeEach(() => {
  jest.useFakeTimers();
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
  jest.clearAllMocks();
});

// FlatList 會排程批次渲染；在測試結束前跑完，避免漏到下一個測試觸發 act() 警告
afterEach(() => {
  act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

describe('ClosetScreen', () => {
  it('shows active items newest first and hides trashed ones', async () => {
    await setup();
    expect(tileNames()).toEqual(['毛衣', '牛仔褲', '白T']);
  });

  it('filters by category tab', async () => {
    await setup();
    await act(async () => { fireEvent.press(screen.getByRole('tab', { name: '下著' })); });
    expect(tileNames()).toEqual(['牛仔褲']);
  });

  it('changes sort and season filter from the filter sheet', async () => {
    await setup();
    const headerRight = mockSetOptions.mock.calls.at(-1)[0].headerRight;
    const button = headerRight();
    expect(button.props.label).toBe('篩選與排序');
    act(() => button.props.onPress());
    fireEvent.press(screen.getByRole('radio', { name: '舊→新' }));
    fireEvent.press(screen.getByRole('checkbox', { name: '夏' }));
    expect(tileNames()).toEqual(['白T', '牛仔褲']);
  });

  it('opens the item page when a tile is tapped', async () => {
    await setup();
    fireEvent.press(screen.getByLabelText('牛仔褲'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/item/[id]', params: { id: '2' } });
  });

  it('+ opens the new-item page with the current category', async () => {
    await setup();
    await act(async () => { fireEvent.press(screen.getByRole('tab', { name: '鞋子' })); });
    expect(screen.getByText('沒有符合條件的單品')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '新增單品' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/item/new', params: { category: 'shoes' } });
  });

  it('shows the first-run empty state', async () => {
    const repo = createMemoryItemRepository({ now: () => '2026-11-02T00:00:00.000Z', newId: () => 'n' });
    renderRaw(<ItemRepositoryProvider repository={repo}><ClosetScreen /></ItemRepositoryProvider>);
    await act(async () => {});
    expect(screen.getByText('還沒有單品，按右下角 ＋ 新增第一件')).toBeTruthy();
  });
});
