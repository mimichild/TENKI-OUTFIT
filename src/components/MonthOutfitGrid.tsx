import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT, type TranslationKey } from '@/i18n';
import { monthGrid, monthOf } from '@/lib/calendar';
import { CANVAS_HEIGHT_RATIO } from '@/lib/outfitCanvas';
import { useTheme } from '@/theme/useTheme';
import type { Outfit } from '@/types/models';
import { OutfitCanvasView } from './OutfitCanvasView';

/** 每格左右留的空隙 */
const GAP = 2;

interface Props {
  /** YYYY-MM */
  month: string;
  today: string;
  outfitsOn: (date: string) => Outfit[];
  /** 日期的顯示文字（無障礙標籤用） */
  labelOf: (date: string) => string;
  /** 點有穿搭的日子：打開那天的日檢視 */
  onOpenDay: (date: string) => void;
  /** 點沒有穿搭的日子：新增那天的穿搭 */
  onAdd: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

/** 天氣穿搭頁的月檢視：每一天用縮小版的穿搭呈現，沒有穿搭的日子顯示 ＋ */
export function MonthOutfitGrid({ month, today, outfitsOn, labelOf, onOpenDay, onAdd, onPrev, onNext }: Props) {
  const t = useT();
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [y, m] = month.split('-').map(Number);
  const weeks = monthGrid(month);
  const thumbWidth = Math.max(0, width / 7 - GAP * 2);
  const thumbHeight = thumbWidth * CANVAS_HEIGHT_RATIO;

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.prevMonth')} onPress={onPrev} hitSlop={10} style={styles.nav}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header" accessibilityLiveRegion="polite">
          {t('calendar.monthLabel', { y, m })}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('calendar.nextMonth')} onPress={onNext} hitSlop={10} style={styles.nav}>
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {[0, 1, 2, 3, 4, 5, 6].map(wd => (
          <Text key={wd} style={[styles.weekday, { color: theme.textMuted }]}>{t(`weather.wd${wd}` as TranslationKey)}</Text>
        ))}
      </View>
      {weeks.map(week => (
        <View key={week[0]} style={[styles.row, styles.week, { borderColor: theme.border }]}>
          {week.map(date => {
            const inMonth = monthOf(date) === month;
            const isToday = date === today;
            const outfits = inMonth ? outfitsOn(date) : [];
            const thumb = { width: thumbWidth, height: thumbHeight };
            return (
              <View key={date} style={styles.cell}>
                <View style={[styles.dayNumber, isToday && { backgroundColor: theme.primary }]}>
                  <Text style={{ color: isToday ? theme.onPrimary : inMonth ? theme.text : theme.textMuted, fontSize: 13, opacity: inMonth ? 1 : 0.4 }}>
                    {Number(date.slice(8))}
                  </Text>
                </View>
                {!inMonth ? (
                  <View style={thumb} />
                ) : outfits.length > 0 ? (
                  <Pressable
                    testID={`month-outfit-${date}`}
                    accessibilityRole="button"
                    accessibilityLabel={t('calendar.showDay', { date: labelOf(date) })}
                    onPress={() => onOpenDay(date)}
                    style={[styles.thumb, thumb, { borderColor: theme.border }]}
                  >
                    <OutfitCanvasView
                      pieces={outfits[0].pieces}
                      width={Math.min(thumbWidth - 2, (thumbHeight - 2) / outfits[0].canvasRatio)}
                      ratio={outfits[0].canvasRatio}
                    />
                    {outfits.length > 1 && (
                      <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                        <Text style={[styles.badgeText, { color: theme.onPrimary }]}>{outfits.length}</Text>
                      </View>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('calendar.addOutfit', { date: labelOf(date) })}
                    onPress={() => onAdd(date)}
                    style={[styles.thumb, styles.empty, thumb, { backgroundColor: theme.primarySoft, borderColor: 'transparent' }]}
                  >
                    <Ionicons name="add" size={20} color={theme.textMuted} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  nav: { padding: 6 },
  title: { fontSize: 17, fontWeight: '600' },
  row: { flexDirection: 'row' },
  week: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, paddingVertical: 4 },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
  dayNumber: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  // 縮圖框固定 3:4；比較長的穿搭縮窄後置中
  thumb: { borderRadius: 6, borderWidth: 1, overflow: 'hidden', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 2, bottom: 2, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
});
