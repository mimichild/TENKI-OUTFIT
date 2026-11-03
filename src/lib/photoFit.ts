import type { PieceShape } from './outfitLayout';

/** 單品照片外框比例：直式 3:4（寬 / 高） */
export const ITEM_PHOTO_ASPECT = 3 / 4;

/** 單品照片四周保留的空白（外框寬高的比例），衣服不會貼到邊 */
export const ITEM_PHOTO_MARGIN = 0.04;

export interface PhotoRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 算出整張照片要放多大、放在哪，才能讓「照片裡真正有衣服的範圍」等比放大填滿外框並置中。
 * 去背照片四周的透明留白每張都不一樣，用這個方式顯示，衣服大小就不受原照片影響。
 * shape 為 null（量不到、沒去背）時退回整張照片 contain。
 */
export function fitContent(
  shape: PieceShape | null,
  fallbackAspect: number,
  frameW: number,
  frameH: number,
  margin = ITEM_PHOTO_MARGIN,
): PhotoRect {
  if (frameW <= 0 || frameH <= 0) return { left: 0, top: 0, width: 0, height: 0 };
  const aspect = shape?.aspect ?? fallbackAspect;
  const b = shape?.bounds ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  // 衣服範圍的實際寬高比
  const contentAspect = (bw * aspect) / bh;
  const availW = frameW * (1 - 2 * margin);
  const availH = frameH * (1 - 2 * margin);
  const contentW = Math.min(availW, availH * contentAspect);
  const contentH = contentW / contentAspect;
  const width = contentW / bw;
  const height = contentH / bh;
  return {
    left: (frameW - contentW) / 2 - b.x0 * width,
    top: (frameH - contentH) / 2 - b.y0 * height,
    width,
    height,
  };
}
