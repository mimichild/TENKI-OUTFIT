import { NativeModule, requireOptionalNativeModule } from 'expo';

export type BgRemovalNativeResult = { uri: string; width: number; height: number };

declare class TenkiBgRemovalModule extends NativeModule {
  /** iOS 17+（Vision 前景遮罩）或 Android 有 Google Play 服務時為 true */
  isAvailableAsync(): Promise<boolean>;
  /**
   * 去背：先依 EXIF 轉正並縮到長邊 maxSize，再產生透明背景 PNG（存在 cache/bg-removal/）。
   * 輸出與縮小後的原圖同尺寸、不裁切，之後手動修改遮罩時可與原圖對齊。
   * 錯誤碼：ERR_NO_SUBJECT（找不到主體）、ERR_UNAVAILABLE、ERR_LOAD_IMAGE、ERR_SEGMENTATION
   */
  removeBackgroundAsync(uri: string, maxSize: number): Promise<BgRemovalNativeResult>;
}

// Expo Go、Web、單元測試沒有這個原生模組 → null，由 JS 包裝層退回原圖
export default requireOptionalNativeModule<TenkiBgRemovalModule>('TenkiBgRemoval');
