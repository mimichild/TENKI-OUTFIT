import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/useTheme';

export type ViewMode = 'day' | 'week' | 'month';
const MODES: ViewMode[] = ['day', 'week', 'month'];

/** 每日氣象頁右上：月曆圖示＋日／週／月 */
export function ViewModeSwitch({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const t = useT();
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Ionicons name="calendar-outline" size={18} color={theme.textMuted} accessible={false} importantForAccessibility="no" />
      <View style={[styles.group, { borderColor: theme.border }]} accessibilityRole="tablist" accessibilityLabel={t('view.label')}>
        {MODES.map(m => {
          const selected = m === mode;
          return (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityLabel={t(`view.${m}`)}
              accessibilityState={{ selected }}
              onPress={() => onChange(m)}
              style={[styles.option, selected && { backgroundColor: theme.primary }]}
            >
              <Text style={{ color: selected ? theme.onPrimary : theme.text, fontSize: 14 }}>{t(`view.${m}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  group: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  option: { paddingHorizontal: 14, paddingVertical: 5 },
});
