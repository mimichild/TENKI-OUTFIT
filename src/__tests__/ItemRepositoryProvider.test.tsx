import { act, render } from '@testing-library/react-native';
import { AppState, Text, type AppStateStatus } from 'react-native';
import { ItemRepositoryProvider, useItemsVersion } from '@/db/ItemRepositoryContext';
import { createMemoryDatabase } from '@/db/memoryItemRepository';
import { EMPTY_ITEM_INPUT } from '@/components/ItemForm';
import { clearBackupTemp, clearCutoutCache, deletePhotos, listPhotoFiles } from '@/lib/photoStorage';

jest.mock('@/lib/photoStorage', () => ({
  deletePhotos: jest.fn(),
  clearCutoutCache: jest.fn(),
  clearBackupTemp: jest.fn(),
  listPhotoFiles: jest.fn(() => []),
}));

const HOUR = 3_600_000;
let onAppState: ((s: AppStateStatus) => void) | undefined;
const originalAddListener = AppState.addEventListener;

beforeEach(() => {
  jest.clearAllMocks();
  (listPhotoFiles as jest.Mock).mockReturnValue([]);
  onAppState = undefined;
  AppState.addEventListener = ((_type: string, handler: (s: AppStateStatus) => void) => {
    onAppState = handler;
    return { remove: () => { onAppState = undefined; } };
  }) as typeof AppState.addEventListener;
});
afterEach(() => {
  AppState.addEventListener = originalAddListener;
  jest.restoreAllMocks();
});

it('refreshes screens after the startup purge even when it only archived items', async () => {
  // 開 App 時（台灣 12/5）：一件 31 天前進暫存區、但過去穿搭還用到的單品 → 只會被封存
  let now = '2026-11-02T04:00:00.000Z';
  let n = 0;
  const db = createMemoryDatabase({ now: () => now, newId: () => `id${++n}` });
  const item = await db.items.create(EMPTY_ITEM_INPUT);
  await db.outfits.create({ name: '', date: '2026-11-01', items: [{ itemId: item.id, x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0 }] });
  await db.items.moveToTrash(item.id);
  now = '2026-12-05T04:00:00.000Z';

  const before = useItemsVersion.getState().version;
  render(<ItemRepositoryProvider repository={db.items} now={() => now}><Text>app</Text></ItemRepositoryProvider>);
  await act(async () => {});
  expect(await db.items.listTrash()).toEqual([]);
  expect(useItemsVersion.getState().version).toBe(before + 1);
});

describe('startup photo cleanup', () => {
  const NOW = '2026-11-03T02:00:00.000Z';
  const t = Date.parse(NOW);

  async function start() {
    const db = createMemoryDatabase({ now: () => NOW, newId: () => 'kept' });
    await db.items.create({ ...EMPTY_ITEM_INPUT, imageUri: 'photos/kept.png', originalUri: 'photos/kept.jpg' });
    (listPhotoFiles as jest.Mock).mockReturnValue([
      { path: 'photos/kept.png', modifiedAt: t - 5 * HOUR },
      { path: 'photos/kept.jpg', modifiedAt: t - 5 * HOUR },
      { path: 'photos/orphan.png', modifiedAt: t - 2 * HOUR },
      { path: 'photos/fresh.png', modifiedAt: t - 10 * 60_000 },
    ]);
    render(<ItemRepositoryProvider repository={db.items} now={() => NOW}><Text>app</Text></ItemRepositoryProvider>);
    await act(async () => {});
    return db;
  }

  it('clears temp folders, purges, then deletes old unreferenced photos only', async () => {
    await start();
    expect(clearCutoutCache).toHaveBeenCalled();
    expect(clearBackupTemp).toHaveBeenCalled();
    expect(deletePhotos).toHaveBeenLastCalledWith(['photos/orphan.png']);
  });

  it('only logs when listing photos fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (listPhotoFiles as jest.Mock).mockImplementation(() => { throw new Error('io'); });
    const db = createMemoryDatabase({ now: () => NOW, newId: () => 'x' });
    const before = useItemsVersion.getState().version;
    render(<ItemRepositoryProvider repository={db.items} now={() => NOW}><Text>app</Text></ItemRepositoryProvider>);
    await act(async () => {});
    expect(warn).toHaveBeenCalled();
    expect(useItemsVersion.getState().version).toBe(before + 1);
  });
});

describe('purge again when the app comes back on a new day', () => {
  it('purges expired trash when coming to the foreground on a new Taipei day, once per day', async () => {
    let now = '2026-11-03T15:00:00.000Z'; // 台灣 11/3 23:00
    const db = createMemoryDatabase({ now: () => now, newId: () => 'x' });
    const purge = jest.spyOn(db.items, 'purgeExpired');
    render(<ItemRepositoryProvider repository={db.items} now={() => now}><Text>app</Text></ItemRepositoryProvider>);
    await act(async () => {});
    expect(purge).toHaveBeenCalledTimes(1);

    // 同一天回到前景：不重跑
    now = '2026-11-03T15:30:00.000Z';
    await act(async () => onAppState?.('active'));
    expect(purge).toHaveBeenCalledTimes(1);

    // 跨過台灣午夜：重跑一次，而且不重跑孤兒照片清除
    now = '2026-11-03T16:10:00.000Z'; // 台灣 11/4 00:10
    (listPhotoFiles as jest.Mock).mockClear();
    await act(async () => onAppState?.('background'));
    await act(async () => onAppState?.('active'));
    expect(purge).toHaveBeenCalledTimes(2);
    expect(listPhotoFiles).not.toHaveBeenCalled();

    await act(async () => onAppState?.('active'));
    expect(purge).toHaveBeenCalledTimes(2);
  });
});
