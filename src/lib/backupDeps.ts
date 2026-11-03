import Constants from 'expo-constants';
import { useItemsVersion } from '@/db/ItemRepositoryContext';
import { MIGRATIONS } from '@/db/migrations';
import type { BackupStore } from '@/db/sqliteBackupStore';
import { useWeatherVersion } from '@/db/useWeather';
import { useSettingsStore } from '@/store/settingsStore';
import { backupFiles } from './backupPlatform';
import type { BackupDeps } from './backupService';
import { nowIso } from './ids';
import { adoptPhoto, deletePhotos, resolvePhotoUri } from './photoStorage';

/** 手機版實際使用的匯出／匯入依賴 */
export function createBackupDeps(store: BackupStore): BackupDeps {
  return {
    store,
    files: backupFiles,
    photos: {
      uri: rel => resolvePhotoUri(rel) ?? rel,
      adopt: adoptPhoto,
      remove: deletePhotos,
    },
    settings: {
      get: () => {
        const { language, county, currency, themeColor } = useSettingsStore.getState();
        return { language, county, currency, themeColor };
      },
      apply: s => useSettingsStore.getState().update({ ...s, town: '' }),
    },
    notify: () => {
      useItemsVersion.getState().bump();
      useWeatherVersion.getState().bump();
    },
    now: nowIso,
    appVersion: Constants.expoConfig?.version ?? '',
    schemaVersion: MIGRATIONS.length,
  };
}
