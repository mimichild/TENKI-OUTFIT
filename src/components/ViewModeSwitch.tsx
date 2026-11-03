import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { TAB_BAR_TEXT } from '@/theme/tabScreenOptions';
import { useTheme } from '@/theme/useTheme';

export type ViewMode = 'day' | 'week' | 'month';
const MODES: ViewMode[] = ['day', 'week', 'month'];

/** 天氣穿搭頁標題列右側：月曆圖示＋日／週／月（底色是主題色，所以用白色系） */
export function ViewModeSwitch({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const t = useT();
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Ionicons name="calendar-outline" size={18} color={TAB_BAR_TEXT} accessible={false} importantForAccessibility="no" />
      <View style={[styles.group, { borderColor: `${TAB_BAR_TEXT}99` }]} accessibilityRole="tablist" accessibilityLabel={t('view.label')}>
        {MODES.map(m => {
          const selected = m === mode;
          return (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityLabel={t(`view.${m}`)}
              accessibilityState={{ selected }}
              onPress={() => onChange(m)}
              style={[styles.option, selected && { backgroundColor: TAB_BAR_TEXT }]}
            >
              <Text style={{ color: selected ? theme.primaryText : TAB_BAR_TEXT, fontSize: 14 }}>{t(`view.${m}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 },
  group: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  option: { paddingHorizontal: 14, paddingVertical: 5 },
});
