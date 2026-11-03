import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { BackupPanel, type BackupOps } from '@/components/BackupPanel';
import { useBackupStore } from '@/db/BackupStoreContext';
import { useT } from '@/i18n';
import { createBackupDeps } from '@/lib/backupDeps';
import { backupSupported, canSaveToFolder, pickBackupFile, saveBackupToFolder, shareBackup } from '@/lib/backupPlatform';
import { applyImport, exportBackup, prepareImport } from '@/lib/backupService';

export default function BackupScreen() {
  const t = useT();
  const store = useBackupStore();
  const shareTitle = t('backup.share');

  const ops = useMemo<BackupOps>(() => {
    const deps = store ? createBackupDeps(store) : null;
    const need = () => {
      if (!deps) throw new Error('backup store is not available');
      return deps;
    };
    return {
      supported: backupSupported && deps !== null,
      canSaveToFolder,
      createExport: () => exportBackup(need()),
      share: uri => shareBackup(uri, shareTitle),
      saveToFolder: saveBackupToFolder,
      pick: pickBackupFile,
      prepare: uri => prepareImport(need(), uri),
      apply: (prepared, mode) => applyImport(need(), prepared, mode),
    };
  }, [store, shareTitle]);

  return (
    <>
      <Stack.Screen options={{ title: t('backup.title') }} />
      <BackupPanel ops={ops} />
    </>
  );
}
