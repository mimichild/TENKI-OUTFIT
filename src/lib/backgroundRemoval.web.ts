import type { BgRemovalResult } from './backgroundRemoval';

export type { BgRemovalResult } from './backgroundRemoval';
export const BG_REMOVAL_MAX_SIZE = 1600;
export const BG_REMOVAL_TIMEOUT_MS = 45_000;

// Web 預覽不做去背：一律退回原圖
export async function removeBackground(_uri: string): Promise<BgRemovalResult> {
  return { status: 'unavailable' };
}
