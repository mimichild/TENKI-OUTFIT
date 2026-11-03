import { usePreventRemove } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { BackupPanel, type BackupOps } from '@/components/BackupPanel';
import { useBackupStore } from '@/db/BackupStoreContext';
import { useT } from '@/i18n';
import { createBackupDeps } from '@/lib/backupDeps';
import { backupSupported, canSaveToFolder, pickBackupFile, saveBackupToFolder, shareBackup } from '@/lib/backupPlatform';
import { applyImport, discardImport, exportBackup, prepareImport } from '@/lib/backupService';

export default function BackupScreen() {
  const t = useT();
  const store = useBackupStore();
  const shareTitle = t('backup.share');
  // 匯出／匯入進行中不能離開（返回鍵、手勢、導覽列返回）；作業本身在背景也有全域鎖保護
  const [busy, setBusy] = useState(false);
  usePreventRemove(busy, () => {});

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
      discard: prepared => discardImport(need(), prepared),
    };
  }, [store, shareTitle]);

  return (
    <>
      <Stack.Screen options={{ title: t('backup.title'), gestureEnabled: !busy, headerBackVisible: !busy }} />
      <BackupPanel ops={ops} onBusyChange={setBusy} />
    </>
  );
}
