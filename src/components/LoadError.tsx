import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/useTheme';

/** 讀取資料失敗時顯示；按「重試」重新讀取 */
export function LoadError({ onRetry, fill = false }: { onRetry: () => void; fill?: boolean }) {
  const t = useT();
  const theme = useTheme();
  return (
    <View style={[styles.container, fill && styles.fill]} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={36} color={theme.textMuted} accessible={false} importantForAccessibility="no" />
      <Text style={[styles.message, { color: theme.textMuted }]}>{t('common.loadFailed')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.retry')}
        onPress={onRetry}
        hitSlop={8}
        style={[styles.button, { borderColor: theme.primary }]}
      >
        <Ionicons name="refresh" size={16} color={theme.primaryText} accessible={false} importantForAccessibility="no" />
        <Text style={{ color: theme.primaryText, fontSize: 15, fontWeight: '600' }}>{t('common.retry')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 10, paddingVertical: 24, paddingHorizontal: 16 },
  fill: { flex: 1, justifyContent: 'center' },
  message: { fontSize: 15, textAlign: 'center' },
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
});
