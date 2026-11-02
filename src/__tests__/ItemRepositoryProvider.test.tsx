import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ItemRepositoryProvider, useItemsVersion } from '@/db/ItemRepositoryContext';
import { createMemoryDatabase } from '@/db/memoryItemRepository';
import { EMPTY_ITEM_INPUT } from '@/components/ItemForm';

jest.mock('@/lib/photoStorage', () => ({ deletePhotos: jest.fn(), clearCutoutCache: jest.fn() }));

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
  render(<ItemRepositoryProvider repository={db.items}><Text>app</Text></ItemRepositoryProvider>);
  await act(async () => {});
  expect(await db.items.listTrash()).toEqual([]);
  expect(useItemsVersion.getState().version).toBe(before + 1);
});
