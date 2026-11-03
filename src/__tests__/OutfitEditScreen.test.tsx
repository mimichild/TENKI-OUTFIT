import { act, fireEvent, render, screen } from '@testing-library/react-native';
import OutfitEditScreen from '../../app/outfit/edit';
import { ItemRepositoryProvider } from '@/db/ItemRepositoryContext';
import { createMemoryDatabase } from '@/db/memoryItemRepository';
import { OutfitRepositoryProvider } from '@/db/OutfitRepositoryContext';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';
import { withFailures } from './helpers/failingRepo';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('@/lib/photoStorage', () => ({ listPhotoFiles: () => [], clearCutoutCache: jest.fn(), clearBackupTemp: jest.fn(), deletePhotos: jest.fn(), resolvePhotoUri: (u: string | null) => u }));
// 編輯器本身另有測試；這裡只看讀取狀態
jest.mock('@/components/OutfitEditor', () => {
  const { Text } = jest.requireActual('react-native');
  return { OutfitEditor: ({ title }: { title: string }) => <Text>{`editor:${title}`}</Text> };
});

const NOW = '2026-11-03T02:00:00.000Z';

async function seed() {
  const db = createMemoryDatabase({ now: () => NOW, newId: () => 'id1' });
  await db.items.create({ name: '白襯衫', brand: '', category: 'top', price: null, occasions: [], seasons: [], imageUri: null, originalUri: null });
  return db;
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
});
afterEach(() => jest.restoreAllMocks());

describe('outfit edit screen load error', () => {
  it('shows an error with retry when items fail to load (new outfit)', async () => {
    mockParams = { date: '2026-11-03' };
    const db = await seed();
    const { repo, control } = withFailures(db.items, ['list']);
    render(
      <ItemRepositoryProvider repository={repo}>
        <OutfitRepositoryProvider repository={db.outfits}><OutfitEditScreen /></OutfitRepositoryProvider>
      </ItemRepositoryProvider>,
    );
    expect(await screen.findByText('讀取失敗')).toBeTruthy();
    control.failing = false;
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '重試' })));
    expect(await screen.findByText('editor:新增穿搭')).toBeTruthy();
  });

  it('shows an error with retry when the outfit fails to load (edit)', async () => {
    const db = await seed();
    const outfit = await db.outfits.create({ name: '', date: '2026-11-03', items: [{ itemId: 'id1', x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0 }] });
    mockParams = { id: outfit.id };
    const { repo, control } = withFailures(db.outfits, ['get']);
    render(
      <ItemRepositoryProvider repository={db.items}>
        <OutfitRepositoryProvider repository={repo}><OutfitEditScreen /></OutfitRepositoryProvider>
      </ItemRepositoryProvider>,
    );
    expect(await screen.findByText('讀取失敗')).toBeTruthy();
    control.failing = false;
    await act(async () => fireEvent.press(screen.getByRole('button', { name: '重試' })));
    expect(await screen.findByText('editor:編輯穿搭')).toBeTruthy();
  });
});
