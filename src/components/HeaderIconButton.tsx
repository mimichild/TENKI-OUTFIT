import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { TAB_BAR_TEXT } from '@/theme/tabScreenOptions';

interface Props {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  /** 顯示小圓點，表示目前有套用篩選 */
  active?: boolean;
}

export function HeaderIconButton({ icon, label, onPress, active }: Props) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={10} style={styles.button}>
      <Ionicons name={icon} size={22} color={TAB_BAR_TEXT} />
      {active && <View style={[styles.dot, { backgroundColor: TAB_BAR_TEXT }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 16 },
  dot: { position: 'absolute', top: -2, right: 12, width: 8, height: 8, borderRadius: 4 },
});
