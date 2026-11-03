import type { PieceShape } from './outfitLayout';

export type { BoundsCache, BoundsCacheIo } from './photoBoundsCache';

/** Web 預覽不量測照片，也不保存快取 */
export const boundsCache = {
  get: async (_path: string): Promise<PieceShape | null | undefined> => undefined,
  set: async (_path: string, _shape: PieceShape | null): Promise<void> => {},
  remove: async (_paths: string[]): Promise<void> => {},
};
