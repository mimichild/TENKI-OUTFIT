import { measurePhoto } from '@/lib/photoBounds';

// jest.mock 會被提到 import 之前；工廠裡只在函式內用到 mock 開頭的變數
const mockDisposed: string[] = [];
const mockFromURI = jest.fn();

jest.mock('@shopify/react-native-skia', () => {
  const disposable = (name: string, extra: object = {}) => ({ ...extra, dispose: () => mockDisposed.push(name) });
  return {
    AlphaType: { Unpremul: 3 },
    ColorType: { RGBA_8888: 4 },
    Skia: {
      Data: { fromURI: (uri: string) => mockFromURI(uri) },
      Image: {
        MakeImageFromEncoded: () => disposable('image', { width: () => 4, height: () => 2 }),
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
              px[(1 * 4 + 2) * 4 + 3] = 255;
              return disposable('snapshot', { readPixels: () => px });
            },
          }),
      },
    },
  };
});


beforeEach(() => {
  mockDisposed.length = 0;
  mockFromURI.mockReset();
});

describe('measurePhoto', () => {
  it('measures the visible area and releases every native object', async () => {
    mockFromURI.mockResolvedValue({ dispose: () => mockDisposed.push('data') });
    const shape = await measurePhoto('file:///a.png');
    expect(shape).toEqual({ aspect: 2, bounds: { x0: 0.5, y0: 0.5, x1: 0.75, y1: 1 } });
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
