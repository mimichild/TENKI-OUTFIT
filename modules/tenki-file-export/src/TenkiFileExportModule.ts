import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class TenkiFileExportModule extends NativeModule {
  /** 把 App 內的檔案（file://）串流複製到 SAF 建立的 content:// 檔案。錯誤碼：ERR_READ、ERR_WRITE */
  copyToContentUriAsync(fromUri: string, toUri: string): Promise<void>;
}

// 只有 Android；iOS、Web、單元測試為 null（iOS 用分享選單的「儲存到檔案」）
export default requireOptionalNativeModule<TenkiFileExportModule>('TenkiFileExport');
