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
}

export function Chip({ label, selected, onPress, role = 'button', swatch }: Props) {
  const theme = useTheme();
  const state = role === 'checkbox' ? { checked: selected } : { selected };
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
      ]}
    >
      {swatch !== undefined && <View style={[styles.swatch, { backgroundColor: swatch, borderColor: theme.border }]} />}
      <Text style={[styles.text, { color: selected ? theme.primaryText : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  text: { fontSize: 14, fontWeight: '500' },
  withSwatch: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10 },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth },
});
