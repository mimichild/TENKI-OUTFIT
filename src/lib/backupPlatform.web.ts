import type { BackupFiles } from './backupService';

/** Web 預覽沒有本機檔案系統，不支援備份（畫面顯示「僅手機版支援」） */
export const backupSupported = false;
export const canSaveToFolder = false;

const unsupported = (): never => {
  throw new Error('backup is not supported on web');
};

export const backupFiles: BackupFiles = {
  workDir: unsupported,
  remove: unsupported,
  exists: unsupported,
  writeText: unsupported,
  readText: unsupported,
  copy: unsupported,
  zip: unsupported,
  listZip: unsupported,
  unzip: unsupported,
  exportTarget: unsupported,
};

export const shareBackup = async (_uri: string, _title: string): Promise<void> => unsupported();
export const saveBackupToFolder = async (_uri: string, _name: string): Promise<boolean> => unsupported();
export const pickBackupFile = async (): Promise<string | null> => unsupported();
