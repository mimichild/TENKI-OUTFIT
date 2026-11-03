import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { formatPrice } from '@/lib/currency';
import { outfitTotal } from '@/lib/outfitTotals';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/useTheme';
import type { Outfit } from '@/types/models';
import { OutfitCanvasView } from './OutfitCanvasView';

/** 一套穿搭：唯讀畫布＋總金額，點了打開編輯 */
export function OutfitCard({ outfit, width, onPress, compact = false }: {
  outfit: Outfit; width: number; onPress: () => void; compact?: boolean;
}) {
  const t = useT();
  const theme = useTheme();
  const currency = useSettingsStore(s => s.currency);
  const total = formatPrice(outfitTotal(outfit.pieces), currency);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('outfit.openLabel', { count: outfit.pieces.length, total })}
      onPress={onPress}
      style={[styles.card, { borderColor: theme.border, width }]}
    >
      <OutfitCanvasView pieces={outfit.pieces} width={width - 2} />
      {!compact && (
        <View style={[styles.footer, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.total, { color: theme.text }]}>{t('outfit.total', { amount: total })}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8 },
  total: { fontSize: 14, fontWeight: '600', textAlign: 'right' },
});
