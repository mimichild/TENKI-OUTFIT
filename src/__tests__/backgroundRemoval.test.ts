import { BG_REMOVAL_MAX_SIZE, BG_REMOVAL_TIMEOUT_MS, removeBackground } from '@/lib/backgroundRemoval';

const mockNative: {
  module: null | {
    isAvailableAsync: jest.Mock;
    removeBackgroundAsync: jest.Mock;
    normalizeAsync: jest.Mock;
  };
} = { module: null };

jest.mock('../../modules/tenki-bg-removal', () => ({
  __esModule: true,
  get default() {
    return mockNative.module;
  },
}));

function coded(code: string): Error {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => {
  mockNative.module = {
    isAvailableAsync: jest.fn().mockResolvedValue(true),
    removeBackgroundAsync: jest
      .fn()
      .mockResolvedValue({
        uri: 'file:///cache/bg-removal/a.png',
        originalUri: 'file:///cache/bg-removal/a.jpg',
        width: 1200,
        height: 1600,
      }),
    normalizeAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/bg-removal/n.jpg', width: 1200, height: 1600 }),
  };
});

describe('removeBackground', () => {
  it('呼叫原生模組並帶入最大邊長，回傳去背圖與同尺寸的縮小原圖', async () => {
    const result = await removeBackground('file:///tmp/photo.jpg');
    expect(mockNative.module!.removeBackgroundAsync).toHaveBeenCalledWith(
      'file:///tmp/photo.jpg',
      BG_REMOVAL_MAX_SIZE,
    );
    expect(result).toEqual({
      status: 'ok',
      uri: 'file:///cache/bg-removal/a.png',
      originalUri: 'file:///cache/bg-removal/a.jpg',
      width: 1200,
      height: 1600,
    });
  });

  it('沒有原生模組（Expo Go / 測試環境）時回報不支援', async () => {
    mockNative.module = null;
    expect(await removeBackground('file:///tmp/photo.jpg')).toEqual({ status: 'unavailable' });
  });

  it('裝置不支援（iOS 17 以下、沒有 Play 服務）時回報不支援、不呼叫去背，但仍轉正縮小原圖', async () => {
    mockNative.module!.isAvailableAsync.mockResolvedValue(false);
    expect(await removeBackground('file:///tmp/photo.jpg')).toEqual({
      status: 'unavailable', originalUri: 'file:///cache/bg-removal/n.jpg',
    });
    expect(mockNative.module!.removeBackgroundAsync).not.toHaveBeenCalled();
  });

  it('照片裡找不到主體時回報 noSubject，並附上轉正縮小的原圖', async () => {
    mockNative.module!.removeBackgroundAsync.mockRejectedValue(coded('ERR_NO_SUBJECT'));
    expect(await removeBackground('file:///tmp/photo.jpg')).toEqual({
      status: 'noSubject', originalUri: 'file:///cache/bg-removal/n.jpg',
    });
    expect(mockNative.module!.normalizeAsync).toHaveBeenCalledWith('file:///tmp/photo.jpg', BG_REMOVAL_MAX_SIZE);
  });

  it('原生回報不支援錯誤碼時回報不支援', async () => {
    mockNative.module!.removeBackgroundAsync.mockRejectedValue(coded('ERR_UNAVAILABLE'));
    mockNative.module!.normalizeAsync.mockRejectedValue(new Error('decode'));
    // 轉正縮小也失敗：就不附 originalUri，呼叫端用選到的照片
    expect(await removeBackground('file:///tmp/photo.jpg')).toEqual({ status: 'unavailable' });
  });

  it('其他錯誤回報 failed 並附上錯誤', async () => {
    const error = coded('ERR_LOAD_IMAGE');
    mockNative.module!.removeBackgroundAsync.mockRejectedValue(error);
    expect(await removeBackground('file:///tmp/photo.jpg')).toEqual({
      status: 'failed', error, originalUri: 'file:///cache/bg-removal/n.jpg',
    });
  });

  it('檢查是否支援時出錯也回報不支援', async () => {
    mockNative.module!.isAvailableAsync.mockRejectedValue(new Error('boom'));
    expect(await removeBackground('file:///tmp/photo.jpg')).toMatchObject({ status: 'unavailable' });
  });

  it('去背太久沒回應（例如模型還在下載）時回報 failed，表單才不會一直鎖住', async () => {
    jest.useFakeTimers();
    try {
      mockNative.module!.removeBackgroundAsync.mockReturnValue(new Promise(() => {}));
      const pending = removeBackground('file:///tmp/photo.jpg');
      await jest.advanceTimersByTimeAsync(BG_REMOVAL_TIMEOUT_MS);
      expect(await pending).toMatchObject({ status: 'failed', originalUri: 'file:///cache/bg-removal/n.jpg' });
    } finally {
      jest.useRealTimers();
    }
  });
});
