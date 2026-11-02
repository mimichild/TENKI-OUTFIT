import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';

interface Props {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  /** 顯示小圓點，表示目前有套用篩選 */
  active?: boolean;
}

export function HeaderIconButton({ icon, label, onPress, active }: Props) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={10} style={styles.button}>
      <Ionicons name={icon} size={22} color={theme.text} />
      {active && <View style={[styles.dot, { backgroundColor: theme.primary }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 16 },
  dot: { position: 'absolute', top: -2, right: 12, width: 8, height: 8, borderRadius: 4 },
});
