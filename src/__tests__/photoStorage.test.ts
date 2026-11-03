import { clearCutoutCache, deletePhotos, listPhotoFiles, resolvePhotoUri, savePhoto } from '@/lib/photoStorage';

const mockCopied: { from: string; to: string }[] = [];
const mockDeleted: string[] = [];
/** photos/ 資料夾裡的項目；dir = 子資料夾 */
let mockListing: { name: string; modificationTime: number | null; dir?: boolean }[] = [];

jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map(p => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() { return !this.uri.includes('missing'); }
    create() {}
    delete() { mockDeleted.push(this.uri); }
    list() {
      return mockListing.map(e => {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const entry = e.dir ? new Directory(this, e.name) : new File(this, e.name);
        return Object.assign(entry, { name: e.name, modificationTime: e.modificationTime });
      });
    }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map(p => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() { return !this.uri.includes('missing'); }
    delete() { mockDeleted.push(this.uri); }
  }
  return { Directory, File, Paths: { document: new Directory('file:///doc'), cache: new Directory('file:///cache') } };
});
jest.mock('expo-file-system/legacy', () => ({
  copyAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
    mockCopied.push({ from, to });
  }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
const mockRemoveBounds = jest.fn();
jest.mock('@/lib/photoBoundsCache', () => ({ boundsCache: { remove: async (p: string[]) => mockRemoveBounds(p) } }));


beforeEach(() => { mockCopied.length = 0; mockDeleted.length = 0; mockListing = []; });

describe('photoStorage', () => {
  it('copies a picked photo into the app photo folder and returns a relative path', async () => {
    // iOS 更新 App 後 Documents 的絕對路徑可能改變，所以 DB 只存相對路徑
    const stored = await savePhoto('file:///cache/IMG_1.HEIC');
    expect(stored).toBe('photos/uuid-1.heic');
    expect(mockCopied).toEqual([{ from: 'file:///cache/IMG_1.HEIC', to: 'file:///doc/photos/uuid-1.heic' }]);
  });

  it('defaults to .jpg when the source has no extension', async () => {
    expect(await savePhoto('content://media/123')).toBe('photos/uuid-1.jpg');
  });

  it('keeps .png for cutouts so the transparent background survives', async () => {
    expect(await savePhoto('file:///cache/bg-removal/X.png')).toBe('photos/uuid-1.png');
  });

  it('resolves stored relative paths against the current document folder', () => {
    expect(resolvePhotoUri('photos/a.jpg')).toBe('file:///doc/photos/a.jpg');
    expect(resolvePhotoUri('file:///cache/temp.jpg')).toBe('file:///cache/temp.jpg');
    expect(resolvePhotoUri(null)).toBeNull();
  });

  it('deletes only app-owned photos that exist and skips nulls and duplicates', () => {
    deletePhotos(['photos/a.jpg', null, 'photos/a.jpg', 'file:///elsewhere/b.jpg', '../escape.jpg', 'photos/missing.jpg']);
    expect(mockDeleted).toEqual(['file:///doc/photos/a.jpg']);
  });

  it('drops the cached bounds of deleted photos', () => {
    mockRemoveBounds.mockClear();
    deletePhotos(['photos/a.jpg', 'file:///elsewhere/b.jpg', null]);
    expect(mockRemoveBounds).toHaveBeenCalledWith(['photos/a.jpg']);
  });

  it('lists files in the photo folder as relative paths with modification time, skipping folders', () => {
    mockListing = [
      { name: 'a.png', modificationTime: 1000 },
      { name: 'b.jpg', modificationTime: null },
      { name: 'sub', modificationTime: 5, dir: true },
    ];
    expect(listPhotoFiles()).toEqual([
      { path: 'photos/a.png', modifiedAt: 1000 },
      { path: 'photos/b.jpg', modifiedAt: null },
    ]);
  });

  it('clears leftover cutout temp files from the cache folder', () => {
    clearCutoutCache();
    expect(mockDeleted).toEqual(['file:///cache/bg-removal']);
  });
});
