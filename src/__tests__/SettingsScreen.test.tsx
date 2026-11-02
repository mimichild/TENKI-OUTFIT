import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import SettingsScreen from '../../app/(tabs)/settings';
import { ItemRepositoryProvider } from '@/db/ItemRepositoryContext';
import { createMemoryItemRepository } from '@/db/memoryItemRepository';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/settingsStore';
import type { Item } from '@/types/models';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/lib/photoStorage', () => ({ clearCutoutCache: jest.fn(), savePhoto: jest.fn(), deletePhotos: jest.fn(), resolvePhotoUri: (u: string | null) => u }));

const trashed: Item = {
  id: 't', name: '舊T', brand: '', category: 'top', price: null, occasions: [], seasons: [],
  imageUri: null, originalUri: null, createdAt: 'c', updatedAt: 'u', lastUsedAt: null,
  deletedAt: new Date().toISOString(),
};

/** 等暫存區件數讀完，避免 act() 警告 */
async function render(ui: React.ReactElement, seed: Item[] = []) {
  const repo = createMemoryItemRepository({ now: () => new Date().toISOString(), newId: () => 'n' }, seed);
  rtlRender(<ItemRepositoryProvider repository={repo}>{ui}</ItemRepositoryProvider>);
  await act(async () => {});
}

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
  mockPush.mockClear();
});

describe('SettingsScreen', () => {
  it('switches the UI language from the language picker', async () => {
    await render(<SettingsScreen />);
    fireEvent.press(screen.getByRole('button', { name: '語言' }));
    fireEvent.press(screen.getByText('English'));
    expect(useSettingsStore.getState().language).toBe('en');
    expect(screen.getByRole('button', { name: 'Language' })).toBeTruthy();
  });

  it('changes the theme color when a swatch is tapped', async () => {
    await render(<SettingsScreen />);
    fireEvent.press(screen.getByRole('button', { name: '抹茶綠' }));
    expect(useSettingsStore.getState().themeColor).toBe('matcha');
  });

  it('changes region and resets the town', async () => {
    await render(<SettingsScreen />);
    fireEvent.press(screen.getByRole('button', { name: '地區' }));
    fireEvent.press(screen.getByText('高雄市'));
    expect(useSettingsStore.getState()).toMatchObject({ county: '高雄市', town: '' });
  });

  it('stores the trimmed CWA key', async () => {
    await render(<SettingsScreen />);
    fireEvent.changeText(screen.getByLabelText('氣象署授權碼'), ' CWA-123 ');
    expect(useSettingsStore.getState().cwaApiKey).toBe('CWA-123');
  });

  it('shows the trash count and opens the trash page', async () => {
    await render(<SettingsScreen />, [trashed]);
    expect(await screen.findByText('1 件')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '暫存區（刪除的單品）' }));
    expect(mockPush).toHaveBeenCalledWith('/trash');
  });
});
