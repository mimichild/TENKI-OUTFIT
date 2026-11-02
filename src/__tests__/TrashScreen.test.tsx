import { act, fireEvent, render, screen } from '@testing-library/react-native';
import TrashScreen from '../../app/trash';
import { ItemRepositoryProvider } from '@/db/ItemRepositoryContext';
import type { ItemRepository } from '@/db/itemRepository';
import { createMemoryItemRepository } from '@/db/memoryItemRepository';
import { deletePhotos } from '@/lib/photoStorage';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';
import type { Item } from '@/types/models';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('@/lib/photoStorage', () => ({ clearCutoutCache: jest.fn(), savePhoto: jest.fn(), deletePhotos: jest.fn(), resolvePhotoUri: (u: string | null) => u }));

const base: Omit<Item, 'id' | 'name' | 'deletedAt'> = {
  brand: '', category: 'top', price: null, occasions: [], seasons: [], imageUri: null, originalUri: null,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', lastUsedAt: null,
};

let repo: ItemRepository;

async function setup() {
  repo = createMemoryItemRepository({ now: () => '2026-11-02T00:00:00.000Z', newId: () => 'n' }, [
    { ...base, id: 'a', name: '舊外套', deletedAt: '2026-10-10T00:00:00.000Z', imageUri: 'file:///doc/photos/a.png', originalUri: 'file:///doc/photos/a.jpg' },
    { ...base, id: 'b', name: '帽子', deletedAt: '2026-11-01T00:00:00.000Z' },
    { ...base, id: 'c', name: '還在用', deletedAt: null },
  ]);
  render(<ItemRepositoryProvider repository={repo}><TrashScreen /></ItemRepositoryProvider>);
  await screen.findByText('舊外套');
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-02T00:00:00.000Z') });
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
  jest.clearAllMocks();
});

// FlatList 會排程批次渲染；在測試結束前跑完，避免 act() 警告
afterEach(() => {
  act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

describe('TrashScreen', () => {
  it('lists trashed items, most recently deleted first, with days left', async () => {
    await setup();
    expect(screen.getAllByTestId('trash-name').map(n => n.props.children)).toEqual(['帽子', '舊外套']);
    expect(screen.getByText('剩 7 天後自動刪除')).toBeTruthy();
    expect(screen.queryByText('還在用')).toBeNull();
  });

  it('explains that past outfits keep the photo after deleting forever', async () => {
    await setup();
    expect(screen.getByText('永久刪除後，過去穿搭仍會保留這件單品的照片')).toBeTruthy();
  });

  it('restores an item', async () => {
    await setup();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '還原 舊外套' })));
    expect((await repo.list()).map(i => i.id).sort()).toEqual(['a', 'c']);
    expect(screen.queryByText('舊外套')).toBeNull();
  });

  it('purges only after a second confirming tap, and deletes photos', async () => {
    await setup();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '永久刪除 舊外套' })));
    expect(await repo.get('a')).not.toBeNull();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '確定永久刪除？ 舊外套' })));
    expect(await repo.get('a')).toBeNull();
    expect(deletePhotos).toHaveBeenCalledWith(['file:///doc/photos/a.png', 'file:///doc/photos/a.jpg']);
  });

  it('shows the empty state', async () => {
    repo = createMemoryItemRepository({ now: () => '2026-11-02T00:00:00.000Z', newId: () => 'n' });
    render(<ItemRepositoryProvider repository={repo}><TrashScreen /></ItemRepositoryProvider>);
    expect(await screen.findByText('暫存區是空的')).toBeTruthy();
  });
});
