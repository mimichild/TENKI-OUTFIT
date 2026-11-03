import { createMemoryDatabase } from '@/db/memoryItemRepository';
import { useItemsVersion } from '@/db/ItemRepositoryContext';
import { EMPTY_ITEM_INPUT } from '@/components/ItemForm';
import { deletePhotos } from '@/lib/photoStorage';
import { purgeItem } from '@/lib/itemService';
import { deleteOutfit, saveOutfit } from '@/lib/outfitService';

jest.mock('@/lib/photoStorage', () => ({ listPhotoFiles: () => [], savePhoto: jest.fn(), deletePhotos: jest.fn() }));

let n = 0;
const makeDb = () => createMemoryDatabase({ now: () => '2026-11-02T04:00:00.000Z', newId: () => `id${++n}` });
const piece = (itemId: string) => ({ itemId, x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0 });
const photo = { ...EMPTY_ITEM_INPUT, imageUri: 'photos/c.png', originalUri: 'photos/o.jpg' };

beforeEach(() => jest.clearAllMocks());

describe('outfit service', () => {
  it('saves new and existing outfits and notifies screens', async () => {
    const db = makeDb();
    const item = await db.items.create(photo);
    const v = useItemsVersion.getState().version;
    const created = await saveOutfit(db.outfits, null, { name: '', date: '2026-11-05', items: [piece(item.id)] });
    const updated = await saveOutfit(db.outfits, created!.id, { name: 'x', date: '2026-11-06', items: [piece(item.id)] });
    expect(updated).toMatchObject({ id: created!.id, date: '2026-11-06' });
    expect(useItemsVersion.getState().version).toBe(v + 2);
    expect(await saveOutfit(db.outfits, 'missing', { name: '', date: '2026-11-06', items: [piece(item.id)] })).toBeNull();
  });

  it('keeps photos when an item is archived, and deletes them once its last past outfit is gone', async () => {
    const db = makeDb();
    const item = await db.items.create(photo);
    const past = await db.outfits.create({ name: '', date: '2026-10-01', items: [piece(item.id)] });
    await db.items.moveToTrash(item.id);
    await purgeItem(db.items, item.id);
    expect(deletePhotos).toHaveBeenLastCalledWith([]);
    await deleteOutfit(db.outfits, past.id);
    expect(deletePhotos).toHaveBeenLastCalledWith(['photos/c.png', 'photos/o.jpg']);
  });

  it('deletes photos of an archived item removed from its last past outfit by editing', async () => {
    const db = makeDb();
    const a = await db.items.create(photo);
    const b = await db.items.create(EMPTY_ITEM_INPUT);
    const past = await db.outfits.create({ name: '', date: '2026-10-01', items: [piece(a.id), piece(b.id)] });
    await db.items.moveToTrash(a.id);
    await purgeItem(db.items, a.id);
    await saveOutfit(db.outfits, past.id, { name: '', date: '2026-10-01', items: [piece(b.id)] });
    expect(deletePhotos).toHaveBeenLastCalledWith(['photos/c.png', 'photos/o.jpg']);
  });
});
