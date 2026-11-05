import { Pressable, StyleSheet, Text, View, type AccessibilityRole } from 'react-native';
import { useTheme } from '@/theme/useTheme';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** tab：分類分頁、radio：單選、checkbox：複選、button：表單選項 */
  role?: Extract<AccessibilityRole, 'button' | 'tab' | 'radio' | 'checkbox'>;
  /** 標籤前面的色塊（顏色選項用） */
  swatch?: string;
  /**
   * 系統判斷的選擇（還沒手動選）：選中時用虛線框、淡色，標籤後面加 autoNote（例如「（系統判斷）」）；
   * 手動選了就是實心、深色
   */
  auto?: boolean;
  autoNote?: string;
}

export function Chip({ label, selected, onPress, role = 'button', swatch, auto = false, autoNote }: Props) {
  const theme = useTheme();
  const state = role === 'checkbox' ? { checked: selected } : { selected };
  const guessed = selected && auto;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={state}
      style={[
        styles.chip,
        swatch !== undefined && styles.withSwatch,
        { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface },
        guessed && { borderStyle: 'dashed', backgroundColor: theme.surface, opacity: 0.75 },
        selected && !auto && styles.manual,
        selected && !auto && swatch !== undefined && { paddingLeft: 9 },
      ]}
    >
      {swatch !== undefined && <View style={[styles.swatch, { backgroundColor: swatch, borderColor: theme.border }]} />}
      <Text style={[styles.text, { color: guessed ? theme.textMuted : selected ? theme.primaryText : theme.text }, selected && !auto && styles.manualText]}>
        {guessed && autoNote ? `${label}${autoNote}` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  text: { fontSize: 14, fontWeight: '500' },
  manual: { borderWidth: 2, paddingHorizontal: 13, paddingVertical: 6 },
  manualText: { fontWeight: '700' },
  withSwatch: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10 },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth },
});
