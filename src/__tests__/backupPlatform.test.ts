jest.mock('react-native-zip-archive', () => ({ zip: jest.fn(), unzip: jest.fn(), listContents: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }));
jest.mock('expo-file-system/legacy', () => ({ copyAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));

import { displayName, toPath } from '@/lib/backupPlatform';

describe('toPath', () => {
  it('file:// URI 轉成檔案路徑（解開中文、空白）', () => {
    expect(toPath('file:///data/user/0/cache/%E5%82%99%E4%BB%BD%20a.zip')).toBe('/data/user/0/cache/備份 a.zip');
  });
  it('沒有編碼的 % 不會丟例外', () => {
    expect(toPath('file:///cache/100%.zip')).toBe('/cache/100%.zip');
  });
  it('已經是路徑時原樣回傳', () => {
    expect(toPath('/cache/a.zip')).toBe('/cache/a.zip');
  });
});

describe('displayName', () => {
  it('從 SAF 的 content URI 取出實際檔名', () => {
    expect(displayName('content://com.android.externalstorage.documents/tree/primary%3ADownload/document/primary%3ADownload%2Ftenki-outfit-backup-20261103-1530%20(1).zip'))
      .toBe('tenki-outfit-backup-20261103-1530 (1).zip');
  });
  it('看不出檔名時回傳 null', () => {
    expect(displayName('content://com.google.android.apps.docs.storage/document/acc%3D1%3Bdoc%3Dencoded%3Dabc')).toBeNull();
  });
});
