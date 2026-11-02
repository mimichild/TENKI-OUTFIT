import { act, fireEvent, render, screen } from '@testing-library/react-native';
import ItemScreen from '../../app/item/[id]';
import NewItemScreen from '../../app/item/new';
import { ItemRepositoryProvider } from '@/db/ItemRepositoryContext';
import type { ItemRepository } from '@/db/itemRepository';
import { createMemoryItemRepository } from '@/db/memoryItemRepository';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';

const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
let mockScreenOptions: { headerRight?: () => React.ReactElement } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: ({ options }: { options: typeof mockScreenOptions }) => { mockScreenOptions = options; return null; } },
}));
jest.mock('@/lib/photoStorage', () => ({ clearCutoutCache: jest.fn(), savePhoto: jest.fn((u: string) => u), deletePhotos: jest.fn(), resolvePhotoUri: (u: string | null) => u }));
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
