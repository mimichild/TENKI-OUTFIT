import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { formatPrice } from '@/lib/currency';
import { outfitTotal } from '@/lib/outfitTotals';
import { useSettingsStore } from '@/store/settingsStore';
import { useTheme } from '@/theme/useTheme';
import type { Outfit } from '@/types/models';
import { OutfitCanvasView } from './OutfitCanvasView';

/** 下方總金額列的高度 */
export const OUTFIT_CARD_FOOTER_HEIGHT = 40;

/**
 * 一套穿搭：唯讀畫布＋總金額，點了打開編輯。
 * 給 height 時是「滿版」：畫布左右貼齊、整張卡剛好這個高度（不管這套穿搭原本的比例）。
 */
export function OutfitCard({ outfit, width, height, onPress, compact = false }: {
  outfit: Outfit; width: number; height?: number; onPress: () => void; compact?: boolean;
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
      style={[styles.card, height !== undefined && styles.bleed, { borderColor: theme.border, width }]}
    >
      {height !== undefined ? (
        <OutfitCanvasView pieces={outfit.pieces} width={width} ratio={Math.max(0, height - OUTFIT_CARD_FOOTER_HEIGHT) / width} />
      ) : (
        <OutfitCanvasView pieces={outfit.pieces} width={width - 2} ratio={outfit.canvasRatio} />
      )}
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
  bleed: { borderWidth: 0, borderRadius: 0 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, height: OUTFIT_CARD_FOOTER_HEIGHT, justifyContent: 'center' },
  total: { fontSize: 14, fontWeight: '600', textAlign: 'right' },
});
