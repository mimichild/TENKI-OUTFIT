import { deletePhotos, savePhoto } from '@/lib/photoStorage';

const mockCopied: { from: string; to: string }[] = [];
const mockDeleted: string[] = [];

jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map(p => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() { return true; }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map(p => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() { return !this.uri.includes('missing'); }
    copy(dest: { uri: string }) { mockCopied.push({ from: this.uri, to: dest.uri }); }
    delete() { mockDeleted.push(this.uri); }
  }
  return { Directory, File, Paths: { document: new Directory('file:///doc') } };
});
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));


beforeEach(() => { mockCopied.length = 0; mockDeleted.length = 0; });

describe('photoStorage', () => {
  it('copies a picked photo into the app photo folder, keeping the extension', () => {
    const uri = savePhoto('file:///cache/IMG_1.HEIC');
    expect(uri).toBe('file:///doc/photos/uuid-1.heic');
    expect(mockCopied).toEqual([{ from: 'file:///cache/IMG_1.HEIC', to: uri }]);
  });

  it('defaults to .jpg when the source has no extension', () => {
    expect(savePhoto('content://media/123')).toBe('file:///doc/photos/uuid-1.jpg');
  });

  it('deletes only app-owned photos that exist and skips nulls and duplicates', () => {
    deletePhotos(['file:///doc/photos/a.jpg', null, 'file:///doc/photos/a.jpg', 'file:///elsewhere/b.jpg', 'file:///doc/photos/missing.jpg']);
    expect(mockDeleted).toEqual(['file:///doc/photos/a.jpg']);
  });
});
