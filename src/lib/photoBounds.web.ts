import type { PieceShape } from './outfitLayout';

/** Web 預覽不量測，排版用整張照片 */
export function measurePhoto(_stored: string | null): Promise<PieceShape | null> {
  return Promise.resolve(null);
}
