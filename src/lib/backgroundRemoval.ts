import TenkiBgRemoval from '../../modules/tenki-bg-removal';

/** 去背前先把照片縮到長邊這個大小：速度、記憶體與畫質的折衷 */
export const BG_REMOVAL_MAX_SIZE = 1600;
/** 原生端最多等 30 秒；JS 端再多留一點緩衝，避免表單永遠停在「去背中」 */
export const BG_REMOVAL_TIMEOUT_MS = 45_000;

/**
 * 沒去背成功時，originalUri 是「轉正＋縮到 1600px」的原圖（有原生模組才有）；
 * 呼叫端優先用它，避免把原尺寸照片丟進編輯器而記憶體不足、或 EXIF 方向沒套用而轉向
 */
type Fallback = { originalUri?: string };

export type BgRemovalResult =
  /** uri：去背 PNG；originalUri：同尺寸的縮小原圖（手動補回用） */
  | { status: 'ok'; uri: string; originalUri: string; width: number; height: number }
  /** 沒有原生模組或裝置不支援：呼叫端退回原圖 */
  | ({ status: 'unavailable' } & Fallback)
  /** 照片裡找不到主體 */
  | ({ status: 'noSubject' } & Fallback)
  | ({ status: 'failed'; error: unknown } & Fallback);

class TimeoutError extends Error {
  code = 'ERR_TIMEOUT';
}

function errorCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`Background removal timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 裝置端自動去背；不會丟出例外，結果一律以 status 表示 */
export async function removeBackground(uri: string): Promise<BgRemovalResult> {
  const native = TenkiBgRemoval;
  if (!native) return { status: 'unavailable' };

  const fallback = async (): Promise<Fallback> => {
    try {
      const r = await withTimeout(native.normalizeAsync(uri, BG_REMOVAL_MAX_SIZE), BG_REMOVAL_TIMEOUT_MS);
      return { originalUri: r.uri };
    } catch (e) {
      console.warn('轉正縮小原圖失敗，改用選到的照片', e);
      return {};
    }
  };

  let available: boolean;
  try {
    available = await native.isAvailableAsync();
  } catch (e) {
    console.warn('檢查去背支援失敗', e);
    available = false;
  }
  if (!available) return { status: 'unavailable', ...(await fallback()) };

  try {
    const r = await withTimeout(native.removeBackgroundAsync(uri, BG_REMOVAL_MAX_SIZE), BG_REMOVAL_TIMEOUT_MS);
    return { status: 'ok', uri: r.uri, originalUri: r.originalUri, width: r.width, height: r.height };
  } catch (e) {
    switch (errorCode(e)) {
      case 'ERR_NO_SUBJECT':
        return { status: 'noSubject', ...(await fallback()) };
      case 'ERR_UNAVAILABLE':
        return { status: 'unavailable', ...(await fallback()) };
      default:
        return { status: 'failed', error: e, ...(await fallback()) };
    }
  }
}
