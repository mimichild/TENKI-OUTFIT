import { createMemoryItemRepository } from '@/db/memoryItemRepository';
import { EMPTY_ITEM_INPUT } from '@/components/ItemForm';
import { deletePhotos, savePhoto } from '@/lib/photoStorage';
import { saveItem } from '@/lib/itemService';
import { measurePhoto } from '@/lib/photoBounds';

jest.mock('@/lib/photoStorage', () => ({
  savePhoto: jest.fn(async (uri: string) => {
    if (uri.includes('broken')) throw new Error('copy failed');
    return uri.replace(/^.*\//, 'photos/');
  }),
  deletePhotos: jest.fn(),
  resolvePhotoUri: (s: string | null) => (s ? `file:///doc/${s}` : null),
}));
jest.mock('@/lib/photoBounds', () => ({ measurePhoto: jest.fn(async () => null) }));

const repo = () => createMemoryItemRepository({ now: () => 'T', newId: () => 'id1' });
const replace = (originalUri: string, imageUri = originalUri) => ({ kind: 'replace' as const, originalUri, imageUri });

beforeEach(() => jest.clearAllMocks());

describe('saveItem', () => {
  it('saves the cutout as the display image and keeps the original separately', async () => {
    const r = repo();
    const item = await saveItem(r, null, { ...EMPTY_ITEM_INPUT, name: 'A' }, replace('file:///cache/p.jpg', 'file:///cache/bg-removal/c.png'));
    expect(savePhoto).toHaveBeenCalledWith('file:///cache/p.jpg');
    expect(savePhoto).toHaveBeenCalledWith('file:///cache/bg-removal/c.png');
    expect(item).toMatchObject({ name: 'A', imageUri: 'photos/c.png', originalUri: 'photos/p.jpg' });
    expect(deletePhotos).not.toHaveBeenCalled();
  });

  it('measures the saved display photo right away so outfits lay out without waiting', async () => {
    const r = repo();
    await saveItem(r, null, EMPTY_ITEM_INPUT, replace('file:///cache/p.jpg', 'file:///cache/bg-removal/c.png'));
    expect(measurePhoto).toHaveBeenCalledWith('photos/c.png');
  });

  it('does not measure when the photo is unchanged or the save fails', async () => {
    const r = repo();
    const item = await saveItem(r, null, EMPTY_ITEM_INPUT, { kind: 'keep' });
    await saveItem(r, item, { ...EMPTY_ITEM_INPUT, name: 'B' }, { kind: 'keep' });
    await expect(saveItem(r, null, EMPTY_ITEM_INPUT, replace('file:///cache/broken.jpg'))).rejects.toThrow();
    expect(measurePhoto).not.toHaveBeenCalled();
  });

  it('without a cutout, copies the photo once and uses it for both', async () => {
    const r = repo();
    const item = await saveItem(r, null, EMPTY_ITEM_INPUT, replace('file:///cache/p.jpg'));
    expect(savePhoto).toHaveBeenCalledTimes(1);
    expect(item).toMatchObject({ imageUri: 'photos/p.jpg', originalUri: 'photos/p.jpg' });
  });

  it('if copying the cutout fails, removes the already-copied original and saves nothing', async () => {
    const r = repo();
    await expect(saveItem(r, null, EMPTY_ITEM_INPUT, replace('file:///cache/p.jpg', 'file:///cache/broken.png'))).rejects.toThrow('copy failed');
    expect(deletePhotos).toHaveBeenCalledWith(['photos/p.jpg']);
    expect(await r.list()).toEqual([]);
  });

  it('replacing a photo deletes the old files after saving', async () => {
    const r = repo();
    const old = await r.create({ ...EMPTY_ITEM_INPUT, imageUri: 'photos/old.png', originalUri: 'photos/old.jpg' });
    const item = await saveItem(r, old, old, replace('file:///cache/new.jpg', 'file:///cache/new.png'));
    expect(item).toMatchObject({ imageUri: 'photos/new.png', originalUri: 'photos/new.jpg' });
    expect(deletePhotos).toHaveBeenCalledWith(['photos/old.png', 'photos/old.jpg']);
  });

  it('removing a photo clears both uris and deletes files', async () => {
    const r = repo();
    const old = await r.create({ ...EMPTY_ITEM_INPUT, imageUri: 'photos/old.jpg', originalUri: 'photos/old.jpg' });
    const item = await saveItem(r, old, old, { kind: 'remove' });
    expect(item).toMatchObject({ imageUri: null, originalUri: null });
    expect(deletePhotos).toHaveBeenCalledWith(['photos/old.jpg', 'photos/old.jpg']);
  });

  it('keep leaves photos untouched even if the input carries other uris', async () => {
    const r = repo();
    const old = await r.create({ ...EMPTY_ITEM_INPUT, imageUri: 'photos/a.jpg', originalUri: 'photos/a.jpg' });
    const item = await saveItem(r, old, { ...old, name: 'B', imageUri: null }, { kind: 'keep' });
    expect(item).toMatchObject({ name: 'B', imageUri: 'photos/a.jpg' });
    expect(savePhoto).not.toHaveBeenCalled();
    expect(deletePhotos).not.toHaveBeenCalled();
  });

  it('if the item vanished, discards the newly copied photos and keeps the old ones', async () => {
    const r = repo();
    const ghost = { ...(await r.create(EMPTY_ITEM_INPUT)), id: 'gone', imageUri: 'photos/old.jpg', originalUri: 'photos/old.jpg' };
    const result = await saveItem(r, ghost, ghost, replace('file:///cache/new.jpg', 'file:///cache/new.png'));
    expect(result).toBeNull();
    expect(deletePhotos).toHaveBeenCalledTimes(1);
    expect(deletePhotos).toHaveBeenCalledWith(['photos/new.png', 'photos/new.jpg']);
  });
});

describe('re-editing the cutout of a saved item', () => {
  async function saved() {
    const r = repo();
    const item = await r.create({ ...EMPTY_ITEM_INPUT, imageUri: 'photos/old-cut.png', originalUri: 'photos/orig.jpg' });
    jest.clearAllMocks();
    return { r, item };
  }

  it('keeps the stored original instead of copying it again', async () => {
    const { r, item } = await saved();
    const result = await saveItem(r, item, EMPTY_ITEM_INPUT, replace('file:///doc/photos/orig.jpg', 'file:///cache/bg-removal/new.png'));
    expect(savePhoto).toHaveBeenCalledTimes(1);
    expect(savePhoto).toHaveBeenCalledWith('file:///cache/bg-removal/new.png');
    expect(result).toMatchObject({ imageUri: 'photos/new.png', originalUri: 'photos/orig.jpg' });
    expect(deletePhotos).toHaveBeenCalledWith(['photos/old-cut.png']);
  });

  it('does not delete the kept original when saving fails', async () => {
    const { r, item } = await saved();
    r.update = jest.fn().mockRejectedValue(new Error('db'));
    await expect(saveItem(r, item, EMPTY_ITEM_INPUT, replace('file:///doc/photos/orig.jpg', 'file:///cache/bg-removal/new.png'))).rejects.toThrow('db');
    expect(deletePhotos).toHaveBeenCalledWith(['photos/new.png']);
  });

  it('uses the display photo as the original when the item had no separate original', async () => {
    const r = repo();
    const item = await r.create({ ...EMPTY_ITEM_INPUT, imageUri: 'photos/only.jpg', originalUri: null });
    jest.clearAllMocks();
    const result = await saveItem(r, item, EMPTY_ITEM_INPUT, replace('file:///doc/photos/only.jpg', 'file:///cache/bg-removal/new.png'));
    expect(savePhoto).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ imageUri: 'photos/new.png', originalUri: 'photos/only.jpg' });
    expect(deletePhotos).not.toHaveBeenCalledWith(expect.arrayContaining(['photos/only.jpg']));
  });
});
