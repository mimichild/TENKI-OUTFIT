import { createMemoryItemRepository } from '@/db/memoryItemRepository';
import { EMPTY_ITEM_INPUT } from '@/components/ItemForm';
import { deletePhotos, savePhoto } from '@/lib/photoStorage';
import { saveItem } from '@/lib/itemService';

jest.mock('@/lib/photoStorage', () => ({
  savePhoto: jest.fn((uri: string) => uri.replace('cache', 'doc/photos')),
  deletePhotos: jest.fn(),
}));


const repo = () => createMemoryItemRepository({ now: () => 'T', newId: () => 'id1' });

beforeEach(() => jest.clearAllMocks());

describe('saveItem', () => {
  it('creates a new item, copying the picked photo as both original and display image', async () => {
    const r = repo();
    const item = await saveItem(r, null, { ...EMPTY_ITEM_INPUT, name: 'A' }, { kind: 'replace', uri: 'file:///cache/p.jpg' });
    expect(savePhoto).toHaveBeenCalledWith('file:///cache/p.jpg');
    expect(item).toMatchObject({ name: 'A', imageUri: 'file:///doc/photos/p.jpg', originalUri: 'file:///doc/photos/p.jpg' });
    expect(deletePhotos).not.toHaveBeenCalled();
  });

  it('replacing a photo deletes the old files after saving', async () => {
    const r = repo();
    const old = await r.create({ ...EMPTY_ITEM_INPUT, imageUri: 'file:///doc/photos/old.png', originalUri: 'file:///doc/photos/old.jpg' });
    const item = await saveItem(r, old, old, { kind: 'replace', uri: 'file:///cache/new.jpg' });
    expect(item?.imageUri).toBe('file:///doc/photos/new.jpg');
    expect(deletePhotos).toHaveBeenCalledWith(['file:///doc/photos/old.png', 'file:///doc/photos/old.jpg']);
  });

  it('removing a photo clears both uris and deletes files', async () => {
    const r = repo();
    const old = await r.create({ ...EMPTY_ITEM_INPUT, imageUri: 'file:///doc/photos/old.jpg', originalUri: 'file:///doc/photos/old.jpg' });
    const item = await saveItem(r, old, old, { kind: 'remove' });
    expect(item).toMatchObject({ imageUri: null, originalUri: null });
    expect(deletePhotos).toHaveBeenCalledWith(['file:///doc/photos/old.jpg', 'file:///doc/photos/old.jpg']);
  });

  it('keep leaves photos untouched even if the input carries other uris', async () => {
    const r = repo();
    const old = await r.create({ ...EMPTY_ITEM_INPUT, imageUri: 'file:///doc/photos/a.jpg', originalUri: 'file:///doc/photos/a.jpg' });
    const item = await saveItem(r, old, { ...old, name: 'B', imageUri: null }, { kind: 'keep' });
    expect(item).toMatchObject({ name: 'B', imageUri: 'file:///doc/photos/a.jpg' });
    expect(savePhoto).not.toHaveBeenCalled();
    expect(deletePhotos).not.toHaveBeenCalled();
  });

  it('if the item vanished, discards the newly copied photo and keeps the old ones', async () => {
    const r = repo();
    const ghost = { ...(await r.create(EMPTY_ITEM_INPUT)), id: 'gone', imageUri: 'photos/old.jpg', originalUri: 'photos/old.jpg' };
    const result = await saveItem(r, ghost, ghost, { kind: 'replace', uri: 'file:///cache/new.jpg' });
    expect(result).toBeNull();
    expect(deletePhotos).toHaveBeenCalledTimes(1);
    expect(deletePhotos).toHaveBeenCalledWith(['file:///doc/photos/new.jpg']);
  });
});
