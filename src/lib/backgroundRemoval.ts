import TenkiBgRemoval from '../../modules/tenki-bg-removal';

/** 去背前先把照片縮到長邊這個大小：速度、記憶體與畫質的折衷 */
export const BG_REMOVAL_MAX_SIZE = 1600;

export type BgRemovalResult =
  | { status: 'ok'; uri: string; width: number; height: number }
  /** 沒有原生模組或裝置不支援：呼叫端退回原圖 */
  | { status: 'unavailable' }
  /** 照片裡找不到主體 */
  | { status: 'noSubject' }
  | { status: 'failed'; error: unknown };

function errorCode(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}

/** 裝置端自動去背；不會丟出例外，結果一律以 status 表示 */
export async function removeBackground(uri: string): Promise<BgRemovalResult> {
  const native = TenkiBgRemoval;
  if (!native) return { status: 'unavailable' };

  try {
    if (!(await native.isAvailableAsync())) return { status: 'unavailable' };
  } catch (e) {
    console.warn('檢查去背支援失敗', e);
    return { status: 'unavailable' };
  }

  try {
    const { uri: out, width, height } = await native.removeBackgroundAsync(uri, BG_REMOVAL_MAX_SIZE);
    return { status: 'ok', uri: out, width, height };
  } catch (e) {
    switch (errorCode(e)) {
      case 'ERR_NO_SUBJECT':
        return { status: 'noSubject' };
      case 'ERR_UNAVAILABLE':
        return { status: 'unavailable' };
      default:
        return { status: 'failed', error: e };
    }
  }
}
