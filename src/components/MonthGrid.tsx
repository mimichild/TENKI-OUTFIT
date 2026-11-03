import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT, type TranslationKey } from '@/i18n';
import { monthGrid, monthOf } from '@/lib/calendar';
import { useTheme } from '@/theme/useTheme';

interface Props {
  /** YYYY-MM */
  month: string;
  today: string;
  selected?: string | null;
  /** 有排穿搭的日子，顯示小圓點 */
  marked?: ReadonlySet<string>;
  onSelect: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

export function MonthGrid({ month, today, selected, marked, onSelect, onPrev, onNext }: Props) {
  const t = useT();
  const theme = useTheme();
  const [y, m] = month.split('-').map(Number);
  const weeks = monthGrid(month);

  return (
    <View>
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
        <View key={week[0]} style={styles.row}>
          {week.map(date => {
            const inMonth = monthOf(date) === month;
            const isSelected = date === selected;
            const isToday = date === today;
            const day = Number(date.slice(8));
            const hasOutfit = marked?.has(date) ?? false;
            return (
              <Pressable
                key={date}
                testID={`day-${date}`}
                accessibilityRole="button"
                accessibilityLabel={`${Number(date.slice(5, 7))}/${day}${isToday ? ` ${t('weather.today')}` : ''}${hasOutfit ? ` ${t('calendar.hasOutfit')}` : ''}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelect(date)}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.dayCircle,
                    isToday && { borderColor: theme.primary, borderWidth: 1 },
                    isSelected && { backgroundColor: theme.primary },
                  ]}
                >
                  <Text style={{ color: isSelected ? '#FFFFFF' : inMonth ? theme.text : theme.textMuted, fontSize: 15, opacity: inMonth ? 1 : 0.5 }}>
                    {day}
                  </Text>
                </View>
                <View style={[styles.dot, { backgroundColor: hasOutfit ? theme.primary : 'transparent' }]} />
              </Pressable>
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
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, paddingVertical: 4 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 3 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderColor: 'transparent' },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
});
