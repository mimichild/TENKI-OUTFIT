import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useT, type TranslationKey } from '@/i18n';
import type { ImportMode, PrepareResult, PreparedImport } from '@/lib/backupService';
import { useTheme, type Theme } from '@/theme/useTheme';

/** 備份頁用到的操作；app/backup.tsx 接上實際的檔案、zip 與資料庫，測試用假的 */
export interface BackupOps {
  supported: boolean;
  canSaveToFolder: boolean;
  createExport(): Promise<{ uri: string; fileName: string }>;
  share(uri: string): Promise<void>;
  /** 使用者取消選資料夾時回傳 false */
  saveToFolder(uri: string, fileName: string): Promise<boolean>;
  /** 取消時回傳 null */
  pick(): Promise<string | null>;
  prepare(uri: string): Promise<PrepareResult>;
  apply(prepared: PreparedImport, mode: ImportMode): Promise<{ items: number; outfits: number }>;
}

type ExportState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'saved'; name: string } | { kind: 'failed' };
type ImportState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'rejected'; message: TranslationKey }
  | { kind: 'ready'; prepared: PreparedImport }
  | { kind: 'importing' }
  | { kind: 'done'; items: number; outfits: number }
  | { kind: 'failed' };

const REJECTED: Record<Exclude<PrepareResult, { ok: true }>['reason'], TranslationKey> = {
  notBackup: 'backup.notBackup',
  newerVersion: 'backup.newerVersion',
  corrupt: 'backup.corrupt',
};

const DANGER = '#D93025';

/** 台灣時間 YYYY/MM/DD HH:mm */
function formatExportedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = new Date(d.getTime() + 8 * 3_600_000).toISOString();
  return `${s.slice(0, 10).replaceAll('-', '/')} ${s.slice(11, 16)}`;
}

export function BackupPanel({ ops }: { ops: BackupOps }) {
  const t = useT();
  const theme = useTheme();
  const [exp, setExp] = useState<ExportState>({ kind: 'idle' });
  const [imp, setImp] = useState<ImportState>({ kind: 'idle' });
  const [mode, setMode] = useState<ImportMode | null>(null);
  const [armed, setArmed] = useState(false);
  // 匯出／匯入進行中不接受第二次操作（state 更新前的連點）
  const busy = useRef(false);

  if (!ops.supported) {
    return (
      <View style={[styles.unsupported, { backgroundColor: theme.background }]}>
        <Ionicons name="phone-portrait-outline" size={40} color={theme.textMuted} />
        <Text style={{ color: theme.textMuted, fontSize: 15 }}>{t('backup.unsupported')}</Text>
      </View>
    );
  }

  const guarded = async (fn: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await fn();
    } finally {
      busy.current = false;
    }
  };

  const runExport = (target: 'share' | 'folder') =>
    guarded(async () => {
      setExp({ kind: 'busy' });
      try {
        const { uri, fileName } = await ops.createExport();
        if (target === 'share') {
          await ops.share(uri);
          setExp({ kind: 'idle' });
        } else {
          const saved = await ops.saveToFolder(uri, fileName);
          setExp(saved ? { kind: 'saved', name: fileName } : { kind: 'idle' });
        }
      } catch (e) {
        console.warn('匯出備份失敗', e);
        setExp({ kind: 'failed' });
      }
    });

  const pick = () =>
    guarded(async () => {
      setMode(null);
      setArmed(false);
      try {
        const uri = await ops.pick();
        if (!uri) return;
        setImp({ kind: 'reading' });
        const r = await ops.prepare(uri);
        setImp(r.ok ? { kind: 'ready', prepared: r } : { kind: 'rejected', message: REJECTED[r.reason] });
      } catch (e) {
        console.warn('讀取備份失敗', e);
        setImp({ kind: 'rejected', message: 'backup.readFailed' });
      }
    });

  const choose = (m: ImportMode) => {
    setMode(m);
    setArmed(false);
  };

  const runImport = (prepared: PreparedImport) => {
    if (!mode) return;
    if (!armed) return setArmed(true);
    return guarded(async () => {
      setImp({ kind: 'importing' });
      try {
        const r = await ops.apply(prepared, mode);
        setImp({ kind: 'done', ...r });
      } catch (e) {
        console.warn('匯入備份失敗', e);
        setImp({ kind: 'failed' });
      } finally {
        setMode(null);
        setArmed(false);
      }
    });
  };

  const cancel = () => {
    setImp({ kind: 'idle' });
    setMode(null);
    setArmed(false);
  };

  const exporting = exp.kind === 'busy';
  const importing = imp.kind === 'reading' || imp.kind === 'importing';
  const locked = exporting || importing;
  const importLabel = armed ? t(mode === 'replace' ? 'backup.confirmReplace' : 'backup.confirmMerge') : t('backup.import');

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Card theme={theme} title={t('backup.exportTitle')}>
        <Text style={[styles.hint, { color: theme.textMuted }]}>{t('backup.exportHint')}</Text>
        <View style={styles.buttons}>
          <Button theme={theme} icon="share-outline" label={t('backup.share')} onPress={() => runExport('share')} disabled={locked} />
          {ops.canSaveToFolder && (
            <Button theme={theme} icon="folder-outline" label={t('backup.saveToFolder')} onPress={() => runExport('folder')} disabled={locked} />
          )}
        </View>
        {exporting && <Status theme={theme} busy text={t('backup.exporting')} />}
        {exp.kind === 'saved' && <Status theme={theme} text={t('backup.saved', { name: exp.name })} />}
        {exp.kind === 'failed' && <Status theme={theme} error text={t('backup.exportFailed')} />}
      </Card>

      <Card theme={theme} title={t('backup.importTitle')}>
        <Text style={[styles.hint, { color: theme.textMuted }]}>{t('backup.importHint')}</Text>
        <View style={styles.buttons}>
          <Button theme={theme} icon="document-outline" label={t('backup.pick')} onPress={pick} disabled={locked} />
        </View>
        {imp.kind === 'reading' && <Status theme={theme} busy text={t('backup.reading')} />}
        {imp.kind === 'rejected' && <Status theme={theme} error text={t(imp.message)} />}
        {imp.kind === 'ready' && (
          <View style={styles.ready}>
            <Text style={[styles.summary, { color: theme.text }]}>
              {t('backup.summary', {
                date: formatExportedAt(imp.prepared.manifest.exportedAt),
                ...imp.prepared.summary,
              })}
            </Text>
            <Text style={[styles.hint, { color: theme.textMuted }]}>{t('backup.chooseMode')}</Text>
            <View accessibilityRole="radiogroup" style={styles.modes}>
              {(['replace', 'merge'] as const).map(m => (
                <ModeOption
                  key={m}
                  theme={theme}
                  selected={mode === m}
                  title={t(m === 'replace' ? 'backup.modeReplace' : 'backup.modeMerge')}
                  hint={t(m === 'replace' ? 'backup.modeReplaceHint' : 'backup.modeMergeHint')}
                  onPress={() => choose(m)}
                />
              ))}
            </View>
            <View style={styles.buttons}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={importLabel}
                accessibilityState={{ disabled: mode === null }}
                disabled={mode === null}
                onPress={() => runImport(imp.prepared)}
                style={[
                  styles.button,
                  mode === null
                    ? { borderColor: theme.border }
                    : armed
                      ? { borderColor: DANGER, backgroundColor: DANGER }
                      : { borderColor: theme.primary, backgroundColor: theme.primary },
                ]}
              >
                <Text style={{ color: mode === null ? theme.textMuted : '#FFFFFF', fontSize: 15, fontWeight: '600' }}>{importLabel}</Text>
              </Pressable>
              <Button theme={theme} label={t('backup.cancel')} onPress={cancel} />
            </View>
          </View>
        )}
        {imp.kind === 'importing' && <Status theme={theme} busy text={t('backup.importing')} />}
        {imp.kind === 'done' && <Status theme={theme} text={t('backup.imported', { items: imp.items, outfits: imp.outfits })} />}
        {imp.kind === 'failed' && <Status theme={theme} error text={t('backup.importFailed')} />}
      </Card>
    </ScrollView>
  );
}

function Card({ theme, title, children }: { theme: Theme; title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textMuted }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</View>
    </View>
  );
}

interface ButtonProps {
  theme: Theme;
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}

function Button({ theme, label, onPress, icon, disabled }: ButtonProps) {
  const color = disabled ? theme.textMuted : theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { borderColor: disabled ? theme.border : theme.primary }]}
    >
      {icon && <Ionicons name={icon} size={18} color={color} />}
      <Text style={{ color, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

function ModeOption(props: { theme: Theme; selected: boolean; title: string; hint: string; onPress: () => void }) {
  const { theme, selected, title, hint, onPress } = props;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${title}，${hint}`}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.mode, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : 'transparent' }]}
    >
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? theme.primary : theme.textMuted} />
      <View style={styles.modeText}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>{hint}</Text>
      </View>
    </Pressable>
  );
}

function Status({ theme, text, busy, error }: { theme: Theme; text: string; busy?: boolean; error?: boolean }) {
  return (
    <View style={styles.status} accessibilityLiveRegion="polite">
      {busy && <ActivityIndicator size="small" color={theme.primary} />}
      <Text style={{ color: error ? DANGER : theme.text, fontSize: 14, flexShrink: 1 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  hint: { fontSize: 13 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  ready: { gap: 10 },
  summary: { fontSize: 15 },
  modes: { gap: 8 },
  mode: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'flex-start' },
  modeText: { flex: 1, gap: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unsupported: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
});
