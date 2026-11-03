import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useT } from '@/i18n';
import { useSettingsStore } from '@/store/settingsStore';
import type { Theme } from '@/theme/useTheme';

/**
 * 氣象署授權碼：先打在草稿，按「儲存」才寫入設定
 * （每打一個字就存的話，天氣頁會跟著用不完整的授權碼一直重抓）
 */
export function ApiKeyField({ theme }: { theme: Theme }) {
  const t = useT();
  const saved = useSettingsStore(s => s.cwaApiKey);
  const update = useSettingsStore(s => s.update);
  const [draft, setDraft] = useState(saved);
  const [visible, setVisible] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // 授權碼是開 App 後才從加密儲存區讀回來的，讀到時同步到草稿
  useEffect(() => setDraft(saved), [saved]);

  const dirty = draft.trim() !== saved;
  const status = dirty ? t('settings.keyUnsaved') : justSaved ? t('settings.keySaved') : saved ? t('settings.keySet') : null;

  const save = () => {
    update({ cwaApiKey: draft });
    setJustSaved(true);
    Keyboard.dismiss();
  };

  return (
    <View style={styles.root}>
      <View style={styles.inputRow}>
        <TextInput
          value={draft}
          onChangeText={text => {
            setDraft(text);
            setJustSaved(false);
          }}
          onSubmitEditing={() => dirty && save()}
          placeholder={t('settings.cwaApiKeyPlaceholder')}
          placeholderTextColor={theme.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          secureTextEntry={!visible}
          returnKeyType="done"
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          accessibilityLabel={t('settings.cwaApiKey')}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(visible ? 'settings.hideKey' : 'settings.showKey')}
          onPress={() => setVisible(v => !v)}
          hitSlop={8}
          style={styles.eye}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} color={theme.textMuted} />
        </Pressable>
      </View>
      <View style={styles.footer}>
        <Text style={[styles.status, { color: dirty ? theme.text : theme.textMuted }]}>{status}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.saveKey')}
          accessibilityState={{ disabled: !dirty }}
          disabled={!dirty}
          onPress={save}
          style={[styles.save, { backgroundColor: dirty ? theme.primary : theme.border }]}
        >
          <Text style={styles.saveText}>{t('settings.save')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  eye: { padding: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  status: { flex: 1, fontSize: 13 },
  save: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 16 },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
