import { measurePhoto } from '@/lib/photoBounds';
import { isMask, MASK_GRID } from '@/lib/pieceHit';

// jest.mock 會被提到 import 之前；工廠裡只在函式內用到 mock 開頭的變數
const mockDisposed: string[] = [];
const mockFromURI = jest.fn();
let mockDecodeFails = false;
let mockTransparent = false;

jest.mock('@shopify/react-native-skia', () => {
  const disposable = (name: string, extra: object = {}) => ({ ...extra, dispose: () => mockDisposed.push(name) });
  return {
    AlphaType: { Unpremul: 3 },
    ColorType: { RGBA_8888: 4 },
    Skia: {
      Data: { fromURI: (uri: string) => mockFromURI(uri) },
      Image: {
        MakeImageFromEncoded: () => (mockDecodeFails ? null : disposable('image', { width: () => 4, height: () => 2 })),
      },
      XYWHRect: () => ({}),
      Paint: () => disposable('paint'),
      Surface: {
        Make: () =>
          disposable('surface', {
            getCanvas: () => ({ drawImageRect: () => {} }),
            flush: () => {},
            makeImageSnapshot: () => {
              const px = new Uint8Array(4 * 2 * 4);
              if (!mockTransparent) px[(1 * 4 + 2) * 4 + 3] = 255;
              return disposable('snapshot', { readPixels: () => px });
            },
          }),
      },
    },
  };
});


// 檔案快取：測試裡用記憶體版本
const mockCached = new Map<string, unknown>();
jest.mock('@/lib/photoBoundsCache', () => ({
  boundsCache: {
    get: async (k: string) => (mockCached.has(k) ? mockCached.get(k) : undefined),
    set: async (k: string, v: unknown) => { mockCached.set(k, v); },
    remove: async () => {},
  },
}));
jest.mock('@/lib/photoStorage', () => ({
  resolvePhotoUri: (s: string | null) => (s && !s.includes(':') ? `file:///doc/${s}` : s),
}));

beforeEach(() => {
  mockDisposed.length = 0;
  mockFromURI.mockReset();
  mockCached.clear();
  mockDecodeFails = false;
  mockTransparent = false;
});

describe('measurePhoto with the cache file', () => {
  it('uses the cached shape without decoding the photo', async () => {
    const cached = { aspect: 1, bounds: { x0: 0, y0: 0, x1: 1, y1: 1 } };
    mockCached.set('photos/cached.png', cached);
    expect(await measurePhoto('photos/cached.png')).toEqual(cached);
    expect(mockFromURI).not.toHaveBeenCalled();
  });

  it('saves a new measurement under the relative path', async () => {
    mockFromURI.mockResolvedValue({ dispose: () => {} });
    const shape = await measurePhoto('photos/new.png');
    expect(mockFromURI).toHaveBeenCalledWith('file:///doc/photos/new.png');
    expect(mockCached.get('photos/new.png')).toEqual(shape);
  });

  it('does not save a photo that could not be decoded (may be temporary, e.g. low memory)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFromURI.mockResolvedValue({ dispose: () => {} });
    mockDecodeFails = true;
    expect(await measurePhoto('photos/undecodable.png')).toBeNull();
    expect(mockCached.has('photos/undecodable.png')).toBe(false);
    // 下次再量
    mockDecodeFails = false;
    expect(await measurePhoto('photos/undecodable.png')).not.toBeNull();
  });

  it('saves null for a fully transparent photo (nothing to measure, will not change)', async () => {
    mockFromURI.mockResolvedValue({ dispose: () => {} });
    mockTransparent = true;
    expect(await measurePhoto('photos/empty.png')).toBeNull();
    expect(mockCached.get('photos/empty.png')).toBeNull();
    expect(mockCached.has('photos/empty.png')).toBe(true);
  });

  it('does not save temp files or failed measurements', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFromURI.mockResolvedValueOnce({ dispose: () => {} }).mockRejectedValueOnce(new Error('not ready'));
    await measurePhoto('file:///cache/tmp.png');
    await measurePhoto('photos/broken.png');
    expect([...mockCached.keys()]).toEqual([]);
  });
});

describe('measurePhoto', () => {
  it('measures the visible area and releases every native object', async () => {
    mockFromURI.mockResolvedValue({ dispose: () => mockDisposed.push('data') });
    const shape = await measurePhoto('file:///a.png');
    expect(shape).toEqual({ aspect: 2, bounds: { x0: 0.5, y0: 0.5, x1: 0.75, y1: 1 }, mask: expect.any(String) });
    // 遮罩只在衣服的範圍（右下那塊）有 1
    expect(isMask(shape!.mask)).toBe(true);
    const at = (u: number, v: number) => shape!.mask![Math.floor(v * MASK_GRID) * MASK_GRID + Math.floor(u * MASK_GRID)];
    expect(at(0.6, 0.7)).toBe('1');
    expect(at(0.2, 0.2)).toBe('0');
    expect(mockDisposed.sort()).toEqual(['data', 'image', 'paint', 'snapshot', 'surface']);
  });

  it('measures the same photo only once', async () => {
    mockFromURI.mockResolvedValue({ dispose: () => {} });
    await measurePhoto('file:///b.png');
    await measurePhoto('file:///b.png');
    expect(mockFromURI).toHaveBeenCalledTimes(1);
  });

  it('returns null on failure and tries again next time', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFromURI.mockRejectedValueOnce(new Error('not ready')).mockResolvedValue({ dispose: () => {} });
    expect(await measurePhoto('file:///c.png')).toBeNull();
    expect(await measurePhoto('file:///c.png')).not.toBeNull();
    expect(mockFromURI).toHaveBeenCalledTimes(2);
  });

  it('is null without a photo', async () => {
    expect(await measurePhoto(null)).toBeNull();
  });
});
